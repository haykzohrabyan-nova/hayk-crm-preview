import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { digitsOnly } from "@/lib/utils/phone";

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("*, leads(id, status, sales_status, updated_at)")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  type LeadRow = { id: string; status: string; sales_status: string | null; updated_at: string };

  // Only surface customers that have at least one lead that has been routed to
  // Sales (status = "Routed") or has an active sales status. Customers whose
  // leads are still Pending / On Hold (SDR side) / Rejected are not yet CRM
  // contacts — they enter the CRM the moment the SDR routes the lead.
  let customers = (data ?? [])
    .filter((c) =>
      (c.leads ?? []).some(
        (l: LeadRow) => l.status === "Routed" || l.sales_status != null
      )
    )
    .map((c) => {
      const leads = (c.leads ?? []) as LeadRow[];
      const lead_count = leads.length;
      const last_activity = leads.reduce(
        (latest, l) => (l.updated_at > latest ? l.updated_at : latest),
        c.updated_at as string
      );
      const customer_status = lead_count === 0 ? "new" : "known";
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { leads: _leads, ...rest } = c;
      return { ...rest, lead_count, last_activity, customer_status };
    });

  if (search) {
    customers = customers.filter(
      (c) =>
        c.first_name?.toLowerCase().includes(search) ||
        c.last_name?.toLowerCase().includes(search) ||
        c.email?.toLowerCase().includes(search) ||
        c.phone?.includes(search) ||
        c.company?.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ customers });
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const body = await request.json();
  const { first_name, last_name, email, phone, company, industry, website } = body;

  if (!phone) {
    return NextResponse.json(
      { error: "Phone is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .insert({
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      email: email ?? null,
      phone: digitsOnly(phone),
      company: company ?? null,
      industry: industry ?? null,
      website: website ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ customer: data }, { status: 201 });
}
