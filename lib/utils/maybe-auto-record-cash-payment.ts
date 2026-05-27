import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCheckout } from "@/lib/utils/compute-checkout";
import { logTicketPaymentRecorded } from "@/lib/utils/log-ticket-payment-recorded";
import { markLinkedLeadWonOnProduction } from "@/lib/utils/mark-lead-won-on-production";
import {
  AUTO_RELEASE_SELECT,
  maybeAutoReleaseProduction,
} from "@/lib/utils/maybe-auto-release-production";
import { maybeConvertQuoteToOrder } from "@/lib/utils/maybe-convert-quote-to-order";
import type { PaymentConfig } from "@/lib/types";

export interface AutoRecordCashTicket {
  id: string;
  reference_code?: string | null;
  ticket_payment_strategy: string | null;
  ticket_dep_handling: string | null;
  ticket_receipt_id: string | null;
  ticket_full_channels: string[] | null;
  ticket_partial_channels: string[] | null;
  ticket_deposit_type: string | null;
  ticket_deposit_value: number | null;
  ticket_require_client_confirm: boolean | null;
  client_confirmed?: boolean | null;
  quote_final_total: number | null;
  deposit_paid_at: string | null;
  payment_paid_at: string | null;
  linked_lead_id: string | null;
  customer_id: string | null;
}

/**
 * When staff saves a ticket with Cash/Offline deposit (or full cash in person) and a
 * receipt ID, record the payment immediately and optionally release to production.
 *
 * Logs `ticket_payment_recorded` so Reports / dashboard cash totals stay in sync
 * with `deposit_paid_at` / `payment_amount_received` on the ticket.
 */
export async function maybeAutoRecordCashPayment(
  admin: SupabaseClient,
  ticket: AutoRecordCashTicket,
  now: string,
  options?: { byUserId?: string | null },
): Promise<{ autoReleased: boolean } | null> {
  const strategy = ticket.ticket_payment_strategy;
  const depHandling = ticket.ticket_dep_handling;
  const receiptId = String(ticket.ticket_receipt_id ?? "").trim();
  const fullChannels = ticket.ticket_full_channels ?? [];

  const isPartialCash = strategy === "partial" && depHandling === "cash";
  const isCashFull = strategy === "full" && fullChannels.length === 1 && fullChannels[0] === "cash";

  if (!receiptId) return null;
  if (!isPartialCash && !isCashFull) return null;
  if (isPartialCash && ticket.deposit_paid_at) return null;
  if (isCashFull && ticket.payment_paid_at) return null;

  const total = Number(ticket.quote_final_total ?? 0);
  if (total <= 0) return null;

  let depositAmt = total;
  if (isPartialCash) {
    const depType = ticket.ticket_deposit_type ?? "percent";
    const depValue = Number(ticket.ticket_deposit_value ?? 0);
    depositAmt =
      depType === "percent"
        ? Math.round(total * (depValue / 100) * 100) / 100
        : Math.min(depValue, total);
  }

  const payPatch: Record<string, unknown> = {
    updated_at: now,
    deposit_amount: depositAmt,
    deposit_paid_at: now,
    deposit_receipt_id: receiptId,
    deposit_method: "cash",
    payment_amount_received: depositAmt,
    payment_evidence_url: null,
    payment_evidence_submitted_at: null,
    payment_evidence_amount: null,
  };

  if (isPartialCash) {
    payPatch.payment_status = "partial";
    payPatch.prepayment_status = "paid";
  }

  if (isCashFull) {
    payPatch.payment_paid_at = now;
    payPatch.payment_status = "paid";
    payPatch.payment_method_used = "cash";
    payPatch.balance_paid_at = now;
  }

  const cfg = {
    paymentStrategy: strategy as "full" | "partial" | "net",
    depositType: (ticket.ticket_deposit_type as "percent" | "fixed") ?? "percent",
    depositValue: Number(ticket.ticket_deposit_value ?? 0),
    depHandling: (ticket.ticket_dep_handling as "cash" | "gateway") ?? "gateway",
    paymentChannels: fullChannels.length ? fullChannels : (ticket.ticket_partial_channels ?? []),
    requireClientConfirm: ticket.ticket_require_client_confirm ?? true,
  } as PaymentConfig;

  const simulated = {
    quote_final_total: total,
    client_confirmed: !!ticket.client_confirmed,
    payment_amount_received: depositAmt,
    payment_paid_at: isCashFull ? now : null,
    deposit_amount: depositAmt,
    deposit_paid_at: now,
    balance_paid_at: null,
    production_released_at: null,
    ticket_payment_strategy: strategy as "full" | "partial" | "net" | null,
    ticket_deposit_type: (ticket.ticket_deposit_type as "percent" | "fixed" | null),
    ticket_deposit_value: ticket.ticket_deposit_value ?? null,
  };

  const checkout = computeCheckout(cfg, simulated);
  let autoReleased = false;

  await admin.from("job_tickets").update(payPatch).eq("id", ticket.id);

  if (checkout.canReleaseProduction) {
    const { data: fresh } = await admin
      .from("job_tickets")
      .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
      .eq("id", ticket.id)
      .single();

    if (fresh) {
      const freshRow =
        fresh as unknown as import("@/lib/utils/maybe-auto-release-production").AutoReleaseTicket;
      await maybeConvertQuoteToOrder(admin, freshRow, now, { via: "staff_cash_record" });
      const { data: afterConvert } = await admin
        .from("job_tickets")
        .select(AUTO_RELEASE_SELECT.replace(/\s+/g, " "))
        .eq("id", ticket.id)
        .single();
      if (afterConvert) {
        const releaseResult = await maybeAutoReleaseProduction(
          admin,
          afterConvert as unknown as import("@/lib/utils/maybe-auto-release-production").AutoReleaseTicket,
          now,
          { via: "staff_cash_record" },
        );
        autoReleased = releaseResult.released;
      }
    }
  }

  if (autoReleased) {
    await markLinkedLeadWonOnProduction(admin, ticket.linked_lead_id, now);
  }

  const mode = isCashFull ? "full" : "deposit";
  const fullyPaid = isCashFull || depositAmt >= total - 0.01;

  await logTicketPaymentRecorded(admin, {
    ticketId: ticket.id,
    leadId: ticket.linked_lead_id,
    customerId: ticket.customer_id,
    byUserId: options?.byUserId ?? null,
    mode,
    method: "cash",
    amount: depositAmt,
    receiptId,
    newTotal: depositAmt,
    fullyPaid,
    via: "staff_cash_auto",
    createdAt: now,
  });

  return { autoReleased };
}
