"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Link as LinkIcon, Copy, Check, Mail, BadgeCheck, RotateCcw } from "lucide-react";
import { canRecordRefund } from "@/lib/payments/refundable-payment-slots";
import { canResendTicketNotifications } from "@/lib/utils/ticket-access";
import { OutreachChannelIcons } from "@/components/ui/outreach-channel-icons";
import { resolveOutreachChannelKind, OUTREACH_CHANNEL_LABEL } from "@/lib/utils/outreach-channel-display";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { canStaffCancelTicket } from "@/lib/utils/should-warn-partial-refund-before-cancel";
import { cancelActionLabel } from "@/lib/utils/cancel-reason-category";
import { isTicketPaidInFull } from "@/lib/utils/invoice-payment-summary";
import { copyTextToClipboard, publicQuoteUrl } from "@/lib/utils/copy-to-clipboard";

interface QuickActionsTicket {
  id: string;
  created_by_id?: string | null;
  ticket_status: string;
  public_token: string | null;
  ticket_quote_channel: "sms" | "email" | "both" | null;
  quote_channel: string | null;
  quote_final_total: number | null;
  payment_status: "unpaid" | "partial" | "paid" | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  production_released_at: string | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_reviewed_at: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_amount_cents?: number | null;
  stripe_amount_refunded_cents?: number | null;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  client_confirmed: boolean;
}

const btnBase =
  "flex items-center justify-center gap-2 px-3 py-3 md:px-4 text-[13px] font-medium rounded-lg transition-opacity disabled:opacity-50 min-h-[44px]";

