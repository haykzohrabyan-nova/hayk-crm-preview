"use client";

import { formatCurrency } from "@/lib/utils/ticket-math";
import { computeCheckout, getChannelLabel } from "@/lib/utils/compute-checkout";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import { paymentEvidenceTypeLabelForTicket } from "@/lib/utils/payment-evidence-type";
import type { PaymentConfig } from "@/lib/types";
import {
  DetailSection,
  DetailCollapsibleSection,
  DetailDataGrid,
  DetailDataCell,
  DetailFollowUpCard,
} from "@/components/quotes/quote-detail/detail-layout-primitives";

export interface SummaryTicket {
  id?: string;
  quote_final_total: number | null;
  client_confirmed: boolean;
  reference_code: string | null;
  ticket_status: string;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  ticket_dep_handling: "cash" | "gateway" | null;
  ticket_receipt_id: string | null;
  ticket_partial_channels: string[] | null;
  ticket_full_channels: string[] | null;
  ticket_require_client_confirm: boolean | null;
  ticket_net_terms_label: string | null;
  ticket_quote_channel: "sms" | "email" | "both" | null;
  ticket_dest_email: string | null;
  ticket_dest_phone: string | null;
  ticket_follow_up_enabled: boolean | null;
  ticket_follow_up_count: number | null;
  ticket_follow_up_freq: "daily" | "every-3-days" | "weekly" | null;
  quote_reminder_date: string | null;
  payment_status: "unpaid" | "partial" | "paid" | null;
  prepayment_status: "pending" | "paid" | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  payment_method_used: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  deposit_receipt_id: string | null;
  deposit_method: string | null;
  balance_paid_at: string | null;
  production_released_at: string | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_reviewed_at?: string | null;
  payment_evidence_amount?: number | null;
}

const STRATEGY_LABEL: Record<string, string> = {
  partial: "Partial payment",
  full:    "Pay in full",
  net:     "$0 upfront / Net terms",
};

