"use client";

import { useState } from "react";
import { Calendar, Zap, CheckCircle2, Loader2, Mail } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { formatDate, isOverdue } from "@/lib/utils/format";
import { computeCheckout } from "@/lib/utils/compute-checkout";
import { isTicketPaidInFull } from "@/lib/utils/invoice-payment-summary";
import type { PaymentConfig } from "@/lib/types";

interface OverviewTicket {
  id: string;
  reference_code: string | null;
  public_token: string | null;
  quote_final_total: number | null;
  payment_status: "unpaid" | "partial" | "paid" | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  production_released_at: string | null;
  ticket_status: string;
  priority: string | null;
  due_date: string | null;
  rush: boolean;
  client_confirmed: boolean;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  ticket_dep_handling: "cash" | "gateway" | null;
  ticket_partial_channels: string[] | null;
  ticket_full_channels: string[] | null;
  ticket_require_client_confirm: boolean | null;
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "success" | "warning" | "danger" | "info" }) {
  const colors = {
    success: "var(--color-success)",
    warning: "var(--color-warning-text-deep)",
    danger:  "var(--color-danger)",
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

export function ProductionDetailOverview({
  ticket,
  userRole,
  saving,
  onMarkComplete,
  completeNotice,
  completeNoticeIsWarning,
}: {
  ticket: OverviewTicket;
  userRole: string | null;
  saving: boolean;
  onMarkComplete: () => void;
  completeNotice?: string | null;
  completeNoticeIsWarning?: boolean;
}) {
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resendErr, setResendErr] = useState<string | null>(null);

  const total = Number(ticket.quote_final_total ?? 0);
  const strategy = ticket.ticket_payment_strategy ?? "full";
  const channels = strategy === "partial"
    ? (ticket.ticket_partial_channels ?? [])
    : (ticket.ticket_full_channels ?? []);

  const cfg = {
    paymentStrategy:      strategy,
    depositType:          ticket.ticket_deposit_type ?? "percent",
    depositValue:         ticket.ticket_deposit_value ?? 0,
    depHandling:          ticket.ticket_dep_handling ?? "gateway",
    paymentChannels:      channels,
    requireClientConfirm: ticket.ticket_require_client_confirm ?? true,
  } as PaymentConfig;

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

  const balanceDue = Math.max(0, Math.round((total - checkout.amountPaid) * 100) / 100);
  const paidInFull = isTicketPaidInFull(ticket);
  const ps = ticket.payment_status ?? "unpaid";
  const paymentLabel =
    paidInFull       ? "Paid in full"
    : ps === "partial" ? `Partial · ${formatCurrency(balanceDue)} due`
    : "Unpaid";
  const paymentHighlight: "success" | "warning" | "danger" =
    paidInFull ? "success" : ps === "partial" ? "warning" : "danger";

  const overdue = isOverdue(ticket.due_date);
  const canResendInvoice =
    !!ticket.public_token &&
    (ticket.ticket_status === "in_production" || ticket.ticket_status === "completed");
  const canMarkComplete =
    ticket.ticket_status === "in_production" &&
    (userRole === "admin" || (userRole === "accountant" && paidInFull));

  async function handleResendInvoice() {
    setResending(true);
    setResendMsg(null);
    setResendErr(null);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resend_invoice: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResendErr(data.error ?? "Failed to send invoice link.");
        return;
      }
      setResendMsg(`Invoice link sent via ${data.channel ?? "email"}.`);
      window.dispatchEvent(new Event("bazaar:tickets-changed"));
    } catch {
      setResendErr("Network error — please try again.");
    } finally {
      setResending(false);
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
            style={{ background: "var(--color-info-bg)", color: "var(--color-info-text)", border: "1px solid var(--color-info-border)" }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-info-text)" }} />
            {ticket.ticket_status === "completed" ? "Completed" : "In Production"}
          </span>
          {ticket.rush && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "1px solid var(--color-warning-border)" }}
            >
              <Zap size={12} />
              Rush
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canResendInvoice && (
            <button
              type="button"
              disabled={resending || saving}
              onClick={handleResendInvoice}
              className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border disabled:opacity-60"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
                background: "var(--color-bg)",
              }}
              title="Email or SMS the customer their order link and invoice"
            >
              {resending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Resend invoice link
            </button>
          )}
          {canMarkComplete && (
            <button
              type="button"
              disabled={saving || resending}
              onClick={onMarkComplete}
              className="inline-flex items-center gap-1.5 rounded-[6px] px-4 py-2 text-[13px] font-medium disabled:opacity-50"
              style={{
                background: "var(--color-success-bg)",
                color: "var(--color-success)",
                border: "1px solid var(--color-success-border)",
              }}
              title={userRole === "accountant" ? "Mark complete when paid in full" : undefined}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Mark Completed
            </button>
          )}
        </div>
      </div>

      {(resendMsg || resendErr || completeNotice) && (
        <div
          className="rounded-[6px] border px-3 py-2 text-sm"
          style={{
            borderColor: resendErr
              ? "var(--color-danger-border)"
              : completeNoticeIsWarning
                ? "var(--color-warning-border)"
                : "var(--color-success-border)",
            background: resendErr
              ? "var(--color-danger-bg)"
              : completeNoticeIsWarning
                ? "var(--color-warning-bg)"
                : "var(--color-success-bg)",
            color: resendErr
              ? "var(--color-danger)"
              : completeNoticeIsWarning
                ? "var(--color-warning-text-deep)"
                : "var(--color-success)",
          }}
        >
          {resendErr ?? completeNotice ?? resendMsg}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label="Order Total" value={formatCurrency(total)} />
        <Stat label="Received" value={formatCurrency(checkout.amountPaid)} highlight={checkout.amountPaid > 0 ? "success" : undefined} />
        <Stat label="Balance Due" value={formatCurrency(balanceDue)} highlight={balanceDue > 0.01 ? "warning" : "success"} />
        <Stat label="Payment" value={paymentLabel} highlight={paymentHighlight} />
        <Stat
          label="Due Date"
          value={ticket.due_date ? formatDate(ticket.due_date) : "—"}
          highlight={overdue ? "danger" : undefined}
        />
        <Stat label="Priority" value={ticket.priority ?? "Normal"} />
      </div>

      {ticket.production_released_at && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
          <Calendar size={12} />
          Production started {formatDate(ticket.production_released_at)}
        </p>
      )}
    </div>
  );
}
