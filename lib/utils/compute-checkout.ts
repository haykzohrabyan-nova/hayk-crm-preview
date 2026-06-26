// ─────────────────────────────────────────────────────────────────────────────
// computeCheckout — derives all checkout UI state from payment config + ticket
//
// Ported from the Pulse prototype (pulse-quote-payment.js, computeCheckout).
// Called on every render in quote-detail.tsx and used by the stepper, pay
// modal, and production gate.
// ─────────────────────────────────────────────────────────────────────────────

import type { PaymentConfig } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";

// ── Payment remittance info (shown to customers for Wire / ACH / Zelle) ──────
// These values are overridden at runtime by company_settings from the DB.
// This constant is the fallback / shape reference only.

export interface PaymentRemittance {
  bankName: string;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  zellePhone: string;
  zelleEmail: string;
}

// ── Input ticket shape (subset used by checkout) ─────────────────────────────

export interface CheckoutTicket {
  quote_final_total: number | null;
  client_confirmed: boolean;
  // Payment recording columns (migration 062)
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  production_released_at: string | null;
  // Per-ticket strategy override (migration 065) — takes priority over PaymentConfig
  ticket_payment_strategy?: "full" | "partial" | "net" | null;
  ticket_deposit_type?: "percent" | "fixed" | null;
  ticket_deposit_value?: number | null;
}

// ── Output ────────────────────────────────────────────────────────────────────

export type PayModalMode = "deposit" | "balance" | "full";

export interface CheckoutStep {
  id: "price" | "payment" | "production";
  label: string;
  description: string;
  done: boolean;
  active: boolean;
}

export interface CheckoutResult {
  // Amounts
  quoteTotal: number;
  depositDue: number;
  amountPaid: number;
  remaining: number;
  balance: number;    // remaining after deposit (partial only)
  dueNow: number;     // what to collect in the pay modal right now

  // Boolean flags
  priceStepDone: boolean;
  depositPaid: boolean;
  fullyPaid: boolean;
  paymentStepDone: boolean;
  productionReleased: boolean;
  canCollectDeposit: boolean;
  canCollectBalance: boolean;
  canCollectFull: boolean;
  canReleaseProduction: boolean;
  cashInPerson: boolean;
  partialCashDeposit: boolean;

