"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, CheckCircle2, Loader2, CreditCard } from "lucide-react";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import {
  inferPaymentEvidenceMode,
  paymentEvidenceTypeLabelForTicket,
} from "@/lib/utils/payment-evidence-type";
import { ConfirmPaymentEvidenceModal } from "@/components/orders/confirm-payment-evidence-modal";
import { formatDateTime } from "@/lib/utils/format";
import { PaymentTypeBadge } from "@/components/orders/payment-type-badge";
import {
  PricingPaymentSummary,
  type SummaryTicket,
  type PricingTicketFields,
} from "@/components/quotes/quote-detail/order-payment-summary";
import {
  DetailCollapsibleSection,
  DetailSection,
} from "@/components/quotes/quote-detail/detail-layout-primitives";
import { StripeEvidencePanel } from "@/components/ui/stripe-evidence-panel";
import { TaxExemptReviewSection, type TaxExemptReviewTicket } from "@/components/orders/tax-exempt-review-section";
import { isTaxExemptApprovalPending } from "@/lib/utils/invoice-payment-summary";

const CHANNEL_LABELS: Record<string, string> = {
  wire:    "Wire Transfer",
  ach:     "ACH / Bank",
  zelle:   "Zelle",
  check:   "Check",
  card:    "Card",
  cash:    "Cash",
  offline: "Offline",
  other:   "Other",
};

function inferPaymentMode(ticket: SummaryTicket): "deposit" | "balance" | "full" {
  return inferPaymentEvidenceMode(ticket);
}

function submittedAmount(ticket: SummaryTicket): number {
  if (ticket.payment_evidence_amount != null) return Number(ticket.payment_evidence_amount);
  const total = Number(ticket.quote_final_total ?? 0);
  const paid  = Number(ticket.payment_amount_received ?? 0);
  return Math.max(0, total - paid);
}

export function PaymentDetailOverview({
  ticket,
  readOnly = false,
  defaultOpen = false,
  afterApprovePath = null,
}: {
  ticket: SummaryTicket & PricingTicketFields & { id: string };
  readOnly?: boolean;
  /** When false, payment review starts collapsed (order detail). Payments queue passes true. */
  defaultOpen?: boolean;
  /** Navigate after tax-exempt confirm (e.g. `/payments` on payment detail). */
  afterApprovePath?: string | null;
}) {
  const router = useRouter();
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  const evidencePending = isPaymentEvidencePending(ticket);
  const taxExemptPending = isTaxExemptApprovalPending(ticket);
  const canConfirm = !readOnly && evidencePending && !taxExemptPending;
  const claimed = submittedAmount(ticket);

  function openConfirmModal() {
    if (claimed <= 0) {
      setConfirmErr("No payment amount to confirm.");
      return;
    }
    setConfirmErr(null);
    setConfirmModalOpen(true);
  }

  async function handleConfirm() {
    if (claimed <= 0) {
      setConfirmErr("No payment amount to confirm.");
      return;
    }

    setConfirming(true);
    setConfirmErr(null);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_payment: true,
          payment_mode: inferPaymentMode(ticket),
          payment_method: ticket.payment_method_used ?? "wire",
          payment_amount: claimed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmErr(data.error ?? "Failed to confirm payment.");
        setConfirming(false);
        return;
      }
      window.dispatchEvent(new Event("bazaar:tickets-changed"));
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
      setConfirmModalOpen(false);
      router.push("/payments");
    } catch {
      setConfirmErr("Network error — please try again.");
      setConfirming(false);
    }
  }

  const methodLabel = ticket.payment_method_used
    ? CHANNEL_LABELS[ticket.payment_method_used] ?? ticket.payment_method_used
    : undefined;

  const sectionTitle = evidencePending ? "Payment review" : "Payment evidence";

  return (
    <DetailSection>
      <TaxExemptReviewSection
        ticket={ticket as TaxExemptReviewTicket}
        readOnly={readOnly}
        defaultOpen={defaultOpen}
        embedded
        afterApprovePath={afterApprovePath}
        onApproved={() => {
          if (!afterApprovePath) router.refresh();
        }}
      />
      <DetailCollapsibleSection title={sectionTitle} defaultOpen={defaultOpen}>
        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0 flex-1">
              <div>
                <p
                  className="text-[11px] font-medium uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}
                >
                  Payment for
                </p>
                <PaymentTypeBadge ticket={ticket} showDescription />
              </div>

              {ticket.payment_method_used && (
                <div>
                  <p
                    className="text-[11px] font-medium uppercase tracking-wider mb-2"
                    style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}
                  >
                    Method
                  </p>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                  >
                    <CreditCard size={11} />
                    {CHANNEL_LABELS[ticket.payment_method_used] ?? ticket.payment_method_used}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0 lg:pt-5">
              {ticket.payment_evidence_url && (
                <a
                  href={`/api/tickets/${ticket.id}/evidence`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                    background: "var(--color-bg)",
                    textDecoration: "none",
                  }}
                >
                  <FileText size={14} />
                  View file
                </a>
              )}
              {canConfirm && (
                <button
                  type="button"
                  disabled={confirming}
                  onClick={openConfirmModal}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-4 py-2 text-[13px] font-medium disabled:opacity-60"
                  style={{
                    background: "var(--color-btn-primary-bg)",
                    color: "var(--color-btn-primary-text)",
                  }}
                >
                  {confirming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Confirm payment
                </button>
              )}
            </div>
          </div>

          {!evidencePending && ticket.payment_evidence_reviewed_at && (
            <p className="text-sm" style={{ color: "var(--color-success)" }}>
              Approved {formatDateTime(ticket.payment_evidence_reviewed_at)}
            </p>
          )}

          {ticket.stripe_payment_intent_id && (
            <StripeEvidencePanel ticket={ticket} />
          )}

          {confirmErr && (
            <div
              className="rounded-[6px] border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--color-danger-border)",
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
              }}
            >
              {confirmErr}
            </div>
          )}

          <PricingPaymentSummary ticket={ticket} reviewPending={evidencePending || taxExemptPending} />

          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {evidencePending
              ? readOnly
                ? "An accountant must confirm this payment before production can start. Contact your accountant if this order is urgent."
                : "Confirming records the submitted amount and releases the order to production when payment gates are met."
              : "Payment evidence was reviewed and recorded. File and Stripe details remain available for audit."}
          </p>
        </div>
      </DetailCollapsibleSection>

      <ConfirmPaymentEvidenceModal
        open={confirmModalOpen}
        referenceCode={ticket.reference_code}
        amount={claimed}
        paymentForLabel={paymentEvidenceTypeLabelForTicket(ticket)}
        methodLabel={methodLabel}
        confirming={confirming}
        error={confirmErr}
        onConfirm={() => void handleConfirm()}
        onClose={() => {
          if (confirming) return;
          setConfirmModalOpen(false);
          setConfirmErr(null);
        }}
      />
    </DetailSection>
  );
}
