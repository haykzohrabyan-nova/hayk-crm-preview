import type { createAdminClient } from "@/lib/supabase/admin";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { fetchTicketPaymentRefunds } from "@/lib/payments/fetch-ticket-refunds";
import { canAccessTicket } from "@/lib/utils/ticket-access";
import { fetchManualConvertMeta } from "@/lib/utils/manual-convert-meta";
import { resolveTicketCancelledAt } from "@/lib/utils/fetch-ticket-cancelled-at";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import { fetchTicketLinesBundle } from "@/lib/utils/ticket-line-items";
import { fetchTicketShippingDestinations } from "@/lib/utils/ticket-shipping-destinations";

type AdminClient = ReturnType<typeof createAdminClient>;

export type TicketDetailResult =
  | { ok: true; ticket: Record<string, unknown> }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" };

export async function fetchTicketDetailPayload(
  admin: AdminClient,
  rawId: string,
  userId: string,
  roleName: string | null,
): Promise<TicketDetailResult> {
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) return { ok: false, code: "NOT_FOUND" };

  const { data: ticket, error } = await admin
    .from("job_tickets")
    .select(
      `*,
       customer:customers!job_tickets_customer_id_fkey(id, first_name, last_name, company, phone, email, industry, website, created_at),
       lead:leads(
         id, created_at, status, sales_status, urgency, source,
         sdr_comment, hold_reason, rejection_reason, is_returning_customer, interests, quantities,
         customer:customers(id, first_name, last_name, company, phone, email, industry)
       )`,
    )
    .eq("id", ticketId)
    .single();

  if (error || !ticket) return { ok: false, code: "NOT_FOUND" };

  if (!canAccessTicket(ticket, userId, roleName ?? "")) {
    return { ok: false, code: "FORBIDDEN" };
  }

  let created_by: { id: string; full_name: string } | null = null;
  if (ticket.created_by_id) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .eq("id", ticket.created_by_id)
      .single();
    created_by = profile ?? null;
  }

  let sales_permit_reviewed_by: { id: string; full_name: string } | null = null;
  const reviewedById = (ticket as { sales_permit_reviewed_by_id?: string | null })
    .sales_permit_reviewed_by_id;
  if (reviewedById) {
    const { data: reviewer } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .eq("id", reviewedById)
      .single();
    sales_permit_reviewed_by = reviewer ?? null;
  }

  const [convert_meta, line_items, shipping_destinations, payment_refunds, cancelled_at] =
    await Promise.all([
      fetchManualConvertMeta(admin, ticketId, ticket),
      fetchTicketLinesBundle(admin, ticketId),
      fetchTicketShippingDestinations(admin, ticketId),
      isPaymentStaffRole(roleName)
        ? fetchTicketPaymentRefunds(admin, ticketId)
        : Promise.resolve([]),
      resolveTicketCancelledAt(
        admin,
        ticketId,
        ticket.ticket_status as string,
        (ticket as { cancelled_at?: string | null }).cancelled_at,
      ),
    ]);

  return {
    ok: true,
    ticket: {
      ...ticket,
      cancelled_at,
      created_by,
      sales_permit_reviewed_by,
      convert_meta,
      line_items,
      shipping_destinations,
      payment_refunds,
    },
  };
}
