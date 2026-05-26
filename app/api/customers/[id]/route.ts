import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeAuthority } from "@/lib/utils/authority";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

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

  return NextResponse.json({ customer: customerResult.data, leads, lead_count, customer_status });
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
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const body = await request.json();

  // Strip disallowed fields
  const update: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      if (field === "phone") {
        update[field] = digitsOnly(String(body[field] ?? ""));
      } else if (field === "authority") {
        update[field] = normalizeAuthority(String(body[field] ?? ""));
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

  update.updated_at = new Date().toISOString();

  const admin = createAdminClient();
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

  return NextResponse.json({ customer: data });
}
