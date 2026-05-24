import { createAdminClient } from "@/lib/supabase/admin";
import { computeCheckout } from "@/lib/utils/compute-checkout";
import { maybeConvertQuoteToOrder, type ConvertQuoteTicket } from "@/lib/utils/maybe-convert-quote-to-order";
import { markLinkedLeadWonOnProduction } from "@/lib/utils/mark-lead-won-on-production";
import { assignOrderReferenceCode } from "@/lib/utils/reference-codes";
import type { PaymentConfig } from "@/lib/types";

export interface AutoReleaseTicket extends ConvertQuoteTicket {
  client_confirmed: boolean | null;
  production_released_at: string | null;
  payment_status: string | null;
}

/** Release to production when price + payment gates are satisfied (net terms, cash, etc.). */
export async function maybeAutoReleaseProduction(
  admin: ReturnType<typeof createAdminClient>,
  ticket: AutoReleaseTicket,
  now: string,
  context: { byUserId?: string | null; via: string },
): Promise<{ released: boolean; reference_code?: string | null }> {
  if (ticket.production_released_at) return { released: false };
  if (!["sent", "order", "approved"].includes(ticket.ticket_status)) return { released: false };

  const strategy = ticket.ticket_payment_strategy ?? "full";
  const cfg = {
    paymentStrategy:      strategy as "full" | "partial" | "net",
    depositType:          (ticket.ticket_deposit_type as "percent" | "fixed") ?? "percent",
    depositValue:         Number(ticket.ticket_deposit_value ?? 0),
    depHandling:          (ticket.ticket_dep_handling as "cash" | "gateway") ?? "gateway",
    paymentChannels:      ticket.ticket_full_channels?.length
      ? ticket.ticket_full_channels
      : (ticket.ticket_partial_channels ?? []),
    requireClientConfirm: ticket.ticket_require_client_confirm ?? true,
  } as PaymentConfig;

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

  if (!checkout.canReleaseProduction) return { released: false };

  // Ensure order conversion before production release (quote stays quote until payment).
  let workingTicket = ticket;
  if (ticket.ticket_status === "sent" || ticket.ticket_status === "approved") {
    const convertResult = await maybeConvertQuoteToOrder(admin, ticket, now, context);
    if (convertResult.converted) {
      workingTicket = {
        ...ticket,
        ticket_status:  "order",
        reference_code: convertResult.reference_code ?? ticket.reference_code ?? null,
      };
    } else {
      return { released: false };
    }
  }

  const fromStatus = workingTicket.ticket_status;
  const patch: Record<string, unknown> = {
    updated_at:             now,
    production_released_at: now,
    ticket_status:          "in_production",
    ticket_kind:            "order",
  };

  if (!ticket.client_confirmed && ticket.ticket_require_client_confirm === false) {
    patch.client_confirmed = true;
  }

  let referenceCode = workingTicket.reference_code ?? null;
  if (!referenceCode || referenceCode.startsWith("QUO-")) {
    try {
      referenceCode = await assignOrderReferenceCode(admin, referenceCode);
      if (referenceCode) patch.reference_code = referenceCode;
    } catch {
      // production release proceeds without ORD if sequence fails
    }
  }

  if (strategy === "net" && !workingTicket.payment_status) {
    patch.payment_status = "unpaid";
  }

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", workingTicket.id);

  if (updateErr) return { released: false };

  await admin.from("activities").insert([
    {
      type:        "ticket_production_released",
      lead_id:     ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id:   ticket.id,
      by_user_id:  context.byUserId ?? null,
      payload:     { released_at: now, auto: true, via: context.via },
      created_at:  now,
    },
    {
      type:        "order_ticket_status_changed",
      lead_id:     ticket.linked_lead_id ?? null,
      customer_id: ticket.customer_id ?? null,
      ticket_id:   ticket.id,
      by_user_id:  context.byUserId ?? null,
      payload:     { from: fromStatus, to: "in_production", via: context.via, auto: true, reference_code: referenceCode },
      created_at:  now,
    },
  ]);

  await markLinkedLeadWonOnProduction(admin, ticket.linked_lead_id, now);

  return { released: true, reference_code: referenceCode };
}

/** Fields needed by maybeAutoReleaseProduction — use on select(). */
export const AUTO_RELEASE_SELECT = `
  id, ticket_status, client_confirmed, quote_final_total, reference_code,
  production_released_at, payment_amount_received, payment_paid_at, payment_status,
  deposit_amount, deposit_paid_at, balance_paid_at,
  ticket_payment_strategy, ticket_deposit_type, ticket_deposit_value,
  ticket_dep_handling, ticket_full_channels, ticket_partial_channels,
  ticket_require_client_confirm, linked_lead_id, customer_id
`;
