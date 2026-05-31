"use client";

import { formatCurrency } from "@/lib/utils/ticket-math";
import { computeCheckout, getChannelLabel } from "@/lib/utils/compute-checkout";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import { paymentEvidenceAwaitingConfirmationLabel } from "@/lib/utils/payment-evidence-type";
import { formatDate, formatDateTime, isOverdue } from "@/lib/utils/format";
import type { PaymentConfig } from "@/lib/types";
import type { QuoteSku } from "@/lib/utils/ticket-math";
import { DetailStatCard } from "@/components/quotes/quote-detail/detail-layout-primitives";

export interface StatsTicket {
  quote_final_total: number | null;
  line_items?: { product_type: string }[] | null;
  quote_skus?: QuoteSku[] | null;
  title?: string | null;
  payment_status: "unpaid" | "partial" | "paid" | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  production_released_at: string | null;
  due_date: string | null;
  client_confirmed: boolean;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  ticket_dep_handling: "cash" | "gateway" | null;
  ticket_partial_channels: string[] | null;
  ticket_full_channels: string[] | null;
  ticket_require_client_confirm: boolean | null;
  ticket_net_terms_label: string | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_reviewed_at?: string | null;
  payment_evidence_amount?: number | null;
  stripe_payment_intent_id?: string | null;
  stripe_amount_cents?: number | null;
  payment_method_used: string | null;
  deposit_method: string | null;
  refund_status?: "none" | "partial" | "full" | string | null;
  total_refunded_amount?: number | null;
}

function buildConfig(t: StatsTicket): PaymentConfig {
  const strategy = t.ticket_payment_strategy ?? "full";
  const channels = strategy === "partial"
    ? (t.ticket_partial_channels ?? [])
    : (t.ticket_full_channels ?? []);
  return {
    paymentStrategy: strategy,
    depositType: t.ticket_deposit_type ?? "percent",
    depositValue: t.ticket_deposit_value ?? 0,
    depHandling: t.ticket_dep_handling ?? "gateway",
    paymentChannels: channels,
    requireClientConfirm: t.ticket_require_client_confirm ?? true,
  } as PaymentConfig;
}

function primaryProductLabel(t: StatsTicket): string | undefined {
  const sku = t.line_items?.[0] ?? t.quote_skus?.[0];
  if (sku?.product_type) return sku.product_type;
  return t.title?.trim() || undefined;
}

