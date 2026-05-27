"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, CheckCircle2, Loader2, CreditCard } from "lucide-react";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import { formatDateTime } from "@/lib/utils/format";
import {
  PricingPaymentSummary,
  type SummaryTicket,
  type PricingTicketFields,
} from "@/components/quotes/quote-detail/order-payment-summary";

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
  const strategy = ticket.ticket_payment_strategy ?? "full";
  if (strategy === "full") return "full";
  if (ticket.deposit_paid_at) return "balance";
  return "deposit";
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
}: {
  ticket: SummaryTicket & PricingTicketFields & { id: string };
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  const evidencePending = isPaymentEvidencePending(ticket);
  const canConfirm = !readOnly && evidencePending;
  const claimed = submittedAmount(ticket);

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
      router.push("/payments");
    } catch {
      setConfirmErr("Network error — please try again.");
      setConfirming(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-5 space-y-5"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
            {evidencePending ? "Payment review" : "Payment evidence"}
          </p>
          {ticket.payment_method_used && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold mt-1"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
            >
              <CreditCard size={11} />
              {CHANNEL_LABELS[ticket.payment_method_used] ?? ticket.payment_method_used}
            </span>
          )}
          {!evidencePending && ticket.payment_evidence_reviewed_at && (
            <p className="text-sm mt-2" style={{ color: "var(--color-success)" }}>
              Approved {formatDateTime(ticket.payment_evidence_reviewed_at)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
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
              View evidence
            </a>
          )}
          {canConfirm && (
            <button
              type="button"
              disabled={confirming}
              onClick={handleConfirm}
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

      <PricingPaymentSummary ticket={ticket} reviewPending={evidencePending} />

      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {evidencePending
          ? readOnly
            ? "An accountant must confirm this payment before production can start. Contact your accountant if this order is urgent."
            : "Confirming records the submitted amount and releases the order to production when payment gates are met."
          : "Payment evidence was reviewed and recorded. The file remains available for audit."}
      </p>
    </div>
  );
}