  // UI
  blockReason: string | null;
  statusLabel: string;
  payModalMode: PayModalMode;
  steps: CheckoutStep[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min = 0): number {
  return Math.max(min, value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Strategy helpers (ported from pulse-quote-payment.js) ─────────────────────

/** Full payment with cash only — client pays in person; no remote quote confirmation. */
export function isCashInPerson(config: PaymentConfig): boolean {
  if (config.paymentStrategy !== "full") return false;
  const ch = config.paymentChannels ?? [];
  return ch.length === 1 && ch[0] === "cash";
}

/** Partial strategy with cash deposit handling — skips price-confirm gate. */
export function isPartialCashDeposit(config: PaymentConfig): boolean {
  return config.paymentStrategy === "partial" && config.depHandling === "cash";
}

/** @deprecated Payment no longer auto-confirms the quote when approval is required. */
export function shouldAutoConfirmOnFullPayment(
  _config: PaymentConfig,
  _amountPaid: number,
  _quoteTotal: number,
): boolean {
  return false;
}

/** Plain-text description of the production gate shown in the payment config UI. */
export function describeGatePreview(config: PaymentConfig, quoteTotal: number): string {
  const fmt = formatCurrency;

  const needConfirm = config.requireClientConfirm !== false;

  if (!needConfirm) {
    if (isCashInPerson(config)) {
      return `Cash in person — record full payment (${fmt(quoteTotal)}) with receipt ID → production. No quote confirmation required.`;
    }
    if (isPartialCashDeposit(config)) {
      const dep =
        config.depositType === "percent"
          ? round2(quoteTotal * clamp(config.depositValue, 0) / 100)
          : round2(Math.min(clamp(config.depositValue), quoteTotal));
      return `Cash / offline deposit (${fmt(dep)}) with receipt ID → production starts. Client can pay remaining balance while in production.`;
    }
  }

  const parts: string[] = [];
  if (needConfirm) parts.push("Customer must confirm on the public quote link");

  if (config.paymentStrategy === "partial") {
    const dep =
      config.depositType === "percent"
        ? round2(quoteTotal * clamp(config.depositValue, 0) / 100)
        : round2(Math.min(clamp(config.depositValue), quoteTotal));
    parts.push(`${config.depositType === "percent" ? `${config.depositValue}%` : fmt(config.depositValue)} deposit (${fmt(dep)}) → production`);
    parts.push("remaining balance optional during production");
  } else if (config.paymentStrategy === "full") {
    parts.push(`100% payment (${fmt(quoteTotal)}) → production`);
  } else {
    parts.push("No upfront payment (net terms) → production");
  }

  return `With current settings: ${parts.join(" → ")}.`;
}

// ── Main function ─────────────────────────────────────────────────────────────

export function computeCheckout(
  config: PaymentConfig,
  ticket: CheckoutTicket,
): CheckoutResult {
  // Per-ticket strategy overrides the admin config when set
  const strategy    = ticket.ticket_payment_strategy ?? config.paymentStrategy;
  const depositType = ticket.ticket_deposit_type     ?? config.depositType;
  const depositValue = ticket.ticket_deposit_value != null
    ? ticket.ticket_deposit_value
    : config.depositValue;
  const { requireClientConfirm } = config;

  const cashInPerson = isCashInPerson(config);
  const partialCashDeposit = isPartialCashDeposit(config);

  // ── Amounts ──────────────────────────────────────────────────────────────
  const quoteTotal = round2(ticket.quote_final_total ?? 0);

  const depositDue =
    strategy === "partial"
      ? depositType === "percent"
        ? round2(quoteTotal * (clamp(depositValue, 0) / 100))
        : round2(Math.min(clamp(depositValue), quoteTotal))
      : 0;

  // Amount already collected — prefer explicit field, fallback to deposit only
  const amountPaid = round2(
    ticket.payment_amount_received ??
      (ticket.deposit_amount != null ? ticket.deposit_amount : 0),
  );

  const remaining = round2(clamp(quoteTotal - amountPaid));
  const balance = round2(clamp(quoteTotal - depositDue)); // residual after deposit

  // ── Payment status flags ──────────────────────────────────────────────────
  const depositPaid =
    ticket.deposit_paid_at != null ||
    (strategy === "partial" && depositDue > 0 && amountPaid >= depositDue);

  const fullyPaid =
    ticket.payment_paid_at != null ||
    (quoteTotal > 0 && amountPaid >= quoteTotal);

  // ── Price step ────────────────────────────────────────────────────────────
  // When client confirmation is required, only the public confirm action (or
  // explicit client_confirmed on the ticket) satisfies the price gate —
  // never cash-in-person, partial-cash, or full payment alone.
  const priceStepDone =
    !requireClientConfirm ||
    ticket.client_confirmed;

  // ── Payment step ──────────────────────────────────────────────────────────
  const paymentStepDone =
    strategy === "net"
      ? true
      : strategy === "partial"
        ? depositPaid
        : fullyPaid; // 'full'

  // ── Production ────────────────────────────────────────────────────────────
  const productionReleased = ticket.production_released_at != null;
  const canReleaseProduction = priceStepDone && paymentStepDone;

  // ── Collection flags ──────────────────────────────────────────────────────
  const canCollectDeposit = strategy === "partial" && !depositPaid;
  const canCollectBalance =
    strategy === "partial" && depositPaid && !fullyPaid;
  const canCollectFull = strategy === "full" && !fullyPaid;

  // ── Pay modal mode ────────────────────────────────────────────────────────
  let payModalMode: PayModalMode;
  if (canCollectDeposit) {
    payModalMode = "deposit";
  } else if (canCollectBalance) {
    payModalMode = "balance";
  } else {
    payModalMode = "full";
  }

  // ── Due now ───────────────────────────────────────────────────────────────
  const dueNow = round2(
    payModalMode === "deposit"
      ? clamp(depositDue - amountPaid)
      : clamp(quoteTotal - amountPaid),
  );

  // ── Block reason ──────────────────────────────────────────────────────────
  let blockReason: string | null = null;
  if (!priceStepDone) {
    blockReason = "Customer must confirm the quote before production can start.";
  } else if (!paymentStepDone) {
    if (strategy === "partial") {
      blockReason = `Deposit of $${depositDue.toFixed(2)} is required before production can start.`;
    } else if (strategy === "full") {
      blockReason = cashInPerson
        ? `Record cash payment of $${quoteTotal.toFixed(2)} (with receipt ID) before production.`
        : "Full payment is required before production can start.";
    }
  }

  // ── Status label ──────────────────────────────────────────────────────────
  let statusLabel: string;
  if (fullyPaid) {
    statusLabel = "Paid";
  } else if (depositPaid) {
    statusLabel = "Deposit Paid";
  } else if (strategy === "net") {
    statusLabel = "Net Terms";
  } else {
    statusLabel = "Unpaid";
  }

  // ── Steps ─────────────────────────────────────────────────────────────────
  const steps: CheckoutStep[] = [
    {
      id: "price",
      label: "Quote Confirmed",
      description:
        requireClientConfirm
          ? "Customer must confirm on the public quote link"
          : "No confirmation required",
      done: priceStepDone,
      active: !priceStepDone,
    },
    {
      id: "payment",
      label:
        strategy === "partial"
          ? "Deposit Collected"
          : strategy === "net"
            ? "Net Terms"
            : "Payment Collected",
      description:
        strategy === "partial"
          ? `$${depositDue.toFixed(2)} deposit required`
          : strategy === "net"
            ? "No upfront payment required"
            : `$${quoteTotal.toFixed(2)} full payment required`,
      done: paymentStepDone,
      active: priceStepDone && !paymentStepDone,
    },
    {
      id: "production",
      label: "Production Released",
      description: productionReleased
        ? "Order released to production"
        : "Release after payment conditions are met",
      done: productionReleased,
      active: canReleaseProduction && !productionReleased,
    },
  ];

  return {
    quoteTotal,
    depositDue,
    amountPaid,
    remaining,
    balance,
    dueNow,
    priceStepDone,
    depositPaid,
    fullyPaid,
    paymentStepDone,
    productionReleased,
    canCollectDeposit,
    canCollectBalance,
    canCollectFull,
    canReleaseProduction,
    cashInPerson,
    partialCashDeposit,
    blockReason,
    statusLabel,
    payModalMode,
    steps,
  };
}

// ── Payment channel display helpers ──────────────────────────────────────────

export const PAYMENT_CHANNEL_LABELS: Record<string, string> = {
  cash:    "Cash/Terminal",
  wire:    "Wire Transfer",
  ach:     "ACH / Bank Transfer",
  zelle:   "Zelle",
  offline: "Offline / In-Person",
  card:    "Card on File (Square)",
  other:   "Other",
};

export function getChannelLabel(channel: string): string {
  return PAYMENT_CHANNEL_LABELS[channel] ?? channel;
}

export const ALL_PAYMENT_CHANNELS = [
  { value: "cash",    label: "Cash/Terminal" },
  { value: "wire",    label: "Wire Transfer" },
  { value: "ach",     label: "ACH / Bank Transfer" },
  { value: "zelle",   label: "Zelle" },
  { value: "offline", label: "Offline / In-Person" },
  { value: "card",    label: "Card on File (Square)" },
  { value: "other",   label: "Other" },
] as const;
