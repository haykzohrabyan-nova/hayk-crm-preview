"use client";

import { formatCurrency } from "@/lib/utils/ticket-math";
import { computeCheckout, getChannelLabel } from "@/lib/utils/compute-checkout";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import type { PaymentConfig } from "@/lib/types";

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

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-sm shrink-0" style={{ color: "var(--color-text-muted)" }}>{label}</dt>
      <dd
        className="text-sm font-medium text-right break-words"
        style={{ color: highlight ? "var(--color-warning-text-deep)" : "var(--color-text-primary)" }}
      >
        {value}
      </dd>
    </div>
  );
}

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

export function OrderPaymentSummary({ ticket, compact = false }: { ticket: SummaryTicket; compact?: boolean }) {
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
            {ticket.payment_evidence_url && (
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
          </Section>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-4 space-y-6"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
    >
      {/* Payment summary */}
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

      {/* Production & evidence */}
      <Section title="Production & Evidence">
        {ticket.reference_code && (
          <SummaryRow label="Order reference" value={ticket.reference_code} />
        )}
        <SummaryRow label="Production released" value={fmtDate(ticket.production_released_at)} />
        <SummaryRow label="Status" value={ticket.ticket_status.replace(/_/g, " ")} />
        {ticket.payment_evidence_url && (
          <>
            <SummaryRow label="Payment evidence" value="File uploaded" />
            <SummaryRow label="Evidence submitted" value={fmtDate(ticket.payment_evidence_submitted_at)} />
            <div className="pt-2">
              <a
                href={ticket.id ? `/api/tickets/${ticket.id}/evidence` : ticket.payment_evidence_url}
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
        {!ticket.payment_evidence_url && ticket.deposit_method === "cash" && (
          <SummaryRow label="Payment evidence" value="Cash / offline — receipt on file" />
        )}
      </Section>
    </div>
  );
}
