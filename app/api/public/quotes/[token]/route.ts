import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTicketLinesBundle, lineItemsToDisplayRows } from "@/lib/utils/ticket-line-items";

// GET /api/public/quotes/[token]
// No auth required — used by the public customer-facing quote page (/q/[token]).
// Returns only safe public fields — no internal notes, no user IDs.

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
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
       discount_type,
       discount_value,
       discount_reason,
       quote_pre_tax_total,
       quote_tax_rate_percent,
       quote_tax_amount,
       quote_final_total,
       tax_exempt,
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
       special_requirements,
       client_confirmed,
       contact_name,
       contact_email,
       contact_company,
       created_at,
       customer:customers(id, first_name, last_name, company, email, phone),
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
       payment_evidence_amount,
       payment_amount_received,
       payment_paid_at,
       deposit_amount,
       deposit_paid_at,
       balance_paid_at`
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

  const line_items = lineItemsToDisplayRows(
    await fetchTicketLinesBundle(admin, ticket.id as string),
  );

  return NextResponse.json({
    ticket: { ...ticket, line_items },
    company: company ?? null,
  });
}
