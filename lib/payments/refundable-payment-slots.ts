/** Payments recorded on a ticket that can be selected for refund. */

import { stripeRefundableCents } from "@/lib/stripe/refund-eligibility";
import type { PaymentEvidenceMode } from "@/lib/utils/payment-evidence-type";

export type RefundChannel = "stripe" | "manual";

export interface TicketRefundRow {
  payment_mode: string;
  amount: number | string;
}

export interface RefundableSlotTicket {
  quote_final_total?: number | null;
  ticket_payment_strategy?: "partial" | "full" | "net" | null;
  payment_amount_received?: number | null;
  deposit_amount?: number | null;
  deposit_paid_at?: string | null;
  deposit_method?: string | null;
  balance_paid_at?: string | null;
  payment_paid_at?: string | null;
  payment_method_used?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_amount_cents?: number | null;
  stripe_amount_refunded_cents?: number | null;
  payment_evidence_reviewed_at?: string | null;
}

export interface RefundablePaymentSlot {
  mode: PaymentEvidenceMode;
  label: string;
  amountRecorded: number;
  amountRefunded: number;
  maxRefundable: number;
  method: string;
  paidAt: string | null;
  refundChannel: RefundChannel;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumRefundedForMode(
  refunds: TicketRefundRow[] | undefined,
  mode: PaymentEvidenceMode,
): number {
  if (!refunds?.length) return 0;
  return roundMoney(
    refunds
      .filter((r) => r.payment_mode === mode)
      .reduce((s, r) => s + Number(r.amount), 0),
  );
}

function slotLabel(mode: PaymentEvidenceMode): string {
  if (mode === "deposit") return "Deposit";
  if (mode === "balance") return "Balance";
  return "Full payment";
}

function buildSlot(
  ticket: RefundableSlotTicket,
  mode: PaymentEvidenceMode,
  amountRecorded: number,
  method: string,
  paidAt: string | null,
  refundChannel: RefundChannel,
  priorRefunds: TicketRefundRow[] | undefined,
): RefundablePaymentSlot | null {
  if (amountRecorded <= 0.01) return null;

  const amountRefunded = sumRefundedForMode(priorRefunds, mode);
  let maxRefundable = roundMoney(Math.max(0, amountRecorded - amountRefunded));

  if (refundChannel === "stripe" && ticket.stripe_payment_intent_id) {
    const stripeCap = stripeRefundableCents(ticket) / 100;
    maxRefundable = roundMoney(Math.min(maxRefundable, stripeCap));
  }

  if (maxRefundable <= 0.01) return null;

  return {
    mode,
    label: slotLabel(mode),
    amountRecorded: roundMoney(amountRecorded),
    amountRefunded,
    maxRefundable,
    method: method || "other",
    paidAt,
    refundChannel,
  };
}

export function listRefundablePaymentSlots(
  ticket: RefundableSlotTicket,
  priorRefunds?: TicketRefundRow[],
): RefundablePaymentSlot[] {
  const strategy = ticket.ticket_payment_strategy ?? "full";
  const received = Number(ticket.payment_amount_received ?? 0);
  const depositAmt = Number(ticket.deposit_amount ?? 0);
  const slots: RefundablePaymentSlot[] = [];

  const stripeReady =
    !!ticket.stripe_payment_intent_id &&
    !!ticket.payment_evidence_reviewed_at &&
    stripeRefundableCents(ticket) > 0;

  if (strategy === "partial") {
    if (ticket.deposit_paid_at && depositAmt > 0.01) {
      const s = buildSlot(
        ticket,
        "deposit",
        depositAmt,
        ticket.deposit_method ?? "cash",
        ticket.deposit_paid_at,
        "manual",
        priorRefunds,
      );
      if (s) slots.push(s);
    }

    const balanceRecorded =
      ticket.balance_paid_at && received > depositAmt + 0.01
        ? roundMoney(received - depositAmt)
        : 0;

    if (balanceRecorded > 0.01) {
      const channel: RefundChannel = stripeReady ? "stripe" : "manual";
      const s = buildSlot(
        ticket,
        "balance",
        balanceRecorded,
        ticket.payment_method_used ?? "card",
        ticket.balance_paid_at ?? null,
        channel,
        priorRefunds,
      );
      if (s) slots.push(s);
    }
  } else if (strategy === "full" && received > 0.01) {
    const channel: RefundChannel = stripeReady ? "stripe" : "manual";
    const s = buildSlot(
      ticket,
      "full",
      received,
      ticket.payment_method_used ?? "other",
      ticket.payment_paid_at ?? ticket.balance_paid_at ?? null,
      channel,
      priorRefunds,
    );
    if (s) slots.push(s);
  }

  return slots;
}

export function canRecordRefund(
  ticket: RefundableSlotTicket,
  priorRefunds?: TicketRefundRow[],
  roleName?: string | null,
): boolean {
  if (roleName !== "accountant" && roleName !== "admin") return false;
  return listRefundablePaymentSlots(ticket, priorRefunds).length > 0;
}
