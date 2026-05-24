"use client";

import { BadgeCheck } from "lucide-react";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";

interface StageTicket {
  ticket_status: string;
  client_confirmed: boolean;
  ticket_require_client_confirm: boolean | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  payment_status: "unpaid" | "partial" | "paid" | null;
}

/** Contextual quote-stage notices — stats and actions live in sibling components. */
export function QuoteStageOverview({ ticket }: { ticket: StageTicket }) {
  const evidencePending = isPaymentEvidencePending(ticket);
  const confirmedAwaitingPay =
    ticket.ticket_status === "sent" &&
    ticket.client_confirmed &&
    ticket.payment_status !== "paid";

  if (!evidencePending && !confirmedAwaitingPay) return null;

  return (
    <div className="space-y-3">
      {confirmedAwaitingPay && (
        <div
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm border"
          style={{ background: "var(--color-success-bg)", borderColor: "var(--color-success-border)", color: "var(--color-success)" }}
        >
          <BadgeCheck size={16} className="shrink-0 mt-0.5" />
          <span>
            Customer confirmed the quote price. Ticket stays on <strong>Quotes</strong> until payment is recorded.
          </span>
        </div>
      )}
      {evidencePending && (
        <div
          className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm border"
          style={{ background: "var(--color-warning-bg)", borderColor: "var(--color-warning-border)", color: "var(--color-warning-text-deep)" }}
        >
          <span>
            Payment evidence submitted — awaiting accountant confirmation on the Payments queue.
          </span>
        </div>
      )}
    </div>
  );
}
