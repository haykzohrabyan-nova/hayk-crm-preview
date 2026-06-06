import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { activityDisplayRef } from "@/lib/utils/activity-ticket-ref";

// Human-readable labels for every activity type logged by the system
const ACTION_LABELS: Record<string, string> = {
  lead_routed_to_sales: "Routed lead to Sales",
  lead_status_changed: "Changed lead status",
  lead_edited: "Edited lead",
  lead_rejected: "Rejected lead",
  lead_held: "Put lead on hold",
  lead_follow_up_later: "Marked follow up later",
  lead_resumed: "Resumed lead",
  lead_sales_claimed: "Claimed lead",
  lead_claimed: "Claimed lead",
  lead_manual_created: "Created lead manually",
  leads_bulk_imported: "Bulk imported leads",
  lead_reassigned: "Reassigned lead",
  customer_merged: "Merged customer records",
  contact_edited: "Edited customer profile",
  order_ticket_created: "Quote / order created",
  order_ticket_updated: "Updated quote / order",
  order_ticket_status_changed: "Changed ticket status",
  ticket_client_confirmed: "Customer confirmed quote",
  ticket_converted: "Converted to order",
  ticket_sent: "Sent quote to customer",
  ticket_resent: "Resent quote to customer",
  ticket_payment_evidence_submitted: "Payment evidence submitted",
  ticket_payment_evidence_resubmit_requested: "Requested updated payment proof",
  ticket_payment_evidence_resubmitted: "Customer resubmitted payment proof",
  ticket_tax_exempt_resubmit_requested: "Requested updated tax-exempt permit",
  ticket_tax_exempt_resubmit_received: "Customer resubmitted tax-exempt permit",
  ticket_payment_recorded: "Payment recorded",
  ticket_production_released: "Released to production",
  ticket_payment_reminder_sent: "Payment reminder sent",
  ticket_invoice_resent: "Invoice link resent",
  ticket_order_ready_sent: "Pickup notification sent",
};

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const { searchParams } = request.nextUrl;
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
  const typeFilter = searchParams.get("type") ?? "";

  // Fetch paginated activities with customer context
  let query = admin
    .from("activities")
    .select(
      `id, type, channel, payload, created_at, by_user_id, ticket_id, lead_id,
       customer:customers!job_tickets_customer_id_fkey(first_name, last_name, company)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (typeFilter) {
    query = query.eq("type", typeFilter);
  }

  const { data: activities, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  if (!activities || activities.length === 0) {
    return NextResponse.json({ activities: [], total: count ?? 0 });
  }

  // Fetch user profiles for all actors (activities.by_user_id = user_profiles.id)
  const userIds = [...new Set(activities.map((a) => a.by_user_id).filter(Boolean))] as string[];
  const { data: profiles } = await admin
    .from("user_profiles_with_role")
    .select("id, full_name, role_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const ticketIds = [...new Set(activities.map((a) => a.ticket_id).filter(Boolean))] as string[];
  const ticketMap = new Map<string, { id: string; reference_code: string | null }>();

  if (ticketIds.length > 0) {
    const { data: tickets } = await admin
      .from("job_tickets")
      .select("id, reference_code")
      .in("id", ticketIds);
    for (const t of tickets ?? []) {
      if (t.id) ticketMap.set(t.id, t);
    }
  }

  // Enrich activities with actor name, role, human-readable label, and ticket ref
  const enriched = activities.map((a) => ({
    id: a.id,
    type: a.type,
    label: ACTION_LABELS[a.type] ?? a.type.replace(/_/g, " "),
    channel: a.channel,
    payload: a.payload,
    created_at: a.created_at,
    actor: a.by_user_id ? (profileMap.get(a.by_user_id) ?? null) : null,
    customer: a.customer,
    ticket_ref: activityDisplayRef(
      { ticket_id: a.ticket_id, lead_id: a.lead_id, payload: a.payload },
      a.ticket_id ? ticketMap.get(a.ticket_id) : null,
    ),
  }));

  return NextResponse.json({ activities: enriched, total: count ?? 0 });
}
