import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";

type Params = { params: Promise<{ id: string }> };

/** GET — tax-exempt tickets for a customer (CRM See more modal). */
export async function GET(_request: NextRequest, { params }: Params) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/crm");
  if (pageDeny) return pageDeny;

  const { id: customerId } = await params;
  const admin = createAdminClient();

  const { data: customer, error: custErr } = await admin
    .from("customers")
    .select(
      "id, tax_exempt_last_permit_number, tax_exempt_last_storage_path, tax_exempt_last_file_name, tax_exempt_last_reviewed_at, tax_exempt_last_reviewed_by_id, tax_exempt_last_source_ticket_id",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (custErr || !customer) {
    return NextResponse.json({ error: "Customer not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: tickets, error: ticketErr } = await admin
    .from("job_tickets")
    .select(
      "id, reference_code, tax_exempt, sales_permit_file_name, sales_permit_storage_path, sales_permit_reviewed_at, sales_permit_reviewed_by_id, created_at",
    )
    .eq("customer_id", customerId)
    .eq("tax_exempt", true)
    .order("sales_permit_reviewed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (ticketErr) {
    return NextResponse.json({ error: ticketErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  const reviewerIds = [
    ...new Set(
      (tickets ?? [])
        .map((t) => t.sales_permit_reviewed_by_id)
        .filter((id): id is string => !!id),
    ),
  ];

  let nameMap: Record<string, string> = {};
  if (reviewerIds.length) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .in("id", reviewerIds);
    nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));
  }

  let lastReviewedByName: string | null = null;
  if (customer.tax_exempt_last_reviewed_by_id) {
    const { data: p } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", customer.tax_exempt_last_reviewed_by_id)
      .maybeSingle();
    lastReviewedByName = p?.full_name ?? null;
  }

  const rows = (tickets ?? []).map((t) => ({
    id: t.id,
    reference_code: t.reference_code,
    has_file: !!t.sales_permit_storage_path,
    sales_permit_file_name: t.sales_permit_file_name,
    sales_permit_reviewed_at: t.sales_permit_reviewed_at,
    approval_status: t.sales_permit_reviewed_at ? "approved" : "pending",
    reviewed_by_name: t.sales_permit_reviewed_by_id
      ? nameMap[t.sales_permit_reviewed_by_id] ?? null
      : null,
    created_at: t.created_at,
  }));

  return NextResponse.json({
    customer_last: {
      permit_number: customer.tax_exempt_last_permit_number,
      file_name: customer.tax_exempt_last_file_name,
      reviewed_at: customer.tax_exempt_last_reviewed_at,
      reviewed_by_name: lastReviewedByName,
      has_file: !!customer.tax_exempt_last_storage_path,
    },
    rows,
  });
}
