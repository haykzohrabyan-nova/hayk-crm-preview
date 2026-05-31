"use client";

import { FileText } from "lucide-react";
import {
  stripePaymentDashboardUrl,
  stripeRefundDashboardUrl,
} from "@/lib/stripe/dashboard-url";
import { OpenInStripeLink } from "@/components/ui/open-in-stripe-link";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { formatDateTime } from "@/lib/utils/format";
import { getChannelLabel } from "@/lib/utils/compute-checkout";
import { paymentEvidenceTypeLabel } from "@/lib/utils/payment-evidence-type";
import {
  listRefundablePaymentSlots,
  type RefundableSlotTicket,
} from "@/lib/payments/refundable-payment-slots";
import type { TicketPaymentRefundRecord } from "@/lib/payments/fetch-ticket-refunds";
import {
  DetailCollapsibleSection,
  DetailSection,
} from "@/components/quotes/quote-detail/detail-layout-primitives";
import { canViewRefundEvidence } from "@/lib/payments/can-view-refund-evidence";

export function PaymentsReceivedSection({
  ticket,
  priorRefunds,
}: {
  ticket: RefundableSlotTicket;
  priorRefunds?: { payment_mode: string; amount: number | string }[];
}) {
  const slots = listRefundablePaymentSlots(ticket, priorRefunds);
  if (slots.length === 0) return null;

  return (
    <DetailSection>
      <DetailCollapsibleSection title="Payments received" defaultOpen={false}>
        <ul className="space-y-2">
          {slots.map((s) => (
            <li
              key={s.mode}
              className="flex flex-wrap items-baseline justify-between gap-2 text-sm rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
            >
              <span style={{ color: "var(--color-text-primary)" }}>
                <span className="font-medium">{s.label}</span>
                {" · "}
                {formatCurrency(s.amountRecorded)}
                {" · "}
                {getChannelLabel(s.method)}
              </span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {s.paidAt ? formatDateTime(s.paidAt) : "—"}
                {s.amountRefunded > 0.01 ? ` · ${formatCurrency(s.amountRefunded)} refunded` : ""}
              </span>
            </li>
          ))}
        </ul>
      </DetailCollapsibleSection>
    </DetailSection>
  );
}

export function RefundHistorySection({
  ticketId,
  ticket,
  refunds,
  userRole,
  defaultOpen = true,
}: {
  ticketId: string;
  ticket: RefundableSlotTicket & {
    refund_status?: string | null;
    total_refunded_amount?: number | null;
    payment_amount_received?: number | null;
    stripe_payment_intent_id?: string | null;
  };
  refunds: TicketPaymentRefundRecord[];
  userRole: string | null;
  defaultOpen?: boolean;
}) {
  const canViewEvidence = canViewRefundEvidence(userRole);
  const status = ticket.refund_status ?? "none";
  const totalRefunded = Number(ticket.total_refunded_amount ?? 0);
  const received = Number(ticket.payment_amount_received ?? 0);

  if (status === "none" && refunds.length === 0) return null;

  const statusLabel =
    status === "full" ? "Fully refunded" : status === "partial" ? "Partially refunded" : "Refunded";

  const paymentIntentId = ticket.stripe_payment_intent_id?.trim() || null;
  const hasStripeRefund = refunds.some((r) => r.source === "stripe");

  return (
    <DetailSection>
      <DetailCollapsibleSection title="Refunds" defaultOpen={defaultOpen}>
        <div className="space-y-4">
          <div
            className="rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--color-warning-border)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text-deep)",
            }}
          >
            <span className="font-medium">{statusLabel}</span>
            {totalRefunded > 0.01 && (
              <span>
                {" "}
                — {formatCurrency(totalRefunded)} refunded
                {received > 0.01 ? ` · ${formatCurrency(received)} still on file` : ""}
              </span>
            )}
          </div>

          {paymentIntentId && hasStripeRefund && (
            <OpenInStripeLink
              href={stripePaymentDashboardUrl(paymentIntentId)}
              label="Open payment in Stripe"
            />
          )}

          {refunds.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              No refund records yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {refunds.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border px-3 py-3 text-sm"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
                >
                  <div className="flex flex-wrap justify-between gap-2 mb-1">
                    <span className="font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                      {formatCurrency(Number(r.amount))}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {formatDateTime(r.created_at)}
                    </span>
                  </div>
                  <p style={{ color: "var(--color-text-muted)" }}>
                    {paymentEvidenceTypeLabel(r.payment_mode)}
                    {" · "}
                    {getChannelLabel(r.method)}
                    {r.source === "stripe" ? " · Stripe" : " · Manual"}
                    {r.refunded_by?.full_name ? ` · ${r.refunded_by.full_name}` : ""}
                  </p>
                  {r.notes && (
                    <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {r.notes}
                    </p>
                  )}
                  {canViewEvidence && r.evidence_path && (
                    <a
                      href={`/api/tickets/${ticketId}/refund-evidence/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-[13px] font-medium"
                      style={{ color: "var(--color-tab-active)" }}
                    >
                      <FileText size={14} />
                      View refund evidence
                    </a>
                  )}
                  {r.source === "stripe" && r.stripe_refund_id && (
                    <div className="mt-2">
                      <OpenInStripeLink
                        href={stripeRefundDashboardUrl(r.stripe_refund_id)}
                        label="Open refund in Stripe"
                      />
                    </div>
                  )}
                  {r.source === "stripe" && r.stripe_refund_id && (
                    <p className="mt-1 text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {r.stripe_refund_id}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DetailCollapsibleSection>
    </DetailSection>
  );
}
