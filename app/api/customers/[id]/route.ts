import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeAuthority } from "@/lib/utils/authority";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";
import {
  fetchKeyAccountRepForDisplay,
  resolveActiveKeyAccountSalesRep,
} from "@/lib/utils/resolve-key-account-sales-rep";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/crm");
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const admin = createAdminClient();

  const [customerResult, leadsResult] = await Promise.all([
    admin.from("customers").select("*").eq("id", id).single(),
    admin
      .from("leads")
      .select(
        "id, status, sales_status, source, urgency, interests, quantities, created_at, updated_at, sdr_id, rejection_reason, tickets:job_tickets(id, reference_code, ticket_kind, ticket_status)",
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (customerResult.error || !customerResult.data) {
    return NextResponse.json({ error: "Customer not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const leads = leadsResult.data ?? [];
  const lead_count = leads.length;
  const customer_status = lead_count === 0 ? "new" : "known";
  const key_account_rep = await fetchKeyAccountRepForDisplay(
    admin,
    customerResult.data.key_account_sales_rep_id,
  );

  return NextResponse.json({
    customer: customerResult.data,
    leads,
    lead_count,
    customer_status,
    key_account_rep,
  });
}

const ALLOWED_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "company",
  "industry",
  "website",
  "authority",
  "heat_tag",
  "key_account_sales_rep_id",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/crm");
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if ("key_account_sales_rep_id" in body && roleName !== "admin") {
    return NextResponse.json(
      { error: "Only admins may assign a Key Account rep.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  // Strip disallowed fields
  const update: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      if (field === "phone") {
        update[field] = digitsOnly(String(body[field] ?? ""));
      } else if (field === "authority") {
        update[field] = normalizeAuthority(String(body[field] ?? ""));
      } else if (field === "key_account_sales_rep_id") {
        const raw = body[field];
        if (raw === null || raw === "" || raw === undefined) {
          update[field] = null;
        } else {
          update[field] = String(raw);
        }
      } else if (field === "website") {
        const raw = String(body[field] ?? "").trim();
        if (raw) {
          const websiteErr = validateWebsite(raw);
          if (websiteErr) {
            return NextResponse.json({ error: websiteErr, code: "VALIDATION_ERROR" }, { status: 400 });
          }
          update[field] = normalizeWebsite(raw);
        } else {
          update[field] = null;
        }
      } else {
        update[field] = body[field];
      }
    }
  }

  if (!Object.keys(update).length) {
    return NextResponse.json(
      { error: "No valid fields to update.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  if (update.key_account_sales_rep_id) {
    const { data: rep, error: repErr } = await admin
      .from("user_profiles_with_role")
      .select("id")
      .eq("id", update.key_account_sales_rep_id as string)
      .eq("role_name", "sales")
      .eq("is_active", true)
      .maybeSingle();

    if (repErr || !rep) {
      return NextResponse.json(
        { error: "Key Account rep must be an active sales user.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("customers")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Customer not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Log activity
  await admin.from("activities").insert({
    customer_id: id,
    type: "contact_edited",
    by_user_id: userId,
    payload: { fields: Object.keys(update).filter((f) => f !== "updated_at") },
  });

  const key_account_rep = await fetchKeyAccountRepForDisplay(admin, data.key_account_sales_rep_id);

  return NextResponse.json({ customer: data, key_account_rep });
}