const FREQ_LABEL: Record<string, string> = {
  daily:          "Every day",
  "every-3-days": "Every 3 days",
  weekly:         "Weekly",
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  sms:   "SMS",
  both:  "SMS + Email",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid:  "Unpaid",
  partial: "Partial — balance due",
  paid:    "Paid in full",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function SummaryRow({
  label,
  value,
  highlight,
  size = "sm",
  accent,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  size?: "sm" | "md" | "lg";
  accent?: boolean;
}) {
  const valueClass =
    size === "lg"
      ? "text-xl font-semibold"
      : size === "md"
        ? "text-base font-semibold"
        : "text-sm font-medium";

  return (
    <div className="flex justify-between items-baseline gap-4 py-1.5">
      <dt
        className={size === "lg" ? "text-sm font-medium shrink-0" : "text-sm shrink-0"}
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </dt>
      <dd
        className={`${valueClass} text-right break-words tabular-nums`}
        style={{
          color: accent
            ? "var(--color-accent)"
            : highlight
              ? "var(--color-warning-text-deep)"
              : "var(--color-text-primary)",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

export type PricingTicketFields = {
  quote_subtotal: number | null;
  quote_shipping: number | null;
  quote_pre_tax_total: number | null;
  quote_tax_amount: number | null;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
        {title}
      </p>
      <dl className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {children}
      </dl>
    </div>
  );
}

function buildConfig(t: SummaryTicket): PaymentConfig {
  const strategy = t.ticket_payment_strategy ?? "full";
  const channels = strategy === "partial"
    ? (t.ticket_partial_channels ?? [])
    : (t.ticket_full_channels ?? []);
  return {
    paymentStrategy:      strategy,
    depositType:          t.ticket_deposit_type ?? "percent",
    depositValue:         t.ticket_deposit_value ?? 0,
    depHandling:          t.ticket_dep_handling ?? "gateway",
    paymentChannels:      channels,
    requireClientConfirm: t.ticket_require_client_confirm ?? true,
  } as PaymentConfig;
}

function submittedAmount(ticket: SummaryTicket): number {
  if (ticket.payment_evidence_amount != null) return Number(ticket.payment_evidence_amount);
  const total = Number(ticket.quote_final_total ?? 0);
  const paid  = Number(ticket.payment_amount_received ?? 0);
  return Math.max(0, total - paid);
}

/** Quote pricing + live payment amounts in one card — used on payment review. */
export function PricingPaymentSummary({
  ticket,
  reviewPending = false,
}: {
  ticket: SummaryTicket & PricingTicketFields;
  reviewPending?: boolean;
}) {
  const subtotal = ticket.quote_subtotal ?? 0;
  const shipping = ticket.quote_shipping ?? 0;
  const preTax = ticket.quote_pre_tax_total ?? 0;
  const taxAmount = ticket.quote_tax_amount ?? 0;
  const total = Number(ticket.quote_final_total ?? 0);
  const discountAmount = Math.max(Math.round((subtotal + shipping - preTax) * 100) / 100, 0);

  const strategy = ticket.ticket_payment_strategy ?? "full";
  const cfg = buildConfig(ticket);
  const netTerms = ticket.ticket_net_terms_label?.replace("-", " ") ?? "Net terms";

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

  const amountPaid = checkout.amountPaid;
  const balanceDue = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
  const depositPaid = checkout.depositPaid;
  const depositAmt = Number(ticket.deposit_amount ?? (depositPaid ? amountPaid : 0));
  const fullyPaid = checkout.fullyPaid;
  const evidencePending = isPaymentEvidencePending(ticket);
  const submitted = submittedAmount(ticket);
  const receivedBefore = amountPaid;
  const afterConfirm = Math.min(receivedBefore + submitted, total);
  const remainingAfterConfirm = Math.max(0, Math.round((total - afterConfirm) * 100) / 100);

  const pricingRows: [string, number][] = [
    ["Subtotal", subtotal],
    ["Shipping", shipping],
    ["Discount", -discountAmount],
    ["Tax", taxAmount],
  ];

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
        Pricing &amp; payment
      </p>

      <dl className="space-y-1">
        {pricingRows.map(([label, val]) =>
          val !== 0 ? (
            <SummaryRow key={label} label={label} value={formatCurrency(Math.abs(val))} />
          ) : null,
        )}
        <div className="pt-2 mt-1 border-t" style={{ borderColor: "var(--color-border)" }}>
          <SummaryRow label="Order total" value={formatCurrency(total)} size="lg" accent />
        </div>
      </dl>

      <dl className="space-y-1 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
        <SummaryRow label="Strategy" value={STRATEGY_LABEL[strategy] ?? strategy} />
        <SummaryRow
          label="Payment status"
          value={
            evidencePending || reviewPending
              ? "Under review — awaiting accountant confirmation"
              : PAYMENT_STATUS_LABEL[ticket.payment_status ?? "unpaid"] ?? "Unpaid"
          }
          highlight={evidencePending || reviewPending}
        />

        {strategy === "partial" && (
          <>
            {!depositPaid ? (
              <>
                <SummaryRow label="Deposit due" value={formatCurrency(checkout.depositDue)} size="md" highlight />
                <SummaryRow
                  label="Balance after deposit"
                  value={formatCurrency(Math.max(0, total - checkout.depositDue))}
                  size="md"
                />
              </>
            ) : (
              <>
                <SummaryRow label="Deposit paid" value={formatCurrency(depositAmt)} size="md" />
                <SummaryRow
                  label="Balance due"
                  value={formatCurrency(balanceDue)}
                  size="md"
                  highlight={balanceDue > 0.01}
                />
              </>
            )}
          </>
        )}

        {strategy === "full" && !fullyPaid && receivedBefore <= 0 && !reviewPending && (
          <SummaryRow label="Due now" value={formatCurrency(total)} size="md" highlight={total > 0.01} />
        )}

        {strategy === "full" && receivedBefore > 0 && !reviewPending && (
          <SummaryRow label="Paid so far" value={formatCurrency(receivedBefore)} size="md" />
        )}

        {strategy === "net" && (
          <SummaryRow label="Terms" value={netTerms.charAt(0).toUpperCase() + netTerms.slice(1)} />
        )}

        {(reviewPending || evidencePending) && (
          <>
            <SummaryRow
              label="Payment for"
              value={paymentEvidenceTypeLabelForTicket(ticket)}
              highlight
            />
            <SummaryRow label="Amount submitted" value={formatCurrency(submitted)} size="md" highlight />
            <SummaryRow label="Previously received" value={formatCurrency(receivedBefore)} />
            <SummaryRow
              label="Remaining after confirmation"
              value={formatCurrency(remainingAfterConfirm)}
              size="lg"
              highlight={remainingAfterConfirm > 0.01}
            />
            <SummaryRow label="Submitted at" value={fmtDate(ticket.payment_evidence_submitted_at)} />
          </>
        )}

        {!reviewPending && !evidencePending && fullyPaid && (
          <SummaryRow label="Total received" value={formatCurrency(amountPaid)} size="md" />
        )}

        {!reviewPending && !evidencePending && ticket.payment_paid_at && (
          <SummaryRow label="Fully paid at" value={fmtDate(ticket.payment_paid_at)} />
        )}
      </dl>
    </div>
  );
}

/** Live payment amounts — how much is due, submitted, and remaining. */
export function PaymentAmountSummary({
  ticket,
  reviewPending = false,
}: {
  ticket: SummaryTicket;
  /** Include amount submitted + remaining after accountant confirms. */
  reviewPending?: boolean;
}) {
  const strategy = ticket.ticket_payment_strategy ?? "full";
  const total    = Number(ticket.quote_final_total ?? 0);
  const cfg      = buildConfig(ticket);
  const netTerms = ticket.ticket_net_terms_label?.replace("-", " ") ?? "Net terms";

  const checkout = computeCheckout(cfg, {
    quote_final_total:       total,
    client_confirmed:        ticket.client_confirmed,
    payment_amount_received: ticket.payment_amount_received,
    payment_paid_at:         ticket.payment_paid_at,
    deposit_amount:          ticket.deposit_amount,
    deposit_paid_at:         ticket.deposit_paid_at,
    balance_paid_at:         ticket.balance_paid_at,
    production_released_at:  ticket.production_released_at,
    ticket_payment_strategy: ticket.ticket_payment_strategy,
    ticket_deposit_type:     ticket.ticket_deposit_type,
    ticket_deposit_value:    ticket.ticket_deposit_value,
  });

  const amountPaid  = checkout.amountPaid;
  const balanceDue  = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
  const depositPaid = checkout.depositPaid;
  const depositAmt  = Number(ticket.deposit_amount ?? (depositPaid ? amountPaid : 0));
  const fullyPaid   = checkout.fullyPaid;
  const evidencePending = isPaymentEvidencePending(ticket);
  const submitted = submittedAmount(ticket);
  const receivedBefore = amountPaid;
  const afterConfirm = Math.min(receivedBefore + submitted, total);
  const remainingAfterConfirm = Math.max(0, Math.round((total - afterConfirm) * 100) / 100);

  return (
    <Section title="Payment summary">
      <SummaryRow label="Strategy" value={STRATEGY_LABEL[strategy] ?? strategy} />
      <SummaryRow label="Order total" value={formatCurrency(total)} size="md" accent />
      <SummaryRow
        label="Payment status"
        value={
          evidencePending || reviewPending
            ? "Under review — awaiting accountant confirmation"
            : PAYMENT_STATUS_LABEL[ticket.payment_status ?? "unpaid"] ?? "Unpaid"
        }
        highlight={evidencePending || reviewPending}
      />

      {strategy === "partial" && (
        <>
          {!depositPaid ? (
            <>
              <SummaryRow label="Deposit due" value={formatCurrency(checkout.depositDue)} size="md" highlight />
              <SummaryRow
                label="Balance after deposit"
                value={formatCurrency(Math.max(0, total - checkout.depositDue))}
                size="md"
              />
            </>
          ) : (
            <>
              <SummaryRow label="Deposit paid" value={formatCurrency(depositAmt)} size="md" />
              <SummaryRow
                label="Balance due"
                value={formatCurrency(balanceDue)}
                size="md"
                highlight={balanceDue > 0.01}
              />
            </>
          )}
        </>
      )}

      {strategy === "full" && !fullyPaid && receivedBefore <= 0 && !reviewPending && (
        <SummaryRow label="Due now" value={formatCurrency(total)} highlight={total > 0.01} />
      )}

      {strategy === "full" && receivedBefore > 0 && !reviewPending && (
        <SummaryRow label="Paid so far" value={formatCurrency(receivedBefore)} />
      )}

      {strategy === "net" && (
        <SummaryRow label="Terms" value={netTerms.charAt(0).toUpperCase() + netTerms.slice(1)} />
      )}

      {(reviewPending || evidencePending) && (
        <>
          <SummaryRow
            label="Payment for"
            value={paymentEvidenceTypeLabelForTicket(ticket)}
            highlight
          />
          <SummaryRow label="Amount submitted" value={formatCurrency(submitted)} size="md" highlight />
          <SummaryRow label="Previously received" value={formatCurrency(receivedBefore)} />
          <SummaryRow
            label="Remaining after confirmation"
            value={formatCurrency(remainingAfterConfirm)}
            size="lg"
            highlight={remainingAfterConfirm > 0.01}
          />
          <SummaryRow label="Submitted at" value={fmtDate(ticket.payment_evidence_submitted_at)} />
        </>
      )}

      {!reviewPending && !evidencePending && fullyPaid && (
        <SummaryRow label="Total received" value={formatCurrency(amountPaid)} />
      )}

      {!reviewPending && !evidencePending && ticket.payment_paid_at && (
        <SummaryRow label="Fully paid at" value={fmtDate(ticket.payment_paid_at)} />
      )}
      {!reviewPending && !evidencePending && ticket.balance_paid_at && (
        <SummaryRow label="Balance paid at" value={fmtDate(ticket.balance_paid_at)} />
      )}
      {!reviewPending && !evidencePending && ticket.payment_method_used && (
        <SummaryRow label="Last payment method" value={getChannelLabel(ticket.payment_method_used)} />
      )}
    </Section>
  );
}

export function OrderPaymentSummary({
  ticket,
  compact = false,
  canViewPaymentEvidence = true,
  paymentReviewAbove = false,
  layout = "default",
}: {
  ticket: SummaryTicket;
  compact?: boolean;
  /** When false, pending evidence is shown without file link (sales/SDR on /orders). */
  canViewPaymentEvidence?: boolean;
  /** Payment review card is shown above — omit duplicate live payment / evidence rows. */
  paymentReviewAbove?: boolean;
  layout?: "default" | "grid";
}) {
  const strategy = ticket.ticket_payment_strategy ?? "full";
  const total    = Number(ticket.quote_final_total ?? 0);
  const cfg      = buildConfig(ticket);

  const checkout = computeCheckout(cfg, {
    quote_final_total:       total,
    client_confirmed:        ticket.client_confirmed,
    payment_amount_received: ticket.payment_amount_received,
    payment_paid_at:         ticket.payment_paid_at,
    deposit_amount:          ticket.deposit_amount,
    deposit_paid_at:         ticket.deposit_paid_at,
    balance_paid_at:         ticket.balance_paid_at,
    production_released_at:  ticket.production_released_at,
    ticket_payment_strategy: ticket.ticket_payment_strategy,
    ticket_deposit_type:     ticket.ticket_deposit_type,
    ticket_deposit_value:    ticket.ticket_deposit_value,
  });

  const amountPaid  = checkout.amountPaid;
  const balanceDue  = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
  const depositPaid = checkout.depositPaid;
  const depositAmt  = Number(ticket.deposit_amount ?? (depositPaid ? amountPaid : 0));
  const fullyPaid   = checkout.fullyPaid;
  const channels   = strategy === "partial"
    ? (ticket.ticket_partial_channels ?? [])
    : (ticket.ticket_full_channels ?? []);
  const channelStr = channels.map(getChannelLabel).join(", ") || "—";

  const destParts: string[] = [];
  if (ticket.ticket_dest_email) destParts.push(ticket.ticket_dest_email);
  if (ticket.ticket_dest_phone) destParts.push(ticket.ticket_dest_phone);
  const sendDest = destParts.join(" · ") || "—";

  const followUpEnabled = ticket.ticket_follow_up_enabled ?? false;
  const netTerms = ticket.ticket_net_terms_label?.replace("-", " ") ?? "Net terms";
  const evidencePending = isPaymentEvidencePending(ticket);
  const showEvidenceLink = canViewPaymentEvidence && !!ticket.payment_evidence_url;
  const showEvidencePendingNote =
    evidencePending && !!ticket.payment_evidence_url && !canViewPaymentEvidence;

  if (paymentReviewAbove && !compact && layout === "grid") {
    return (
      <>
        <DetailSection>
          <DetailCollapsibleSection title="Payment plan">
            <DetailDataGrid>
              <DetailDataCell label="Strategy" value={STRATEGY_LABEL[strategy] ?? strategy} />
              <DetailDataCell label="Accepted channels" value={channelStr} />
              {strategy === "partial" && ticket.ticket_dep_handling && (
                <DetailDataCell
                  label="Deposit collection"
                  value={ticket.ticket_dep_handling === "cash" ? "Cash / offline" : "Online gateway"}
                />
              )}
              {strategy === "net" && (
                <DetailDataCell label="Terms" value={netTerms.charAt(0).toUpperCase() + netTerms.slice(1)} />
              )}
              <DetailDataCell
                label="Price confirmation"
                value={
                  ticket.ticket_require_client_confirm === false
                    ? "Not required"
                    : ticket.client_confirmed
                      ? "Confirmed by customer"
                      : "Required — pending"
                }
              />
            </DetailDataGrid>
          </DetailCollapsibleSection>
        </DetailSection>
        <DetailSection>
          <DetailCollapsibleSection title="Quote delivery">
            <DetailDataGrid>
              <DetailDataCell
                label="Send quote via"
                value={ticket.ticket_quote_channel ? (CHANNEL_LABEL[ticket.ticket_quote_channel] ?? ticket.ticket_quote_channel) : "—"}
              />
              <DetailDataCell label="Destination" value={sendDest} />
            </DetailDataGrid>
          </DetailCollapsibleSection>
        </DetailSection>
        {followUpEnabled && (
          <DetailSection>
            <DetailCollapsibleSection title="Follow-up schedule">
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-3">
                <DetailFollowUpCard label="Reminders" value="Enabled" valueColor="var(--color-success)" />
                <DetailFollowUpCard label="Follow-ups" value={String(ticket.ticket_follow_up_count ?? "—")} />
                <DetailFollowUpCard
                  label="Frequency"
                  value={ticket.ticket_follow_up_freq ? (FREQ_LABEL[ticket.ticket_follow_up_freq] ?? ticket.ticket_follow_up_freq) : "—"}
                />
                <DetailFollowUpCard
                  label="Start date"
                  value={ticket.quote_reminder_date
                    ? new Date(ticket.quote_reminder_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "—"}
                />
              </div>
            </DetailCollapsibleSection>
          </DetailSection>
        )}
      </>
    );
  }

  if (paymentReviewAbove && !compact) {
    return (
      <div
        className="rounded-lg p-4 space-y-6"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
      >
        <Section title="Payment plan">
          <SummaryRow label="Strategy" value={STRATEGY_LABEL[strategy] ?? strategy} />
          <SummaryRow label="Accepted channels" value={channelStr} />
          {strategy === "partial" && ticket.ticket_dep_handling && (
            <SummaryRow
              label="Deposit collection"
              value={ticket.ticket_dep_handling === "cash" ? "Cash / offline" : "Online gateway"}
            />
          )}
          {strategy === "net" && (
            <SummaryRow label="Terms" value={netTerms.charAt(0).toUpperCase() + netTerms.slice(1)} />
          )}
          <SummaryRow
            label="Price confirmation"
            value={
              ticket.ticket_require_client_confirm === false
                ? "Not required"
                : ticket.client_confirmed
                  ? "Confirmed by customer"
                  : "Required — pending"
            }
          />
          {ticket.ticket_receipt_id && !ticket.deposit_receipt_id && (
            <SummaryRow label="Receipt ID (config)" value={ticket.ticket_receipt_id} />
          )}
        </Section>

        <Section title="Quote delivery">
          <SummaryRow
            label="Send quote via"
            value={ticket.ticket_quote_channel ? (CHANNEL_LABEL[ticket.ticket_quote_channel] ?? ticket.ticket_quote_channel) : "—"}
          />
          <SummaryRow label="Destination" value={sendDest} />
        </Section>

        <Section title="Follow-up schedule">
          <SummaryRow label="Reminders enabled" value={followUpEnabled ? "Yes" : "No"} />
          {followUpEnabled && (
            <>
              <SummaryRow label="Number of follow-ups" value={String(ticket.ticket_follow_up_count ?? "—")} />
              <SummaryRow
                label="Frequency"
                value={ticket.ticket_follow_up_freq ? (FREQ_LABEL[ticket.ticket_follow_up_freq] ?? ticket.ticket_follow_up_freq) : "—"}
              />
              <SummaryRow
                label="Reminder start date"
                value={ticket.quote_reminder_date
                  ? new Date(ticket.quote_reminder_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—"}
              />
            </>
          )}
          {strategy === "partial" && ticket.ticket_dep_handling === "cash" && followUpEnabled && (
            <p className="text-xs pt-2" style={{ color: "var(--color-text-muted)" }}>
              Applies to cash deposits — reminders for quote confirmation and balance collection.
            </p>
          )}
        </Section>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="rounded-lg p-4 space-y-4"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
      >
        <Section title="Payment Details">
          {strategy === "partial" && depositPaid && (
            <>
              <SummaryRow label="Deposit paid" value={formatCurrency(depositAmt)} />
              <SummaryRow
                label="Balance due"
                value={formatCurrency(balanceDue)}
                highlight={balanceDue > 0.01}
              />
            </>
          )}
          {strategy === "full" && fullyPaid && (
            <SummaryRow label="Total received" value={formatCurrency(amountPaid)} />
          )}
          {strategy === "full" && !fullyPaid && amountPaid > 0 && (
            <>
              <SummaryRow label="Paid" value={formatCurrency(amountPaid)} />
              <SummaryRow label="Balance due" value={formatCurrency(balanceDue)} highlight={balanceDue > 0.01} />
            </>
          )}
          {strategy === "full" && amountPaid <= 0 && (
            <SummaryRow label="Due" value={formatCurrency(total)} highlight={total > 0.01} />
          )}
          {strategy === "net" && (
            <SummaryRow label="Terms" value={netTerms.charAt(0).toUpperCase() + netTerms.slice(1)} />
          )}
          {ticket.payment_method_used && (
            <SummaryRow label="Payment method" value={getChannelLabel(ticket.payment_method_used)} />
          )}
          {ticket.payment_paid_at && (
            <SummaryRow label="Fully paid at" value={fmtDate(ticket.payment_paid_at)} />
          )}
          {ticket.deposit_paid_at && (
            <SummaryRow label="Deposit paid at" value={fmtDate(ticket.deposit_paid_at)} />
          )}
        </Section>

        {(ticket.payment_evidence_url || ticket.production_released_at) && (
          <Section title="Evidence & Production">
            {ticket.production_released_at && (
              <SummaryRow label="Production started" value={fmtDate(ticket.production_released_at)} />
            )}
            {showEvidenceLink && (
              <>
                <SummaryRow label="Evidence submitted" value={fmtDate(ticket.payment_evidence_submitted_at)} />
                {ticket.id && (
                  <div className="pt-2">
                    <a
                      href={`/api/tickets/${ticket.id}/evidence`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium underline"
                      style={{ color: "var(--color-tab-active)" }}
                    >
                      View payment evidence
                    </a>
                  </div>
                )}
              </>
            )}
            {showEvidencePendingNote && (
              <SummaryRow
                label="Payment proof"
                value="Submitted — awaiting accountant review"
                highlight
              />
            )}
          </Section>
        )}
      </div>
    );
  }

  if (layout === "grid") {
    const statusLabel = evidencePending
      ? "Under review — awaiting confirmation"
      : PAYMENT_STATUS_LABEL[ticket.payment_status ?? "unpaid"] ?? "Unpaid";

    return (
      <>
        <DetailSection>
          <DetailCollapsibleSection title="Payment &amp; order settings">
            <DetailDataGrid>
              <DetailDataCell label="Strategy" value={STRATEGY_LABEL[strategy] ?? strategy} />
              <DetailDataCell
                label="Payment status"
                value={statusLabel}
                valueColor={evidencePending ? "var(--color-warning-text-deep)" : ticket.payment_status === "partial" ? "var(--color-accent-dark)" : undefined}
              />
              {strategy === "partial" && depositPaid && (
                <>
                  <DetailDataCell label="Deposit paid" value={formatCurrency(depositAmt)} valueColor="var(--color-success)" />
                  <DetailDataCell label="Deposit paid at" value={fmtDate(ticket.deposit_paid_at)} />
                  {ticket.deposit_method && (
                    <DetailDataCell label="Deposit method" value={getChannelLabel(ticket.deposit_method)} />
                  )}
                  <DetailDataCell
                    label="Balance due"
                    value={formatCurrency(balanceDue)}
                    valueColor={balanceDue > 0.01 ? "var(--color-danger)" : "var(--color-success)"}
                  />
                </>
              )}
              {strategy === "partial" && !depositPaid && (
                <>
                  <DetailDataCell label="Deposit due" value={formatCurrency(checkout.depositDue)} valueColor="var(--color-warning-text-deep)" />
                  <DetailDataCell label="Balance after deposit" value={formatCurrency(Math.max(0, total - checkout.depositDue))} />
                </>
              )}
              {strategy === "full" && !fullyPaid && amountPaid <= 0 && (
                <DetailDataCell label="Due now" value={formatCurrency(total)} valueColor="var(--color-danger)" />
              )}
              {strategy === "full" && amountPaid > 0 && (
                <DetailDataCell label="Paid so far" value={formatCurrency(amountPaid)} valueColor="var(--color-success)" />
              )}
              {strategy === "net" && (
                <DetailDataCell label="Terms" value={netTerms.charAt(0).toUpperCase() + netTerms.slice(1)} />
              )}
              {fullyPaid && (
                <DetailDataCell label="Total received" value={formatCurrency(amountPaid)} valueColor="var(--color-success)" />
              )}
              {ticket.payment_paid_at && (
                <DetailDataCell label="Fully paid at" value={fmtDate(ticket.payment_paid_at)} />
              )}
              {ticket.balance_paid_at && (
                <DetailDataCell label="Balance paid at" value={fmtDate(ticket.balance_paid_at)} />
              )}
              {strategy === "partial" && ticket.ticket_dep_handling && (
                <DetailDataCell
                  label="Deposit collection"
                  value={ticket.ticket_dep_handling === "cash" ? "Cash / offline" : "Online gateway"}
                />
              )}
              <DetailDataCell
                label="Price confirmation"
                value={
                  ticket.ticket_require_client_confirm === false
                    ? "Not required"
                    : ticket.client_confirmed
                      ? "Confirmed by customer"
                      : "Required — pending"
                }
              />
              <DetailDataCell label="Accepted channels" value={channelStr} />
            </DetailDataGrid>
          </DetailCollapsibleSection>
        </DetailSection>

        <DetailSection>
          <DetailCollapsibleSection title="Quote delivery">
            <DetailDataGrid>
              <DetailDataCell
                label="Send quote via"
                value={ticket.ticket_quote_channel ? (CHANNEL_LABEL[ticket.ticket_quote_channel] ?? ticket.ticket_quote_channel) : "—"}
              />
              <DetailDataCell label="Destination" value={sendDest} />
            </DetailDataGrid>
          </DetailCollapsibleSection>
        </DetailSection>

        <DetailSection>
          <DetailCollapsibleSection title="Follow-up schedule">
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-3">
              <DetailFollowUpCard
                label="Reminders"
                value={followUpEnabled ? "Enabled" : "Disabled"}
                valueColor={followUpEnabled ? "var(--color-success)" : undefined}
              />
              {followUpEnabled && (
                <>
                  <DetailFollowUpCard label="Follow-ups" value={String(ticket.ticket_follow_up_count ?? "—")} />
                  <DetailFollowUpCard
                    label="Frequency"
                    value={ticket.ticket_follow_up_freq ? (FREQ_LABEL[ticket.ticket_follow_up_freq] ?? ticket.ticket_follow_up_freq) : "—"}
                  />
                  <DetailFollowUpCard
                    label="Start date"
                    value={ticket.quote_reminder_date
                      ? new Date(ticket.quote_reminder_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  />
                </>
              )}
            </div>
          </DetailCollapsibleSection>
        </DetailSection>

        <DetailSection>
          <DetailCollapsibleSection title="Production &amp; evidence">
            <DetailDataGrid>
              {ticket.reference_code && (
                <DetailDataCell label="Order reference" value={ticket.reference_code} />
              )}
              <DetailDataCell label="Production released" value={fmtDate(ticket.production_released_at)} />
              <DetailDataCell
                label="Status"
                value={ticket.ticket_status.replace(/_/g, " ")}
                valueColor="var(--color-info-text)"
              />
              <DetailDataCell label="Accepted channels" value={channelStr} />
              {showEvidenceLink && ticket.id && (
                <DetailDataCell
                  label="Payment evidence"
                  value={
                    <a
                      href={`/api/tickets/${ticket.id}/evidence`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: "var(--color-tab-active)" }}
                    >
                      View uploaded file
                    </a>
                  }
                />
              )}
              {showEvidencePendingNote && (
                <DetailDataCell label="Payment proof" value="Submitted — awaiting review" valueColor="var(--color-warning-text-deep)" />
              )}
            </DetailDataGrid>
          </DetailCollapsibleSection>
        </DetailSection>
      </>
    );
  }

  return (
    <div
      className="rounded-lg p-4 space-y-6"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
    >
      <Section title="Payment Summary">
        <SummaryRow label="Strategy" value={STRATEGY_LABEL[strategy] ?? strategy} />
        <SummaryRow label="Quote total" value={formatCurrency(total)} />
        <SummaryRow
          label="Payment status"
          value={
            isPaymentEvidencePending(ticket)
              ? "Under review — awaiting accountant confirmation"
              : PAYMENT_STATUS_LABEL[ticket.payment_status ?? "unpaid"] ?? "Unpaid"
          }
        />

        {strategy === "partial" && (
          <>
            {!depositPaid ? (
              <>
                <SummaryRow label="Deposit due" value={formatCurrency(checkout.depositDue)} highlight />
                <SummaryRow
                  label="Balance after deposit"
                  value={formatCurrency(Math.max(0, total - checkout.depositDue))}
                />
                <SummaryRow label="Deposit paid" value="Not yet recorded" highlight />
              </>
            ) : (
              <>
                <SummaryRow label="Deposit paid" value={formatCurrency(depositAmt)} />
                <SummaryRow label="Deposit paid at" value={fmtDate(ticket.deposit_paid_at)} />
                {ticket.deposit_receipt_id && (
                  <SummaryRow label="Deposit receipt ID" value={ticket.deposit_receipt_id} />
                )}
                {ticket.deposit_method && (
                  <SummaryRow label="Deposit method" value={getChannelLabel(ticket.deposit_method)} />
                )}
                <SummaryRow
                  label="Balance due"
                  value={formatCurrency(balanceDue)}
                  highlight={balanceDue > 0.01}
                />
              </>
            )}
          </>
        )}

        {strategy === "full" && !fullyPaid && amountPaid <= 0 && (
          <SummaryRow label="Due now" value={formatCurrency(total)} highlight={total > 0.01} />
        )}

        {strategy === "full" && amountPaid > 0 && (
          <SummaryRow label="Paid" value={formatCurrency(amountPaid)} />
        )}

        {strategy === "net" && (
          <SummaryRow label="Terms" value={netTerms.charAt(0).toUpperCase() + netTerms.slice(1)} />
        )}

        {fullyPaid && (
          <SummaryRow label="Total received" value={formatCurrency(amountPaid)} />
        )}

        {ticket.payment_paid_at && (
          <SummaryRow label="Fully paid at" value={fmtDate(ticket.payment_paid_at)} />
        )}
        {ticket.balance_paid_at && (
          <SummaryRow label="Balance paid at" value={fmtDate(ticket.balance_paid_at)} />
        )}
        {ticket.payment_method_used && (
          <SummaryRow label="Last payment method" value={getChannelLabel(ticket.payment_method_used)} />
        )}

        <SummaryRow label="Accepted channels" value={channelStr} />
        {strategy === "partial" && ticket.ticket_dep_handling && (
          <SummaryRow
            label="Deposit collection"
            value={ticket.ticket_dep_handling === "cash" ? "Cash / offline" : "Online gateway"}
          />
        )}
        <SummaryRow
          label="Price confirmation"
          value={
            ticket.ticket_require_client_confirm === false
              ? "Not required"
              : ticket.client_confirmed
                ? "Confirmed by customer"
                : "Required — pending"
          }
        />
        {ticket.ticket_receipt_id && !ticket.deposit_receipt_id && (
          <SummaryRow label="Receipt ID (config)" value={ticket.ticket_receipt_id} />
        )}
      </Section>

      {/* Delivery */}
      <Section title="Quote Delivery">
        <SummaryRow
          label="Send quote via"
          value={ticket.ticket_quote_channel ? (CHANNEL_LABEL[ticket.ticket_quote_channel] ?? ticket.ticket_quote_channel) : "—"}
        />
        <SummaryRow label="Destination" value={sendDest} />
      </Section>

      {/* Follow-up */}
      <Section title="Follow-up Schedule">
        <SummaryRow label="Reminders enabled" value={followUpEnabled ? "Yes" : "No"} />
        {followUpEnabled && (
          <>
            <SummaryRow label="Number of follow-ups" value={String(ticket.ticket_follow_up_count ?? "—")} />
            <SummaryRow
              label="Frequency"
              value={ticket.ticket_follow_up_freq ? (FREQ_LABEL[ticket.ticket_follow_up_freq] ?? ticket.ticket_follow_up_freq) : "—"}
            />
            <SummaryRow
              label="Reminder start date"
              value={ticket.quote_reminder_date
                ? new Date(ticket.quote_reminder_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "—"}
            />
          </>
        )}
        {strategy === "partial" && ticket.ticket_dep_handling === "cash" && followUpEnabled && (
          <p className="text-xs pt-2" style={{ color: "var(--color-text-muted)" }}>
            Applies to cash deposits — reminders for quote confirmation and balance collection.
          </p>
        )}
      </Section>

      {/* Production & evidence — skip when payment review card covers it above */}
      {!paymentReviewAbove && (
      <Section title="Production & Evidence">
        {ticket.reference_code && (
          <SummaryRow label="Order reference" value={ticket.reference_code} />
        )}
        <SummaryRow label="Production released" value={fmtDate(ticket.production_released_at)} />
        <SummaryRow label="Status" value={ticket.ticket_status.replace(/_/g, " ")} />
        {showEvidenceLink && (
          <>
            <SummaryRow label="Payment evidence" value="File uploaded" />
            <SummaryRow label="Evidence submitted" value={fmtDate(ticket.payment_evidence_submitted_at)} />
            <div className="pt-2">
              <a
                href={ticket.id ? `/api/tickets/${ticket.id}/evidence` : ticket.payment_evidence_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium underline"
                style={{ color: "var(--color-tab-active)" }}
              >
                View payment evidence
              </a>
            </div>
          </>
        )}
        {showEvidencePendingNote && (
          <SummaryRow
            label="Payment proof"
            value="Submitted — awaiting accountant review"
            highlight
          />
        )}
        {!ticket.payment_evidence_url && ticket.deposit_method === "cash" && (
          <SummaryRow label="Payment evidence" value="Cash / offline — receipt on file" />
        )}
      </Section>
      )}
    </div>
  );
}
