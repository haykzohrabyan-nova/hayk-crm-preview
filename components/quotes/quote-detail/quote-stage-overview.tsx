"use client";

import { useState } from "react";
import { BadgeCheck, Zap, Link as LinkIcon, Copy, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { computeCheckout } from "@/lib/utils/compute-checkout";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import { copyTextToClipboard, publicQuoteUrl } from "@/lib/utils/copy-to-clipboard";
import type { PaymentConfig } from "@/lib/types";

interface StageTicket {
  id: string;
  reference_code: string | null;
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
  public_token: string | null;
  ticket_payment_strategy: "partial" | "full" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  ticket_dep_handling: "cash" | "gateway" | null;
  ticket_partial_channels: string[] | null;
  ticket_full_channels: string[] | null;
  ticket_require_client_confirm: boolean | null;
  ticket_net_terms_label: string | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
}

const STATUS_META: Record<string, { label: string; bg: string; text: string; border: string }> = {
  draft:    { label: "Draft",    bg: "var(--color-neutral-bg)",  text: "var(--color-neutral-text)", border: "var(--color-neutral-border)" },
  sent:     { label: "Sent",     bg: "var(--color-info-bg)",     text: "var(--color-info-text)",    border: "var(--color-info-border)" },
  approved: { label: "Won",      bg: "var(--color-success-bg)",  text: "var(--color-success)",      border: "var(--color-success-border)" },
  order:    { label: "Order",    bg: "var(--color-badge-bg)",    text: "var(--color-badge-text)",   border: "var(--color-border)" },
  routed:   { label: "Routed",   bg: "var(--color-warning-bg)",  text: "var(--color-warning-text-deep)", border: "var(--color-warning-border)" },
  cancelled:{ label: "Cancelled", bg: "var(--color-danger-bg)",  text: "var(--color-danger)",       border: "var(--color-danger-border)" },
};

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
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

export function QuoteStageOverview({ ticket }: { ticket: StageTicket }) {
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
  const ps = ticket.payment_status ?? "unpaid";
  const evidencePending = isPaymentEvidencePending(ticket);

  let paymentLabel = ps === "paid" ? "Paid in full" : ps === "partial" ? `Partial · ${formatCurrency(balanceDue)} due` : "Unpaid";
  let paymentHighlight: "success" | "warning" | "danger" | "info" = ps === "paid" ? "success" : ps === "partial" ? "warning" : "danger";

  if (evidencePending) {
    paymentLabel = "Under review";
    paymentHighlight = "warning";
  } else if (strategy === "net" && ps !== "paid") {
    paymentLabel = ticket.ticket_net_terms_label?.replace("-", " ") ?? "Net terms";
    paymentHighlight = "info";
  }

  const statusMeta = STATUS_META[ticket.ticket_status] ?? STATUS_META.draft;
  const publicUrl = ticket.public_token ? publicQuoteUrl(ticket.public_token) : null;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyPublicLink() {
    if (!publicUrl) return;
    const ok = await copyTextToClipboard(publicUrl);
    setCopyState(ok ? "copied" : "error");
    window.setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <div
      className="rounded-xl border p-5 space-y-5"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: statusMeta.bg, color: statusMeta.text, border: `1px solid ${statusMeta.border}` }}
          >
            {ticket.client_confirmed && ticket.ticket_status === "sent" ? (
              <BadgeCheck size={12} />
            ) : null}
            {statusMeta.label}
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

        {publicUrl && (
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", background: "var(--color-bg)", textDecoration: "none" }}
            >
              <LinkIcon size={14} />
              Customer link
            </a>
            <button
              type="button"
              onClick={copyPublicLink}
              className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border"
              style={{
                borderColor: copyState === "copied" ? "var(--color-success-border)" : copyState === "error" ? "var(--color-danger-border)" : "var(--color-border)",
                color: copyState === "copied" ? "var(--color-success)" : copyState === "error" ? "var(--color-danger)" : "var(--color-text-muted)",
                background: copyState === "copied" ? "var(--color-success-bg)" : copyState === "error" ? "var(--color-danger-bg)" : "var(--color-bg)",
              }}
            >
              {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
              {copyState === "copied" ? "Copied!" : copyState === "error" ? "Copy failed" : "Copy"}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label="Quote total" value={formatCurrency(total)} />
        <Stat label="Received" value={formatCurrency(checkout.amountPaid)} highlight={checkout.amountPaid > 0 ? "success" : undefined} />
        <Stat label="Balance due" value={formatCurrency(balanceDue)} highlight={balanceDue > 0.01 ? "warning" : "success"} />
        <Stat label="Payment" value={paymentLabel} highlight={paymentHighlight} />
        <Stat label="Due date" value={fmtDate(ticket.due_date)} />
        <Stat label="Priority" value={ticket.priority ?? "Normal"} />
      </div>
    </div>
  );
}
