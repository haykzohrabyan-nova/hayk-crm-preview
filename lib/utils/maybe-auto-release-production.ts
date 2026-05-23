import { createAdminClient } from "@/lib/supabase/admin";
import { computeCheckout } from "@/lib/utils/compute-checkout";
import { markLinkedLeadWonOnProduction } from "@/lib/utils/mark-lead-won-on-production";
import { assignOrderReferenceCode } from "@/lib/utils/reference-codes";
import type { PaymentConfig } from "@/lib/types";

export interface AutoReleaseTicket {
  id: string;
  ticket_status: string;
  client_confirmed: boolean | null;
  quote_final_total: number | null;
  reference_code: string | null;
  production_released_at: string | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  payment_status: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  ticket_payment_strategy: string | null;
  ticket_deposit_type: string | null;
  ticket_deposit_value: number | null;
  ticket_dep_handling: string | null;
  ticket_full_channels: string[] | null;
  ticket_partial_channels: string[] | null;
  ticket_require_client_confirm: boolean | null;
  linked_lead_id: string | null;
  customer_id: string | null;
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
    payment_amount_received: ticket.payment_amount_received,
    payment_paid_at:         ticket.payment_paid_at,
    deposit_amount:          ticket.deposit_amount,
    deposit_paid_at:         ticket.deposit_paid_at,
    balance_paid_at:         ticket.balance_paid_at,
    production_released_at:  null,
    ticket_payment_strategy: ticket.ticket_payment_strategy as "full" | "partial" | "net" | null,
    ticket_deposit_type:     ticket.ticket_deposit_type as "percent" | "fixed" | null,
    ticket_deposit_value:    ticket.ticket_deposit_value,
  });

  if (!checkout.canReleaseProduction) return { released: false };

  const fromStatus = ticket.ticket_status;
  const patch: Record<string, unknown> = {
    updated_at:             now,
    production_released_at: now,
    ticket_status:          "in_production",
    ticket_kind:            "order",
  };

  if (!ticket.client_confirmed && ticket.ticket_require_client_confirm === false) {
    patch.client_confirmed = true;
  }

  let referenceCode = ticket.reference_code;
  if (!referenceCode || referenceCode.startsWith("QUO-")) {
    try {
      referenceCode = await assignOrderReferenceCode(admin, referenceCode);
      if (referenceCode) patch.reference_code = referenceCode;
    } catch {
      // production release proceeds without ORD if sequence fails
    }
  }

  if (strategy === "net" && !ticket.payment_status) {
    patch.payment_status = "unpaid";
  }

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update(patch)
    .eq("id", ticket.id);

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
