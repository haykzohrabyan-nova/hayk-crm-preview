import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTicketLinesBundle, lineItemsToDisplayRows } from "@/lib/utils/ticket-line-items";
import {
  fetchTicketShippingDestinations,
  resolveTicketShippingDestinationsForDisplay,
} from "@/lib/utils/ticket-shipping-destinations";
import { formatPhone } from "@/lib/utils/phone";
import type { CompanySettings } from "@/lib/types";
import { InvoicePDF } from "@/lib/pdf/invoice-pdf";
import { computeInvoicePaymentSummary } from "@/lib/utils/invoice-payment-summary";
import { getChannelLabel } from "@/lib/utils/compute-checkout";
import { resolveTicketId, ticketDisplayReference, ticketIsOrderStage } from "@/lib/utils/reference-codes";
import {
  customerDocumentPaymentSummary,
  customerDocumentBanner,
  shouldHidePricingOnCustomerDocument,
} from "@/lib/utils/public-invoice-document";
import { requireSession } from "@/lib/auth/require-session";
import { requireTicketDetailPageAccess } from "@/lib/auth/require-page-access";
import { canAccessTicket } from "@/lib/utils/ticket-access";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;

  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) {
    return new NextResponse("Unauthorized", { status: errorResponse.status });
  }
  const pageDeny = await requireTicketDetailPageAccess(userId!, roleName);
  if (pageDeny) {
    return new NextResponse("Forbidden", { status: pageDeny.status });
  }

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [{ data: ticket }, { data: rawCompany }] = await Promise.all([
    admin
      .from("job_tickets")
      .select(
        `id, ticket_kind, ticket_status, title, reference_code, created_at,
         due_date, rush, priority,
         contact_name, contact_email, contact_company, contact_phone,
         quote_subtotal, quote_shipping,
         requires_shipping, ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_zip,
         discount_type, discount_value, discount_reason,
         quote_pre_tax_total, quote_tax_rate_percent, quote_tax_amount, quote_final_total,
         tax_exempt, sales_permit_storage_path, sales_permit_reviewed_at,
         quote_payment_types, quote_channel, created_by_id,
         ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value,
         ticket_partial_channels, ticket_full_channels,
         payment_amount_received, deposit_amount, deposit_paid_at, payment_paid_at,
         payment_evidence_url, payment_evidence_submitted_at, payment_evidence_reviewed_at,
         payment_evidence_amount, refund_status, total_refunded_amount,
         customer:customers!job_tickets_customer_id_fkey(first_name, last_name, company, email, phone)`
      )
      .eq("id", ticketId)
      .single(),
    admin.from("company_settings").select("*").eq("id", 1).single(),
  ]);

  if (!ticket) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!canAccessTicket(ticket, userId!, roleName)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const company = rawCompany as CompanySettings | null;

  // Fetch creator name separately (created_by_id → user_profiles)
  let repName = "—";
  if (ticket.created_by_id) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", ticket.created_by_id as string)
      .single();
    repName = profile?.full_name ?? "—";
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const isOrder = ticketIsOrderStage({
    reference_code: ticket.reference_code as string | null,
    ticket_kind: ticket.ticket_kind as string | null,
  });

  const cust = ticket.customer as unknown as {
    first_name: string | null; last_name: string | null;
    company: string | null; email: string | null; phone: string | null;
  } | null;

  const customerName = cust
    ? `${cust.first_name ?? ""} ${cust.last_name ?? ""}`.trim()
    : (ticket.contact_name as string | null) ?? "";
  const customerEmail = cust?.email ?? (ticket.contact_email as string | null) ?? "";
  const customerPhone = cust?.phone ?? (ticket.contact_phone as string | null) ?? "";
  const customerCompany = cust?.company ?? (ticket.contact_company as string | null) ?? "";

  const [lineBundle, shipping_destinations] = await Promise.all([
    fetchTicketLinesBundle(admin, ticketId),
    fetchTicketShippingDestinations(admin, ticketId),
  ]);
  const skus = lineItemsToDisplayRows(lineBundle);
  const shippingDestinations = resolveTicketShippingDestinationsForDisplay({
    requires_shipping: ticket.requires_shipping as boolean | null,
    quote_shipping: ticket.quote_shipping as number | null,
    ship_to_line1: ticket.ship_to_line1 as string | null,
    ship_to_line2: ticket.ship_to_line2 as string | null,
    ship_to_city: ticket.ship_to_city as string | null,
    ship_to_state: ticket.ship_to_state as string | null,
    ship_to_zip: ticket.ship_to_zip as string | null,
    shipping_destinations,
  });

  const discountAmt =
    ticket.quote_subtotal != null &&
    ticket.quote_pre_tax_total != null &&
    ticket.quote_shipping != null
      ? (ticket.quote_subtotal as number) +
        (ticket.quote_shipping as number) -
        (ticket.quote_pre_tax_total as number)
      : null;

  const addressParts = [
    company?.address_line1,
    company?.address_line2,
    [company?.city, company?.state, company?.zip].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];

  const paymentLabels: Record<string, string> = {
    card_default: "Card Payment",
    card: "Credit / Debit Card",
    wire: "Wire Transfer",
    ach: "ACH / Bank Transfer",
    zelle: "Zelle",
    check: "Check",
    cash: "Cash/Terminal (In Person)",
    offline: "Offline / In-person",
  };
  const strategy = (ticket.ticket_payment_strategy as string | null) ?? "full";
  const channelKeys = strategy === "partial"
    ? ((ticket.ticket_partial_channels as string[]) ?? [])
    : ((ticket.ticket_full_channels as string[]) ?? (ticket.quote_payment_types as string[]) ?? []);
  const paymentMethods = channelKeys.map((k) => paymentLabels[k] ?? getChannelLabel(k)).join(", ");

  const paymentFields = {
    quote_final_total: ticket.quote_final_total as number | null,
    ticket_payment_strategy: ticket.ticket_payment_strategy as "full" | "partial" | "net" | null,
    ticket_deposit_type: ticket.ticket_deposit_type as "percent" | "fixed" | null,
    ticket_deposit_value: ticket.ticket_deposit_value as number | null,
    payment_amount_received: ticket.payment_amount_received as number | null,
    deposit_amount: ticket.deposit_amount as number | null,
    deposit_paid_at: ticket.deposit_paid_at as string | null,
    payment_paid_at: ticket.payment_paid_at as string | null,
    payment_evidence_url: ticket.payment_evidence_url as string | null,
    payment_evidence_submitted_at: ticket.payment_evidence_submitted_at as string | null,
    payment_evidence_reviewed_at: ticket.payment_evidence_reviewed_at as string | null,
    payment_evidence_amount: ticket.payment_evidence_amount as number | null,
    ticket_status: ticket.ticket_status as string,
    refund_status: ticket.refund_status as string | null,
    total_refunded_amount: ticket.total_refunded_amount as number | null,
  };
  const paymentSummary = customerDocumentPaymentSummary(
    computeInvoicePaymentSummary(paymentFields),
    paymentFields,
  );
  const documentBanner = customerDocumentBanner(paymentFields);
  const hidePricingSummary = shouldHidePricingOnCustomerDocument(paymentFields);

  // ── Render PDF ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docElement = createElement(InvoicePDF, {
    isOrder,
    company: company
      ? {
          name: company.company_name ?? "BAZAARPRINTING",
          logoUrl: company.logo_url ?? null,
          address: addressParts.join(", "),
          phone: company.phone ? formatPhone(company.phone) : null,
          email: company.email ?? null,
          website: company.website ?? null,
        }
      : { name: "BAZAARPRINTING", logoUrl: null, address: "", phone: null, email: null, website: null },
    ticket: {
      referenceCode: ticketDisplayReference(ticket as { reference_code: string | null; id: string }),
      title: ticket.title as string | null,
      createdAt: ticket.created_at as string,
      dueDate: ticket.due_date as string | null,
      rush: ticket.rush as boolean | null,
      priority: ticket.priority as string | null,
      quoteSubtotal: ticket.quote_subtotal as number | null,
      quoteShipping: ticket.quote_shipping as number | null,
      discountReason: ticket.discount_reason as string | null,
      quotePreTaxTotal: ticket.quote_pre_tax_total as number | null,
      quoteTaxRatePercent: ticket.quote_tax_rate_percent as number | null,
      quoteTaxAmount: ticket.quote_tax_amount as number | null,
      quoteFinalTotal: ticket.quote_final_total as number | null,
      taxExempt: ticket.tax_exempt as boolean | null,
      taxExemptReviewPending:
        !!(ticket.tax_exempt as boolean) &&
        !!(ticket.sales_permit_storage_path as string | null) &&
        !(ticket.sales_permit_reviewed_at as string | null),
      refundStatus: ticket.refund_status as string | null,
      totalRefundedAmount: ticket.total_refunded_amount as number | null,
      quoteChannel: ticket.quote_channel as string | null,
      requiresShipping: Boolean(ticket.requires_shipping),
      shippingDestinations,
    },
    customer: { name: customerName, email: customerEmail, phone: customerPhone ? formatPhone(customerPhone) : "", company: customerCompany },
    repName,
    skus,
    discountAmt: discountAmt ?? null,
    paymentMethods,
    paymentSummary,
    documentBanner,
    hidePricingSummary,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(docElement as any);
  } catch (err) {
    console.error("[pdf/ticket] renderToBuffer failed:", err);
    return new NextResponse("PDF generation failed.", { status: 500 });
  }

  const refCode = ticketDisplayReference(ticket as { reference_code: string | null; id: string });
  const filename = `${isOrder ? "Invoice" : "Quote"}-${refCode}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
