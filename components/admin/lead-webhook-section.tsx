"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Webhook,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Loader2,
  X,
  Search,
  Trash2,
  FileJson,
} from "lucide-react";
import type {
  LeadWebhookLogRow,
  LeadWebhookPageData,
  LeadWebhookFilterTab,
} from "@/app/api/admin/webhook/leads/page-data/route";
import { formatDate, formatDateTime, relativeTime } from "@/lib/utils/format";
import { DashboardDateRangeFilter } from "@/components/ui/dashboard-date-range-filter";
import {
  defaultDashboardDateRangeFilterValue,
  resolveDashboardDateRangeFilter,
  type DashboardDateRangeFilterValue,
} from "@/lib/utils/dashboard-date-range-filter";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  readStoredListPageSize,
  writeStoredListPageSize,
  type ListPageSize,
} from "@/lib/utils/pagination";

type FilterTab = LeadWebhookFilterTab;

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "accepted" | "failed" }) {
  if (status === "accepted") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
      >
        <CheckCircle2 className="h-3 w-3" />
        Accepted
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

// ─── Clear Payloads Confirmation Modal ───────────────────────────────────────

function ClearPayloadsModal({
  count,
  onConfirm,
  onCancel,
  clearing,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  clearing: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
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
        className="w-full max-w-[440px] rounded-[12px] p-6 space-y-4 shadow-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--color-danger-bg)" }}
          >
            <Trash2 className="h-5 w-5" style={{ color: "var(--color-danger)" }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Clear all stored payloads?
            </p>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              This will permanently erase the JSON payload from{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>{count.toLocaleString()} log {count === 1 ? "entry" : "entries"}</strong>.
              {" "}Delivery history (Accepted / Failed status) is kept. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={clearing}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              background: "color-mix(in srgb, var(--color-border) 60%, transparent)",
              color: "var(--color-text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={clearing}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--color-danger)", color: "#fff" }}
          >
            {clearing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Clearing…</>
              : <><Trash2 className="h-4 w-4" /> Clear Payloads</>
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  row,
  onClose,
}: {
  row: LeadWebhookLogRow;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const contact = row.contact_name ?? row.contact_email ?? row.contact_phone ?? "Unknown contact";

  const prettyPayload = useMemo(() => {
    if (!row.raw_payload) return null;
    try { return JSON.stringify(row.raw_payload, null, 2); }
    catch { return String(row.raw_payload); }
  }, [row.raw_payload]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[540px] max-h-[90vh] overflow-y-auto rounded-[12px] p-6 space-y-5 shadow-xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={row.status} />
              <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                {relativeTime(row.received_at)}
              </span>
            </div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {contact}
            </p>
            {row.source && (
              <p className="text-[13px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Source: {row.source}
              </p>
            )}
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

        <div style={{ borderTop: "1px solid var(--color-border)" }} />

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Received",     value: formatDateTime(row.received_at) },
            { label: "HTTP Status",  value: String(row.http_status) },
            ...(row.lead_id   ? [{ label: "Lead ID",     value: row.lead_id.slice(0, 8) + "…" }] : []),
            ...(row.contact_phone ? [{ label: "Phone",   value: row.contact_phone }] : []),
            ...(row.contact_email ? [{ label: "Email",   value: row.contact_email }] : []),
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg px-3 py-2.5"
              style={{ background: "var(--color-row-alt)" }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-muted)" }}>
                {item.label}
              </p>
              <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Error */}
        {row.error_message && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--color-text-muted)" }}>
              Error
            </p>
            <pre
              className="rounded-lg px-3 py-2.5 text-[12px] whitespace-pre-wrap break-all leading-relaxed"
              style={{
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                border: "1px solid var(--color-danger-border)",
              }}
            >
              {row.error_message}
            </pre>
          </div>
        )}

        {/* Raw payload */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Raw Payload
          </p>
          {prettyPayload ? (
            <pre
              className="rounded-lg px-3 py-2.5 text-[12px] whitespace-pre-wrap break-all leading-relaxed overflow-x-auto"
              style={{
                background: "var(--color-row-alt)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
              }}
            >
              {prettyPayload}
            </pre>
          ) : (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-3 text-[13px]"
              style={{
                background: "var(--color-row-alt)",
                color: "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
              }}
            >
              <FileJson className="h-4 w-4 shrink-0 opacity-50" />
              Payload was cleared — only delivery status is retained.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Desktop table row ────────────────────────────────────────────────────────

function LogTableRow({
  row,
  onOpenModal,
}: {
  row: LeadWebhookLogRow;
  onOpenModal: (row: LeadWebhookLogRow) => void;
}) {
  const contact = row.contact_name ?? row.contact_email ?? row.contact_phone ?? "—";

  return (
    <tr
      className="border-b transition-colors"
      style={{ borderColor: "var(--color-border)" }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--color-row-hover)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "")}
    >
      <td className="px-4 py-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        {formatDateTime(row.received_at)}
      </td>
      <td className="px-4 py-3 max-w-[180px]">
        <p className="text-[13px] truncate font-medium" style={{ color: "var(--color-text-primary)" }}>
          {contact}
        </p>
        {row.contact_phone && (
          <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
            {row.contact_phone}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        {row.source ?? "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onOpenModal(row)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-80"
          style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
        >
          <Webhook className="h-3 w-3" />
          Details
        </button>
      </td>
    </tr>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function LogMobileCard({
  row,
  onOpenModal,
}: {
  row: LeadWebhookLogRow;
  onOpenModal: (row: LeadWebhookLogRow) => void;
}) {
  const contact = row.contact_name ?? row.contact_email ?? row.contact_phone ?? "—";

  return (
    <div
      className="rounded-[10px] border p-4 space-y-3"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {contact}
          </p>
          {row.contact_phone && (
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {row.contact_phone}
            </p>
          )}
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        <span>{row.source ?? "—"}</span>
        <span>{formatDate(row.received_at)}</span>
      </div>
      <button
        onClick={() => onOpenModal(row)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-[12px] font-medium transition-opacity hover:opacity-80"
        style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
      >
        <Webhook className="h-3.5 w-3.5" />
        View Details
      </button>
    </div>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const TABS: { id: FilterTab; label: string }[] = [
  { id: "all",      label: "All"      },
  { id: "accepted", label: "Accepted" },
  { id: "failed",   label: "Failed"   },
];

// ─── Main section ─────────────────────────────────────────────────────────────

export function LeadWebhookSection() {
  const [data, setData] = useState<LeadWebhookPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<ListPageSize>(() => readStoredListPageSize());
  const [dateFilter, setDateFilter] = useState<DashboardDateRangeFilterValue>(() =>
    defaultDashboardDateRangeFilterValue("last_week")
  );
  const [modalRow, setModalRow] = useState<LeadWebhookLogRow | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setOffset(0); }, [tab, debouncedSearch, dateFilter, pageSize]);

  const dateRange = useMemo(() => resolveDashboardDateRangeFilter(dateFilter), [dateFilter]);

  const loadUrl = useMemo(() => {
    const p = new URLSearchParams({ tab, limit: String(pageSize), offset: String(offset) });
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (dateRange) {
      p.set("date_from", dateRange.start.toISOString());
      p.set("date_to", dateRange.end.toISOString());
    }
    return `/api/admin/webhook/leads/page-data?${p}`;
  }, [tab, debouncedSearch, pageSize, offset, dateRange]);

  const load = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(loadUrl); }, [load, loadUrl]);

  async function handleClearPayloads() {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/webhook/leads/clear-payloads", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setShowClearModal(false);
      load(loadUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setClearing(false);
    }
  }

  function handlePageSizeChange(size: ListPageSize) {
    setPageSize(size);
    writeStoredListPageSize(size);
  }

  const rows = data?.rows ?? [];
  const counts = data?.counts;
  const pagination = data?.pagination;
  const totalInTab = pagination?.total ?? 0;
  const payloadsStored = data?.payloads_stored ?? 0;

  function tabCount(t: FilterTab): number {
    if (!counts) return 0;
    if (t === "all")      return counts.total;
    if (t === "accepted") return counts.accepted;
    return counts.failed;
  }

  return (
    <div className="space-y-6">
      {/* Modals */}
      {modalRow && <DetailModal row={modalRow} onClose={() => setModalRow(null)} />}
      {showClearModal && (
        <ClearPayloadsModal
          count={payloadsStored}
          onConfirm={handleClearPayloads}
          onCancel={() => setShowClearModal(false)}
          clearing={clearing}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Lead Webhook
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Tracks every inbound lead submitted via the webhook API. Use this panel to monitor status,
            view the original JSON payload, and troubleshoot failures.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {payloadsStored > 0 && (
            <button
              onClick={() => setShowClearModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Payloads
              <span
                className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                style={{ background: "var(--color-danger)", color: "#fff" }}
              >
                {payloadsStored}
              </span>
            </button>
          )}
          <button
            onClick={() => load(loadUrl)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              background: "color-mix(in srgb, var(--color-border) 60%, transparent)",
              color: "var(--color-text-primary)",
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
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
              Set <code className="font-mono">LEAD_WEBHOOK_SECRET</code> in your Vercel environment
              variables to enable inbound lead ingestion.
            </p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Received", value: counts?.total    ?? 0, color: "var(--color-text-primary)" },
            { label: "Accepted",       value: counts?.accepted ?? 0, color: "var(--color-success)"      },
            { label: "Failed",         value: counts?.failed   ?? 0, color: "var(--color-danger)"       },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[10px] border p-4 text-center"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <p className="text-[24px] font-semibold leading-none" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide font-medium" style={{ color: "var(--color-text-muted)" }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Search + date filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            placeholder="Search name, phone, email…"
            className="w-full pl-9 pr-3 py-2 rounded-md text-[13px] border outline-none transition-colors"
            style={{
              background: "var(--color-surface)",
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
        <DashboardDateRangeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b" style={{ borderColor: "var(--color-border)" }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setOffset(0); }}
              className="relative inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors"
              style={{
                color: active ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
                borderBottom: active ? "2px solid var(--color-tab-underline)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {t.label}
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
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-[10px] border p-4 text-[13px] flex items-center gap-2"
          style={{
            background: "var(--color-danger-bg)",
            borderColor: "var(--color-danger-border)",
            color: "var(--color-danger)",
          }}
        >
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Skeleton */}
      {loading && !data && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: "var(--color-row-alt)" }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-[10px] border py-16 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <Webhook className="h-8 w-8 mb-3 opacity-30" style={{ color: "var(--color-text-muted)" }} />
          <p className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {tab === "all" ? "No inbound leads yet" : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} leads`}
          </p>
          <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>
            {tab === "all"
              ? "Leads submitted via the webhook API will appear here."
              : "Try a different filter above."}
          </p>
        </div>
      )}

      {/* Desktop table */}
      {!loading && rows.length > 0 && (
        <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
                <th className="px-4 py-3 text-left">Received</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LogTableRow key={row.id} row={row} onOpenModal={setModalRow} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-col gap-3 lg:hidden">
          {rows.map((row) => (
            <LogMobileCard key={row.id} row={row} onOpenModal={setModalRow} />
          ))}
        </div>
      )}

      {/* Pagination */}
      <ListPagination
        total={totalInTab}
        offset={offset}
        pageSize={pageSize}
        onOffsetChange={setOffset}
        onPageSizeChange={handlePageSizeChange}
        loading={loading}
      />
    </div>
  );
}
