"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, FileText, CheckCircle2, Loader2, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { formatDateTime } from "@/lib/utils/format";

interface PaymentReviewTicket {
  id: string;
  reference_code: string | null;
  quote_final_total: number | null;
  payment_method_used: string | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_amount: number | null;
  payment_amount_received: number | null;
  deposit_paid_at: string | null;
  ticket_payment_strategy: string | null;
}

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

function inferPaymentMode(ticket: PaymentReviewTicket): "deposit" | "balance" | "full" {
  const strategy = ticket.ticket_payment_strategy ?? "full";
  if (strategy === "full") return "full";
  if (ticket.deposit_paid_at) return "balance";
  return "deposit";
}

function claimedAmount(ticket: PaymentReviewTicket): number {
  if (ticket.payment_evidence_amount != null) return Number(ticket.payment_evidence_amount);
  const total = Number(ticket.quote_final_total ?? 0);
  const paid  = Number(ticket.payment_amount_received ?? 0);
  return Math.max(0, total - paid);
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "success" | "warning" | "info" }) {
  const colors = {
    success: "var(--color-success)",
    warning: "var(--color-warning-text-deep)",
    info:    "var(--color-info-text)",
  };
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p
        className="text-sm font-semibold"
        style={{ color: highlight ? colors[highlight] : "var(--color-text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

export function PaymentDetailOverview({ ticket }: { ticket: PaymentReviewTicket }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  const claimed = claimedAmount(ticket);
  const total = Number(ticket.quote_final_total ?? 0);

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
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text-deep)",
              border: "1px solid var(--color-warning-border)",
            }}
          >
            <Clock size={12} />
            Awaiting payment review
          </span>
          {ticket.payment_method_used && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
            >
              <CreditCard size={11} />
              {CHANNEL_LABELS[ticket.payment_method_used] ?? ticket.payment_method_used}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Order total" value={formatCurrency(total)} />
        <Stat label="Amount claimed" value={formatCurrency(claimed)} highlight="warning" />
        <Stat
          label="Previously received"
          value={formatCurrency(ticket.payment_amount_received ?? 0)}
          highlight={(ticket.payment_amount_received ?? 0) > 0 ? "success" : undefined}
        />
        <Stat label="Evidence submitted" value={formatDateTime(ticket.payment_evidence_submitted_at)} highlight="info" />
      </div>

      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Confirming releases this order to production and sends the customer a payment confirmation email.
      </p>
    </div>
  );
}
