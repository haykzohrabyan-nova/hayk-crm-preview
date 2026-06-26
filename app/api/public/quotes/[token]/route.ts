import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTicketLinesBundle, lineItemsToDisplayRows } from "@/lib/utils/ticket-line-items";
import { fetchTicketShippingDestinations } from "@/lib/utils/ticket-shipping-destinations";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";

// GET /api/public/quotes/[token]
// No auth required — used by the public customer-facing quote page (/q/[token]).
// Returns only safe public fields — no internal notes, no user IDs.

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(_request, "get");
  if (rateLimited) return rateLimited;

  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: ticket, error } = await admin
    .from("job_tickets")
    .select(
      `id,
       ticket_kind,
       ticket_status,
       title,
       reference_code,
       public_token,
       quote_channel,
       quote_subtotal,
       quote_shipping,
       requires_shipping,
       ship_to_line1,
       ship_to_line2,
       ship_to_city,
       ship_to_state,
       ship_to_zip,
       discount_type,
       discount_value,
       discount_reason,
       quote_pre_tax_total,
       quote_tax_rate_percent,
       quote_tax_amount,
       quote_final_total,
       tax_exempt,
       sales_permit_reviewed_at,
       quote_payment_types,
       quote_channel,
       prepayment_type,
       prepayment_value,
       order_source,
       due_date,
       priority,
       rush,
       design_required,
       die_cut,
       client_confirmed,
       contact_name,
       contact_email,
       contact_company,
       created_at,
       customer:customers!job_tickets_customer_id_fkey(id, first_name, last_name, company, email, phone),
       ticket_payment_strategy,
       ticket_deposit_type,
       ticket_deposit_value,
       ticket_dep_handling,
       ticket_partial_channels,
       ticket_full_channels,
       ticket_require_client_confirm,
       ticket_net_terms_label,
       payment_evidence_url,
       payment_evidence_submitted_at,
       payment_evidence_reviewed_at,
       payment_evidence_resubmit_requested_at,
       payment_evidence_resubmit_received_at,
       payment_evidence_amount,
       payment_evidence_resubmit_token,
       sales_permit_resubmit_token,
       sales_permit_resubmit_requested_at,
       sales_permit_resubmit_received_at,
       stripe_payment_intent_id,
       payment_amount_received,
       payment_paid_at,
       deposit_amount,
       deposit_paid_at,
       balance_paid_at,
       refund_status,
       total_refunded_amount`
    )
    .eq("public_token", token)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  // Fetch company settings for display (name, logo, address)
  const { data: company } = await admin
    .from("company_settings")
    .select("company_name, logo_url, address_line1, address_line2, city, state, zip, phone, email, website, bank_name, bank_account_name, bank_account_number, bank_routing_number, zelle_phone, zelle_email")
    .eq("id", 1)
    .single();

  const ticketId = ticket.id as string;
  const line_items = lineItemsToDisplayRows(await fetchTicketLinesBundle(admin, ticketId));
  const shipping_destinations = await fetchTicketShippingDestinations(admin, ticketId);

  const reviewedAt = (ticket as { sales_permit_reviewed_at?: string | null }).sales_permit_reviewed_at;
  const storagePath = (ticket as { sales_permit_storage_path?: string | null }).sales_permit_storage_path;
  const paymentResubmitRequested = !!(ticket as { payment_evidence_resubmit_requested_at?: string | null })
    .payment_evidence_resubmit_requested_at;
  const paymentResubmitReceived = !!(ticket as { payment_evidence_resubmit_received_at?: string | null })
    .payment_evidence_resubmit_received_at;
  const permitResubmitRequested = !!(ticket as { sales_permit_resubmit_requested_at?: string | null })
    .sales_permit_resubmit_requested_at;
  const permitResubmitReceived = !!(ticket as { sales_permit_resubmit_received_at?: string | null })
    .sales_permit_resubmit_received_at;
  const permitToken = (ticket as { sales_permit_resubmit_token?: string | null }).sales_permit_resubmit_token;
  const evidenceToken = (ticket as { payment_evidence_resubmit_token?: string | null })
    .payment_evidence_resubmit_token;

  const {
    payment_evidence_resubmit_requested_at: _p1,
    payment_evidence_resubmit_received_at: _p2,
    payment_evidence_resubmit_token: _e,
    sales_permit_resubmit_token: _t,
    ...safeTicket
  } = ticket as Record<string, unknown>;

  return NextResponse.json({
    ticket: {
      ...safeTicket,
      line_items,
      shipping_destinations,
      tax_exempt_review_pending:
        !!ticket.tax_exempt && !!storagePath && !reviewedAt,
      payment_evidence_resubmit_required: paymentResubmitRequested && !paymentResubmitReceived,
      payment_evidence_resubmit_received: paymentResubmitReceived && !paymentResubmitRequested,
      tax_exempt_resubmit_required: permitResubmitRequested && !permitResubmitReceived,
      tax_exempt_resubmit_received: permitResubmitReceived && !permitResubmitRequested,
      tax_exempt_permit_path:
        permitResubmitRequested && permitToken ? `/permit/${permitToken}` : null,
      payment_evidence_resubmit_path:
        paymentResubmitRequested && evidenceToken ? `/evidence/${evidenceToken}` : null,
    },
    company: company ?? null,
  });
}
