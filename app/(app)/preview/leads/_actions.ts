"use server";

// Hayk 2026-07-12 — Customer search for the New Quote flow.
// Before building a quote you pick WHO it's for: search existing customers by
// name / company / phone / email, or create a new one. READ-ONLY search over the
// real `customers` table (+ a quick order/lifetime rollup so returning customers
// are obvious). LOCAL shared DB.

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// Create a real lead: match/create the customer, insert the lead as a New Lead.
export async function createLead(input: {
  name: string; company?: string; phone?: string; email?: string;
  source?: string; products?: string[]; quantity?: number | null;
  urgency?: string; notes?: string;
}): Promise<{ ok: boolean; leadId?: string; error?: string }> {
  const admin = createAdminClient();
  const tenantRes = await admin.from("orders").select("tenant_id").not("specs->>quote_ref", "is", null).limit(1).single();
  const tenant = (tenantRes.data as { tenant_id: string } | null)?.tenant_id;
  if (!tenant) return { ok: false, error: "no tenant" };

  // Match an existing customer by phone or email, else create one.
  let customerId: string | null = null;
  const phoneDigits = (input.phone || "").replace(/\D+/g, "");
  if (phoneDigits.length >= 7 || input.email) {
    const ors: string[] = [];
    if (input.email) ors.push(`email.ilike.%${input.email}%`);
    if (phoneDigits.length >= 7) ors.push(`phone.ilike.%${phoneDigits}%`);
    if (ors.length) {
      const { data } = await admin.from("customers").select("id").or(ors.join(",")).limit(1);
      customerId = ((data ?? [])[0] as { id: string } | undefined)?.id ?? null;
    }
  }
  if (!customerId) {
    const { data, error } = await admin.from("customers")
      .insert({ tenant_id: tenant, name: input.name || "New lead", company: input.company || null, phone: input.phone || null, email: input.email || null })
      .select("id").single();
    if (error) return { ok: false, error: error.message };
    customerId = (data as { id: string }).id;
  }

  const src = (input.source || "").toLowerCase();
  const sourceVal = src.includes("insta") ? "instagram" : src.includes("web") ? "website" : src.includes("refer") ? "referral" : src.includes("email") ? "email" : src.includes("phone") || src.includes("call") ? "phone_call" : src.includes("walk") ? "walk-in" : "website";
  const urgVal = (input.urgency || "").toLowerCase().startsWith("high") ? "High" : (input.urgency || "").toLowerCase().startsWith("low") ? "Low" : "Medium";
  const interests = input.products && input.products.length ? { products: input.products } : {};
  const quantities = input.quantity ? { total: input.quantity } : {};

  const sdrRes = await admin.from("profiles").select("id").eq("full_name", "Manny").limit(1).single();
  const sdrId = (sdrRes.data as { id: string } | null)?.id ?? null;

  const { data: lead, error } = await admin.from("leads")
    .insert({ customer_id: customerId, source: sourceVal, status: "New Lead", urgency: urgVal, interests, quantities, is_inbox: true, is_returning_customer: false, sdr_id: sdrId, sdr_comment: input.notes || null })
    .select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/preview/leads");
  revalidatePath("/preview/sales-pipeline");
  return { ok: true, leadId: (lead as { id: string }).id };
}

export type CustomerHit = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  orders: number;       // how many quote/order tickets they have
  lifetime: number;     // total ticket value
};

export async function searchCustomers(query: string): Promise<CustomerHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const admin = createAdminClient();

  // Match name / company / phone / email. Phone match strips formatting.
  const digits = q.replace(/\D+/g, "");
  const ors = [`name.ilike.%${q}%`, `company.ilike.%${q}%`, `email.ilike.%${q}%`];
  if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`, `phone.ilike.%${q}%`);

  const { data: custs } = await admin
    .from("customers")
    .select("id, name, company, phone, email")
    .or(ors.join(","))
    .limit(8);

  const rows = (custs ?? []) as Array<{ id: string; name: string | null; company: string | null; phone: string | null; email: string | null }>;
  if (rows.length === 0) return [];

  // Lifetime + order count from their tickets (one query, grouped in JS).
  const ids = rows.map(r => r.id);
  const { data: tickets } = await admin
    .from("job_tickets")
    .select("customer_id, quote_final_total, total, ticket_kind")
    .in("customer_id", ids);

  const roll = new Map<string, { orders: number; lifetime: number }>();
  for (const t of (tickets ?? []) as Array<{ customer_id: string | null; quote_final_total: number | null; total: number | null; ticket_kind: string | null }>) {
    if (!t.customer_id) continue;
    const val = Number(t.quote_final_total ?? 0) || Number(t.total ?? 0);
    const r = roll.get(t.customer_id) ?? { orders: 0, lifetime: 0 };
    r.lifetime += val;
    if ((t.ticket_kind ?? "").toLowerCase() === "order" || (t.ticket_kind ?? "").toLowerCase() === "quote") r.orders += 1;
    roll.set(t.customer_id, r);
  }

  return rows.map(r => ({
    id: r.id,
    name: r.name?.trim() || "(unnamed)",
    company: r.company,
    phone: r.phone,
    email: r.email,
    orders: roll.get(r.id)?.orders ?? 0,
    lifetime: Math.round((roll.get(r.id)?.lifetime ?? 0) * 100) / 100,
  }));
}