export function TicketStatsRow({
  ticket,
  totalLabel = "Order Total",
  completedAt,
}: {
  ticket: StatsTicket;
  totalLabel?: "Order Total" | "Quote Total";
  /** When set (Completed page), replaces Due Date with this completion timestamp. */
  completedAt?: string | null;
}) {
  const total = Number(ticket.quote_final_total ?? 0);
  const cfg = buildConfig(ticket);
  const strategy = ticket.ticket_payment_strategy ?? "full";

  const checkout = computeCheckout(cfg, {
    quote_final_total: total,
    client_confirmed: ticket.client_confirmed,
    payment_amount_received: ticket.payment_amount_received,
    payment_paid_at: ticket.payment_paid_at,
    deposit_amount: ticket.deposit_amount,
    deposit_paid_at: ticket.deposit_paid_at,
    balance_paid_at: ticket.balance_paid_at,
    production_released_at: ticket.production_released_at,
    ticket_payment_strategy: ticket.ticket_payment_strategy,
    ticket_deposit_type: ticket.ticket_deposit_type,
    ticket_deposit_value: ticket.ticket_deposit_value,
  });

  const amountOnFile = checkout.amountPaid;
  const totalRefunded = Number(ticket.total_refunded_amount ?? 0);
  const refundStatus = ticket.refund_status ?? "none";
  const hasRefund = refundStatus === "partial" || refundStatus === "full";
  const lifetimeCollected = Math.round((amountOnFile + totalRefunded) * 100) / 100;

  const balanceDue = Math.max(0, Math.round((total - amountOnFile) * 100) / 100);
  let balanceLabel = "Balance Due";
  let balanceValue = formatCurrency(balanceDue);
  let balanceSub = balanceDue > 0.01 ? "Outstanding" : "Paid in full";
  let balanceColor: string | undefined =
    balanceDue > 0.01 ? "var(--color-danger)" : "var(--color-success)";

  if (hasRefund && refundStatus === "full") {
    balanceLabel = "Refunded";
    balanceValue = formatCurrency(totalRefunded);
    balanceSub =
      amountOnFile > 0.01
        ? `Fully refunded · ${formatCurrency(amountOnFile)} on file`
        : "Fully refunded · nothing owed";
    balanceColor = "var(--color-warning-text-deep)";
  } else if (hasRefund && totalRefunded > 0.01) {
    balanceSub = `${formatCurrency(totalRefunded)} refunded · ${balanceSub.toLowerCase()}`;
  }

  const ps = ticket.payment_status ?? "unpaid";
  const evidencePending = isPaymentEvidencePending(ticket);
  const overdue = isOverdue(ticket.due_date);

  let paymentValue = ps === "paid" ? "Paid in full" : ps === "partial" ? "Partial" : "Unpaid";
  let paymentSub = ticket.deposit_method
    ? getChannelLabel(ticket.deposit_method)
    : ticket.payment_method_used
      ? getChannelLabel(ticket.payment_method_used)
      : undefined;
  let paymentColor: string | undefined;

  if (hasRefund && !evidencePending) {
    paymentValue = refundStatus === "full" ? "Fully refunded" : "Partially refunded";
    paymentSub =
      totalRefunded > 0.01
        ? `${formatCurrency(totalRefunded)} refunded`
        : undefined;
    paymentColor = "var(--color-warning-text-deep)";
  } else if (evidencePending) {
    paymentValue = "Under review";
    paymentSub = paymentEvidenceAwaitingConfirmationLabel(ticket);
    paymentColor = "var(--color-warning-text-deep)";
  } else if (strategy === "net" && ps !== "paid") {
    paymentValue = ticket.ticket_net_terms_label?.replace("-", " ") ?? "Net terms";
    paymentSub = "No upfront payment";
    paymentColor = "var(--color-info-text)";
  } else if (ps === "partial") {
    paymentColor = "var(--color-accent-dark)";
  } else if (ps === "paid") {
    paymentColor = "var(--color-success)";
  } else {
    paymentColor = "var(--color-danger)";
  }

  const receivedValue = hasRefund && lifetimeCollected > 0.01
    ? formatCurrency(lifetimeCollected)
    : formatCurrency(amountOnFile);

  const receivedSub = hasRefund
    ? totalRefunded > 0.01
      ? `${formatCurrency(totalRefunded)} refunded · ${formatCurrency(amountOnFile)} on file`
      : `${formatCurrency(amountOnFile)} on file`
    : checkout.depositPaid && strategy === "partial"
      ? "Deposit paid"
      : amountOnFile > 0
        ? "Payment received"
        : "None yet";

  const receivedColor = hasRefund
    ? "var(--color-warning-text-deep)"
    : amountOnFile > 0
      ? "var(--color-success)"
      : undefined;

  const dueDateFormatted = ticket.due_date ? formatDate(ticket.due_date) : "—";
  const dueYear = ticket.due_date
    ? new Date(ticket.due_date + "T00:00:00").getFullYear()
    : null;

  const completedFormatted = completedAt ? formatDateTime(completedAt) : "—";
  const completedYear = completedAt ? new Date(completedAt).getFullYear() : null;

  const cards = [
    {
      key: "total",
      label: totalLabel,
      value: formatCurrency(total),
      subValue: primaryProductLabel(ticket),
      accent: true as const,
    },
    {
      key: "received",
      label: hasRefund ? "Collected" : "Received",
      value: receivedValue,
      subValue: receivedSub,
      valueColor: receivedColor,
    },
    {
      key: "balance",
      label: balanceLabel,
      value: balanceValue,
      subValue: balanceSub,
      valueColor: balanceColor,
    },
    completedAt
      ? {
          key: "completed",
          label: "Completed",
          value: completedFormatted,
          subValue: completedYear ? String(completedYear) : "Ready for pickup",
          valueColor: "var(--color-success)" as string | undefined,
        }
      : {
          key: "due",
          label: "Due Date",
          value: dueDateFormatted,
          subValue: overdue ? `Overdue · ${dueYear ?? ""}` : dueYear ? String(dueYear) : undefined,
          valueColor: overdue ? "var(--color-danger)" : undefined,
        },
    {
      key: "payment",
      label: "Payment",
      value: paymentValue,
      subValue: paymentSub,
      valueColor: paymentColor,
    },
  ];

  return (
    <>
      {/* Mobile: full-width total + 2×2 grid for the other four stats */}
      <div className="md:hidden space-y-2.5 mb-4">
        <DetailStatCard
          label={cards[0].label}
          value={cards[0].value}
          subValue={cards[0].subValue}
          accent
          compact
        />
        <div className="grid grid-cols-2 gap-2.5">
          {cards.slice(1).map((card) => (
            <DetailStatCard
              key={card.key}
              label={card.label}
              value={card.value}
              subValue={card.subValue}
              valueColor={card.valueColor}
              className="h-full min-w-0"
              compact
            />
          ))}
        </div>
      </div>

      {/* Tablet / desktop grid */}
      <div className="hidden md:grid md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {cards.map((card) => (
          <DetailStatCard
            key={card.key}
            label={card.label}
            value={card.value}
            subValue={card.subValue}
            accent={card.accent}
            valueColor={card.valueColor}
          />
        ))}
      </div>
    </>
  );
}
