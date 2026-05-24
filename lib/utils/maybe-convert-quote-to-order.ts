import { createAdminClient } from "@/lib/supabase/admin";
import { computeCheckout } from "@/lib/utils/compute-checkout";
import {
  computeDepositDueFromTicket,
  isPaymentEvidencePending,
  type TicketPaymentFields,
} from "@/lib/utils/invoice-payment-summary";
import { assignOrderReferenceCode } from "@/lib/utils/reference-codes";
import type { PaymentConfig } from "@/lib/types";

export interface ConvertQuoteTicket extends TicketPaymentFields {
  id: string;
  ticket_status: string;
  ticket_kind?: string | null;
  client_confirmed?: boolean | null;
  reference_code?: string | null;
  ticket_require_client_confirm?: boolean | null;
  ticket_dep_handling?: string | null;
  ticket_full_channels?: string[] | null;
  ticket_partial_channels?: string[] | null;
  linked_lead_id?: string | null;
  customer_id?: string | null;
  balance_paid_at?: string | null;
}

function buildPaymentConfig(ticket: ConvertQuoteTicket): PaymentConfig {
  return {
    paymentStrategy:      (ticket.ticket_payment_strategy as "full" | "partial" | "net") ?? "full",
    depositType:          (ticket.ticket_deposit_type as "percent" | "fixed") ?? "percent",
    depositValue:         Number(ticket.ticket_deposit_value ?? 0),
    depHandling:          (ticket.ticket_dep_handling as "cash" | "gateway") ?? "gateway",
    paymentChannels:      ticket.ticket_full_channels?.length
      ? ticket.ticket_full_channels
      : (ticket.ticket_partial_channels ?? []),
    requireClientConfirm: ticket.ticket_require_client_confirm ?? true,
  } as PaymentConfig;
}

function isPaymentRecorded(ticket: ConvertQuoteTicket): boolean {
  const strategy = ticket.ticket_payment_strategy ?? "full";
  const total = Number(ticket.quote_final_total ?? 0);
  const amountPaid = Number(ticket.payment_amount_received ?? ticket.deposit_amount ?? 0);

  if (strategy === "partial") {
    if (ticket.deposit_paid_at) return true;
    const depositDue = computeDepositDueFromTicket(ticket);
    return depositDue > 0 && amountPaid >= depositDue - 0.01;
  }

  if (strategy === "full") {
    if (ticket.payment_paid_at) return true;
    return total > 0 && amountPaid >= total - 0.01;
  }

  return false;
}

/** Whether a quote-stage ticket should become an order (excluding admin override). */
export function canConvertQuoteToOrder(
  ticket: ConvertQuoteTicket,
  opts?: { adminOverride?: boolean },
): boolean {
  if (opts?.adminOverride) return true;

  if (ticket.ticket_status === "order" || ticket.ticket_status === "in_production") {
    return false;
  }

  if (!["sent", "approved"].includes(ticket.ticket_status)) {
    return false;
  }

  const strategy = ticket.ticket_payment_strategy ?? "full";
  const requireConfirm = ticket.ticket_require_client_confirm ?? true;
  const priceStepDone = !requireConfirm || !!ticket.client_confirmed;

  if (strategy === "net") {
    return priceStepDone;
  }

  if (isPaymentEvidencePending(ticket)) {
    return false;
  }

  if (!isPaymentRecorded(ticket)) {
    return false;
  }

  const cfg = buildPaymentConfig(ticket);
  const checkout = computeCheckout(cfg, {
    quote_final_total:       Number(ticket.quote_final_total ?? 0),
    client_confirmed:        !!ticket.client_confirmed,
    payment_amount_received: ticket.payment_amount_received ?? null,
    payment_paid_at:         ticket.payment_paid_at ?? null,
    deposit_amount:          ticket.deposit_amount ?? null,
    deposit_paid_at:         ticket.deposit_paid_at ?? null,
    balance_paid_at:         ticket.balance_paid_at ?? null,
    production_released_at:  null,
    ticket_payment_strategy: ticket.ticket_payment_strategy ?? null,
    ticket_deposit_type:     ticket.ticket_deposit_type ?? null,
    ticket_deposit_value:    ticket.ticket_deposit_value ?? null,
  });

  return checkout.paymentStepDone;
}

/** Convert quote-stage ticket to order when payment rules (or admin override) are satisfied. */
export async function maybeConvertQuoteToOrder(
  admin: ReturnType<typeof createAdminClient>,
  ticket: ConvertQuoteTicket,
  now: string,
  context: { byUserId?: string | null; via: string; adminOverride?: boolean },
): Promise<{ converted: boolean; reference_code?: string | null }> {
  if (ticket.ticket_status === "order" || ticket.ticket_status === "in_production") {
    return { converted: false, reference_code: ticket.reference_code };
  }

  if (!canConvertQuoteToOrder(ticket, { adminOverride: context.adminOverride })) {
    return { converted: false };
  }

  const fromStatus = ticket.ticket_status;
  let referenceCode = ticket.reference_code ?? null;

  if (!referenceCode || referenceCode.startsWith("QUO-")) {
    try {
      referenceCode = await assignOrderReferenceCode(admin, referenceCode);
    } catch {
      // proceed without ORD if sequence fails
    }
  }

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      ticket_status:  "order",
      ticket_kind:    "order",
      reference_code: referenceCode,
      updated_at:     now,
    })
    .eq("id", ticket.id);

  if (updateErr) return { converted: false };

  await admin.from("activities").insert([
    {
      type:        "ticket_converted",
      lead_id:     ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id:   ticket.id,
      by_user_id:  context.byUserId ?? null,
      payload:     {
        from:                   fromStatus,
        to:                     "order",
        reference_code:         referenceCode,
        via:                    context.via,
        require_client_confirm: ticket.ticket_require_client_confirm ?? true,
        client_confirmed:       !!ticket.client_confirmed,
        converted_by_role:      context.adminOverride ? "admin" : null,
        payment_received:       isPaymentRecorded(ticket),
      },
      created_at: now,
    },
    {
      type:        "order_ticket_status_changed",
      lead_id:     ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id:   ticket.id,
      by_user_id:  context.byUserId ?? null,
      payload:     {
        from:           fromStatus,
        to:             "order",
        via:            context.via,
        reference_code: referenceCode,
      },
      created_at: now,
    },
  ]);

  return { converted: true, reference_code: referenceCode };
}