export function DetailQuickActions({
  ticket,
  userRole,
  userId,
  saving,
  onMarkComplete,
  onCancelTicket,
  onRecordRefund,
  priorRefunds,
  onSendQuote,
  onConvertToOrder,
  quoteSendReady = true,
  sendMissingMessage,
  isLocked = false,
  isRoutedReadOnly = false,
  clientConfirmed = false,
}: {
  ticket: QuickActionsTicket;
  userRole: string | null;
  userId: string | null;
  saving: boolean;
  onMarkComplete: () => void;
  onCancelTicket?: () => void;
  onRecordRefund?: () => void;
  priorRefunds?: { payment_mode: string; amount: number | string }[];
  onSendQuote?: () => void;
  onConvertToOrder?: () => void;
  quoteSendReady?: boolean;
  sendMissingMessage?: string;
  isLocked?: boolean;
  isRoutedReadOnly?: boolean;
  clientConfirmed?: boolean;
}) {
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resendErr, setResendErr] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const paidInFull = isTicketPaidInFull(ticket);
  const publicUrl = ticket.public_token ? publicQuoteUrl(ticket.public_token) : null;
  const resendChannelKind = resolveOutreachChannelKind(ticket);

  const canResendInvoice =
    !!ticket.public_token &&
    (ticket.ticket_status === "in_production" || ticket.ticket_status === "completed") &&
    !!userId &&
    canResendTicketNotifications(
      { created_by_id: ticket.created_by_id ?? null },
      userId,
      userRole ?? "",
    );

  const canMarkComplete =
    ticket.ticket_status === "in_production" &&
    (userRole === "admin" || (userRole === "accountant" && paidInFull));

  /** Customer portal (/q/{token}) — read-only when cancelled/refunded; active flows when open. */
  const showQuoteLink =
    !!publicUrl &&
    (ticket.ticket_status === "sent" ||
      ticket.ticket_status === "order" ||
      ticket.ticket_status === "in_production" ||
      ticket.ticket_status === "completed" ||
      ticket.ticket_status === "cancelled");

  const showQuoteLifecycle =
    !isLocked &&
    !clientConfirmed &&
    ticket.ticket_status !== "order" &&
    !isRoutedReadOnly &&
    (ticket.ticket_status === "draft" || ticket.ticket_status === "sent");

  const showStaffCancel =
    !!onCancelTicket && canStaffCancelTicket(userRole, ticket);

  const showRecordRefund =
    !!onRecordRefund && canRecordRefund(ticket, priorRefunds, userRole);

  const canConvertToOrder =
    userRole === "admin" &&
    (ticket.ticket_status === "sent" || ticket.ticket_status === "draft") &&
    !!onConvertToOrder;

  const balanceDue = Math.max(
    0,
    Math.round((Number(ticket.quote_final_total ?? 0) - Number(ticket.payment_amount_received ?? 0)) * 100) / 100,
  );

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
      setResendMsg(`Sent via ${data.channel ?? "email"}.`);
      window.dispatchEvent(new Event("bazaar:tickets-changed"));
    } catch {
      setResendErr("Network error — please try again.");
    } finally {
      setResending(false);
    }
  }

  async function copyPublicLink() {
    if (!publicUrl) return;
    const ok = await copyTextToClipboard(publicUrl);
    setCopyState(ok ? "copied" : "error");
    window.setTimeout(() => setCopyState("idle"), 2500);
  }

  const hasActions =
    showQuoteLifecycle ||
    showStaffCancel ||
    showRecordRefund ||
    canMarkComplete ||
    canResendInvoice ||
    showQuoteLink;
  if (!hasActions) return null;

  const primaryActionCount = (canMarkComplete ? 1 : 0) + (canResendInvoice ? 1 : 0);

  return (
    <div className="mt-3 md:mt-4 flex flex-col gap-2">
      {showQuoteLifecycle && (
        <>
          {ticket.ticket_status === "draft" && onSendQuote && (
            <button
              type="button"
              disabled={saving || !quoteSendReady}
              title={!quoteSendReady ? sendMissingMessage : undefined}
              onClick={onSendQuote}
              className={`${btnBase} w-full hover:opacity-90`}
              style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
            >
              <Mail size={14} className="shrink-0" />
              <span className="truncate">Send Quote</span>
            </button>
          )}
          {ticket.ticket_status === "sent" && onSendQuote && (
            <button
              type="button"
              disabled={saving || !quoteSendReady}
              title={!quoteSendReady ? sendMissingMessage : undefined}
              onClick={onSendQuote}
              className={`${btnBase} w-full border hover:opacity-80`}
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", background: "var(--color-surface)" }}
            >
              <Mail size={14} className="shrink-0" />
              <span className="truncate">Resend Quote</span>
            </button>
          )}
          {canConvertToOrder && (
            <button
              type="button"
              disabled={saving}
              onClick={onConvertToOrder}
              className={`${btnBase} w-full hover:opacity-90`}
              style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
            >
              <BadgeCheck size={14} className="shrink-0" />
              <span className="truncate">Convert to Order</span>
            </button>
          )}
        </>
      )}

      {showStaffCancel && (
        <button
          type="button"
          disabled={saving}
          onClick={onCancelTicket}
          className={`${btnBase} w-full border hover:opacity-80`}
          style={{ color: "var(--color-danger)", borderColor: "var(--color-danger-border)", background: "var(--color-danger-bg)" }}
        >
          <span className="truncate">{cancelActionLabel(ticket.ticket_status)}</span>
        </button>
      )}

      {showRecordRefund && (
        <button
          type="button"
          disabled={saving}
          onClick={onRecordRefund}
          className={`${btnBase} w-full border hover:opacity-80`}
          style={{
            color: "var(--color-warning-text-deep)",
            borderColor: "var(--color-warning-border)",
            background: "var(--color-warning-bg)",
          }}
        >
          <RotateCcw size={14} className="shrink-0" />
          <span className="truncate">Refund payment</span>
        </button>
      )}

      {(resendMsg || resendErr) && (
        <p
          className="text-xs px-3 py-2 rounded-lg border"
          style={{
            borderColor: resendErr ? "var(--color-danger-border)" : "var(--color-success-border)",
            background: resendErr ? "var(--color-danger-bg)" : "var(--color-success-bg)",
            color: resendErr ? "var(--color-danger)" : "var(--color-success)",
          }}
        >
          {resendErr ?? resendMsg}
        </p>
      )}

      {primaryActionCount > 0 && (
        <div
          className={`grid gap-2 ${primaryActionCount > 1 ? "grid-cols-2" : "grid-cols-1"} md:grid-cols-1`}
        >
          {canMarkComplete && (
            <button
              type="button"
              disabled={saving || resending}
              onClick={onMarkComplete}
              title={
                !paidInFull && userRole === "admin"
                  ? `Mark completed — ${formatCurrency(balanceDue)} balance still due`
                  : undefined
              }
              className={`${btnBase} w-full hover:opacity-90`}
              style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} className="shrink-0" />}
              <span className="truncate">Mark Completed</span>
            </button>
          )}

          {canResendInvoice && (
            <button
              type="button"
              disabled={resending || saving}
              onClick={handleResendInvoice}
              title={`Send via ${OUTREACH_CHANNEL_LABEL[resendChannelKind]}`}
              className={`${btnBase} w-full border hover:opacity-80`}
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", background: "var(--color-surface)" }}
            >
              {resending ? (
                <Loader2 size={14} className="animate-spin shrink-0" />
              ) : (
                <OutreachChannelIcons kind={resendChannelKind} size={14} />
              )}
              <span className="truncate text-left md:text-center">Resend Link</span>
            </button>
          )}
        </div>
      )}

      {showQuoteLink && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <a
            href={publicUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btnBase} border no-underline hover:opacity-80`}
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", background: "var(--color-surface)" }}
          >
            <LinkIcon size={14} className="shrink-0" />
            <span className="truncate">Customer Link</span>
          </a>
          <button
            type="button"
            onClick={copyPublicLink}
            title={publicUrl ?? "Copy customer portal link"}
            className={`${btnBase} border hover:opacity-80`}
            style={{
              borderColor:
                copyState === "copied"
                  ? "var(--color-success-border)"
                  : copyState === "error"
                    ? "var(--color-danger-border)"
                    : "var(--color-border)",
              color:
                copyState === "copied"
                  ? "var(--color-success)"
                  : copyState === "error"
                    ? "var(--color-danger)"
                    : "var(--color-text-muted)",
              background:
                copyState === "copied"
                  ? "var(--color-success-bg)"
                  : copyState === "error"
                    ? "var(--color-danger-bg)"
                    : "var(--color-surface)",
            }}
          >
            {copyState === "copied" ? <Check size={14} className="shrink-0" /> : <Copy size={14} className="shrink-0" />}
            <span className="truncate">
              {copyState === "copied" ? "Copied!" : copyState === "error" ? "Failed" : "Copy Link"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
