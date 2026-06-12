"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import type { WebhookOrderRow, WebhookPageData, WebhookDelivery } from "@/app/api/admin/webhook/page-data/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(val: number | null): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type FilterTab = "all" | "success" | "failed" | "not_sent";

// ─── Delivery status badge ─────────────────────────────────────────────────────

function DeliveryBadge({ delivery }: { delivery: WebhookDelivery | null }) {
  if (!delivery) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
      >
        <Clock className="h-3 w-3" />
        Not sent
      </span>
    );
  }
  if (delivery.status === "success") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
      >
        <CheckCircle2 className="h-3 w-3" />
        Delivered
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
    >
      <XCircle className="h-3 w-3" />
      Failed
    </span>
  );
}

// ─── Duplicate Confirmation Modal ────────────────────────────────────────────

function ConfirmResendModal({
  referenceCode,
  onConfirm,
  onCancel,
  sending,
}: {
  referenceCode: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  sending: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-[420px] rounded-[12px] p-6 space-y-4 shadow-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Icon + title */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--color-warning-bg)" }}
          >
            <AlertTriangle className="h-5 w-5" style={{ color: "var(--color-warning)" }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Duplicate warning
            </p>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              <span className="font-mono font-medium" style={{ color: "var(--color-tab-active)" }}>
                {referenceCode ?? "This order"}
              </span>{" "}
              was already delivered successfully. Resending will create a{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>duplicate</strong>{" "}
              in the workflow system.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={sending}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: "color-mix(in srgb, var(--color-border) 60%, transparent)", color: "var(--color-text-primary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={sending}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
              : <><RefreshCw className="h-4 w-4" /> Yes, Resend Anyway</>
            }
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Delivery Detail Modal ────────────────────────────────────────────────────

function DeliveryModal({
  row,
  onClose,
  onResent,
}: {
  row: WebhookOrderRow;
  onClose: () => void;
  onResent: () => void;
}) {
  const [resendState, setResendState] = useState<"idle" | "confirm" | "sending" | "ok" | "error">("idle");
  const [resendMsg, setResendMsg] = useState("");
  const d = row.latest_delivery;
  const alreadyDelivered = d?.status === "success";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (resendState === "confirm") { setResendState("idle"); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, resendState]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function doResend() {
    setResendState("sending");
    setResendMsg("");
    try {
      const res = await fetch("/api/admin/webhook/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: row.id }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResendState("ok");
        setResendMsg("Queued — the delivery log will update shortly.");
        setTimeout(() => { onResent(); onClose(); }, 2000);
      } else {
        setResendState("error");
        setResendMsg(data.error ?? "Resend failed.");
      }
    } catch (err) {
      setResendState("error");
      setResendMsg(err instanceof Error ? err.message : "Request failed.");
    }
  }

  function handleResendClick() {
    if (alreadyDelivered) {
      setResendState("confirm");
    } else {
      doResend();
    }
  }

  const customer = row.contact_company ?? row.contact_name ?? row.contact_email ?? "—";

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[520px] rounded-[12px] p-6 space-y-5 shadow-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--color-tab-active)" }}>
                {row.reference_code ?? "—"}
              </span>
              <DeliveryBadge delivery={d} />
            </div>
            <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--color-text-primary)" }}>
              {row.title ?? "—"}
            </p>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {customer} · {fmtUsd(row.quote_final_total)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 transition-opacity hover:opacity-60"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--color-border)" }} />

        {/* No delivery yet */}
        {!d && (
          <div className="py-4 text-center space-y-1">
            <Clock className="h-8 w-8 mx-auto opacity-25" style={{ color: "var(--color-text-muted)" }} />
            <p className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Not sent yet
            </p>
            <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              This order has not been sent to the webhook. Use Resend below.
            </p>
          </div>
        )}

        {/* Delivery info */}
        {d && (
          <div className="space-y-4">
            {/* Meta row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Attempt",     value: `#${d.attempt}` },
                { label: "Sent",        value: relativeTime(d.sent_at) },
                { label: "HTTP Status", value: d.http_status != null ? String(d.http_status) : "—" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: "var(--color-row-alt)" }}
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {item.label}
                  </p>
                  <p className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Sent at full timestamp + via */}
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span style={{ color: "var(--color-text-muted)" }}>Sent at</span>
                <span style={{ color: "var(--color-text-primary)" }}>{fmtDateTime(d.sent_at)}</span>
              </div>
              {d.via && (
                <div className="flex justify-between">
                  <span style={{ color: "var(--color-text-muted)" }}>Triggered via</span>
                  <span className="capitalize" style={{ color: "var(--color-text-primary)" }}>
                    {d.via.replace(/_/g, " ")}
                  </span>
                </div>
              )}
            </div>

            {/* Error */}
            {d.error_message && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                  Error
                </p>
                <pre
                  className="rounded-lg px-3 py-2.5 text-[12px] whitespace-pre-wrap break-all leading-relaxed"
                  style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" }}
                >
                  {d.error_message}
                </pre>
              </div>
            )}

            {/* Response */}
            {d.response_body && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                  Response body
                </p>
                <pre
                  className="rounded-lg px-3 py-2.5 text-[12px] whitespace-pre-wrap break-all leading-relaxed"
                  style={{ background: "var(--color-row-alt)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                >
                  {(() => {
                    try { return JSON.stringify(JSON.parse(d.response_body!), null, 2); }
                    catch { return d.response_body; }
                  })()}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--color-border)" }} />

        {/* Footer: resend */}
        <div className="space-y-2">
          {resendState === "ok" ? (
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-3 text-[13px] font-medium"
              style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {resendMsg}
            </div>
          ) : (
            <>
              <button
                onClick={handleResendClick}
                disabled={resendState === "sending"}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
              >
                {resendState === "sending"
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />
                }
                {resendState === "sending" ? "Sending…" : "Resend to Webhook"}
              </button>
              {resendState === "error" && (
                <p className="text-[12px] text-center" style={{ color: "var(--color-danger)" }}>{resendMsg}</p>
              )}
            </>
          )}
        </div>

        {/* Duplicate confirmation modal (stacks on top of delivery modal) */}
        {resendState === "confirm" && (
          <ConfirmResendModal
            referenceCode={row.reference_code}
            onConfirm={doResend}
            onCancel={() => setResendState("idle")}
            sending={false}
          />
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Desktop table row ────────────────────────────────────────────────────────

function OrderTableRow({
  row,
  onOpenModal,
  onResent,
}: {
  row: WebhookOrderRow;
  onOpenModal: (row: WebhookOrderRow) => void;
  onResent: () => void;
}) {
  const customer = row.contact_company ?? row.contact_name ?? row.contact_email ?? "—";
  const [resendState, setResendState] = useState<"idle" | "confirm" | "sending" | "ok" | "error">("idle");
  const alreadyDelivered = row.latest_delivery?.status === "success";

  async function doResend() {
    setResendState("sending");
    try {
      const res = await fetch("/api/admin/webhook/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: row.id }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResendState("ok");
        setTimeout(() => { setResendState("idle"); onResent(); }, 2000);
      } else {
        setResendState("error");
        setTimeout(() => setResendState("idle"), 3000);
      }
    } catch {
      setResendState("error");
      setTimeout(() => setResendState("idle"), 3000);
    }
  }

  function handleResendClick() {
    if (alreadyDelivered) {
      setResendState("confirm");
    } else {
      doResend();
    }
  }

  return (
    <tr
      className="border-b transition-colors"
      style={{ borderColor: "var(--color-border)" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--color-row-hover)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
    >
      <td className="px-4 py-3">
        <span className="font-mono text-[13px] font-medium" style={{ color: "var(--color-tab-active)" }}>
          {row.reference_code ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[200px]">
        <p className="text-[13px] truncate font-medium" style={{ color: "var(--color-text-primary)" }}>
          {row.title ?? "—"}
        </p>
        <p className="text-[12px] truncate" style={{ color: "var(--color-text-muted)" }}>{customer}</p>
      </td>
      <td className="px-4 py-3 text-[13px]" style={{ color: "var(--color-text-primary)" }}>
        {fmtUsd(row.quote_final_total)}
      </td>
      <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        {fmtDate(row.order_created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <DeliveryBadge delivery={row.latest_delivery} />
          {row.latest_delivery && (
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {relativeTime(row.latest_delivery.sent_at)}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenModal(row)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
          >
            <Webhook className="h-3 w-3" />
            Details
          </button>
          <button
            onClick={handleResendClick}
            disabled={resendState === "sending" || resendState === "ok"}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: resendState === "ok"    ? "var(--color-success-bg)"
                        : resendState === "error" ? "var(--color-danger-bg)"
                        : "color-mix(in srgb, var(--color-border) 60%, transparent)",
              color:      resendState === "ok"    ? "var(--color-success)"
                        : resendState === "error" ? "var(--color-danger)"
                        : "var(--color-text-primary)",
            }}
          >
            {resendState === "sending" && <Loader2 className="h-3 w-3 animate-spin" />}
            {resendState === "ok"      && <CheckCircle2 className="h-3 w-3" />}
            {resendState === "error"   && <XCircle className="h-3 w-3" />}
            {resendState === "idle"    && <RefreshCw className="h-3 w-3" />}
            {resendState === "sending" ? "Sending…" : resendState === "ok" ? "Sent!" : resendState === "error" ? "Failed" : "Resend"}
          </button>

          {/* Duplicate confirmation modal — rendered via portal so it's safe inside <tbody> */}
          {resendState === "confirm" && (
            <ConfirmResendModal
              referenceCode={row.reference_code}
              onConfirm={doResend}
              onCancel={() => setResendState("idle")}
              sending={false}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function OrderMobileCard({
  row,
  onOpenModal,
}: {
  row: WebhookOrderRow;
  onOpenModal: (row: WebhookOrderRow) => void;
}) {
  const customer = row.contact_company ?? row.contact_name ?? row.contact_email ?? "—";

  return (
    <div
      className="rounded-[10px] border p-4 space-y-3"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-mono text-[13px] font-medium" style={{ color: "var(--color-tab-active)" }}>
            {row.reference_code ?? "—"}
          </span>
          <p className="text-[13px] font-medium mt-0.5" style={{ color: "var(--color-text-primary)" }}>
            {row.title ?? "—"}
          </p>
          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{customer}</p>
        </div>
        <DeliveryBadge delivery={row.latest_delivery} />
      </div>
      <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        <span>{fmtDate(row.order_created_at)}</span>
        <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{fmtUsd(row.quote_final_total)}</span>
      </div>
      <button
        onClick={() => onOpenModal(row)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-[12px] font-medium transition-opacity hover:opacity-80"
        style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
      >
        <Webhook className="h-3.5 w-3.5" />
        View Details &amp; Resend
      </button>
    </div>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const TABS: { id: FilterTab; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "success",  label: "Delivered" },
  { id: "failed",   label: "Failed" },
  { id: "not_sent", label: "Not Sent" },
];

// ─── Main section ─────────────────────────────────────────────────────────────

export function WebhookSection() {
  const [data, setData] = useState<WebhookPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("all");
  const [modalRow, setModalRow] = useState<WebhookOrderRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/webhook/page-data");
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const orders = (data?.orders ?? []).filter((row) => {
    if (tab === "all") return true;
    if (tab === "not_sent") return !row.latest_delivery;
    return row.latest_delivery?.status === tab;
  });

  const counts = data?.counts;

  function tabCount(t: FilterTab): number {
    if (!counts) return 0;
    if (t === "all") return counts.total;
    if (t === "success") return counts.success;
    if (t === "failed") return counts.failed;
    return counts.not_sent;
  }

  function handleResent() {
    setModalRow(null);
    load();
  }

  return (
    <div className="space-y-6">
      {/* Modal */}
      {modalRow && (
        <DeliveryModal
          row={modalRow}
          onClose={() => setModalRow(null)}
          onResent={handleResent}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Order Webhook
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Every new order is automatically posted to the workflow automation webhook. Use this panel to monitor
            delivery status and resend any orders that failed.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "color-mix(in srgb, var(--color-border) 60%, transparent)", color: "var(--color-text-primary)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Webhook not configured warning */}
      {data && !data.webhook_configured && (
        <div
          className="flex items-start gap-3 rounded-[10px] border p-4"
          style={{ background: "var(--color-warning-bg)", borderColor: "var(--color-warning-border)" }}
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--color-warning)" }}>
              Webhook not configured
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--color-warning)" }}>
              Set <code className="font-mono">ORDER_WEBHOOK_URL</code> and <code className="font-mono">ORDER_WEBHOOK_SECRET</code> in
              your Vercel environment variables to enable automatic delivery.
            </p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Orders", value: counts?.total ?? 0,    color: "var(--color-text-primary)" },
            { label: "Delivered",    value: counts?.success ?? 0,  color: "var(--color-success)"      },
            { label: "Failed",       value: counts?.failed ?? 0,   color: "var(--color-danger)"       },
            { label: "Not Sent",     value: counts?.not_sent ?? 0, color: "var(--color-text-muted)"   },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[10px] border p-4 text-center"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <p className="text-[24px] font-semibold leading-none" style={{ color: s.color }}>{s.value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--color-text-muted)" }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-0 border-b" style={{ borderColor: "var(--color-border)" }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors"
              style={{
                color:        active ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
                borderBottom: active ? "2px solid var(--color-tab-underline)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {t.label}
              {data && (
                <span
                  className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                  style={{
                    background: active
                      ? "var(--color-badge-bg)"
                      : "color-mix(in srgb, var(--color-badge-bg) 70%, transparent)",
                    color: "var(--color-badge-text)",
                  }}
                >
                  {tabCount(t.id)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-[10px] border p-4 text-[13px] flex items-center gap-2"
          style={{ background: "var(--color-danger-bg)", borderColor: "var(--color-danger-border)", color: "var(--color-danger)" }}
        >
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: "var(--color-row-alt)" }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && orders.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-[10px] border py-16 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <Webhook className="h-8 w-8 mb-3 opacity-30" style={{ color: "var(--color-text-muted)" }} />
          <p className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {tab === "all" ? "No orders yet" : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} orders`}
          </p>
          <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
            {tab === "all" ? "Orders will appear here once created." : "Try a different filter above."}
          </p>
        </div>
      )}

      {/* Desktop table */}
      {!loading && orders.length > 0 && (
        <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
                <th className="px-4 py-3 text-left">Order #</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Webhook Status</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((row) => (
                <OrderTableRow key={row.id} row={row} onOpenModal={setModalRow} onResent={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && orders.length > 0 && (
        <div className="flex flex-col gap-3 lg:hidden">
          {orders.map((row) => (
            <OrderMobileCard key={row.id} row={row} onOpenModal={setModalRow} />
          ))}
        </div>
      )}
    </div>
  );
}
