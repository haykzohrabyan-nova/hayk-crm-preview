"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Zap, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import {
  displayContactName,
  isDueSoon,
  isOverdue,
  relativeTime,
} from "@/lib/utils/format";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductionOrder {
  id: string;
  reference_code: string | null;
  title: string | null;
  ticket_status: string;
  payment_status: "unpaid" | "partial" | "paid" | null;
  quote_final_total: number | null;
  payment_amount_received: number | null;
  ticket_payment_strategy: "full" | "partial" | "net" | null;
  ticket_net_terms_label: string | null;
  priority: string | null;
  due_date: string | null;
  rush: boolean;
  production_released_at: string | null;
  created_at: string;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
}

type Tab = "all" | "balance_due";

const TABS: { id: Tab; label: string }[] = [
  { id: "all",         label: "All in Production" },
  { id: "balance_due", label: "Balance Due" },
];

const PRIORITY_STYLE: Record<string, { color: string }> = {
  High:   { color: "var(--color-danger)" },
  Normal: { color: "var(--color-text-muted)" },
  Low:    { color: "var(--color-success)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(o: ProductionOrder): string {
  return displayContactName(o.customer, { preferPerson: true });
}

// Derive a human-readable payment status label + style for in-production orders
function paymentIndicator(order: ProductionOrder): { label: string; bg: string; text: string } {
  const strategy = order.ticket_payment_strategy;
  const status   = order.payment_status;

  if (strategy === "net") {
    const terms = order.ticket_net_terms_label?.replace("-", " ") ?? "Net Terms";
    return {
      label: terms.charAt(0).toUpperCase() + terms.slice(1),
      bg:    "var(--color-info-bg)",
      text:  "var(--color-info-text)",
    };
  }

  if (status === "paid") {
    return { label: "Paid in Full", bg: "var(--color-success-bg)", text: "var(--color-success)" };
  }

  // Balance still owed
  const total  = Number(order.quote_final_total ?? 0);
  const paid   = Number(order.payment_amount_received ?? 0);
  const remaining = Math.max(total - paid, 0);

  return {
    label: remaining > 0 ? `Balance Due ${formatCurrency(remaining)}` : "Balance Due",
    bg:    "var(--color-warning-bg)",
    text:  "var(--color-warning-text-deep)",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductionPage() {
  const router = useRouter();
  const [orders, setOrders]     = useState<ProductionOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [tab, setTab]           = useState<Tab>("all");
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  const fetchCounts = useCallback(() => {
    fetch("/api/production/counts")
      .then((r) => r.json())
      .then((d) => { if (d.counts) setTabCounts(d.counts); })
      .catch(() => {});
  }, []);

  const fetchOrders = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/production/orders")
      .then((r) => r.json())
      .then((d) => { if (d.orders) setOrders(d.orders); })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  // Coalesce mount + realtime refetches (React Strict Mode fires effects twice in dev).
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh(silent: boolean) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchOrders(silent);
        fetchCounts();
      }, silent ? 300 : 50);
    }

    scheduleRefresh(false);

    function onChanged() {
      scheduleRefresh(true);
    }

    window.addEventListener("bazaar:tickets-changed", onChanged);
    window.addEventListener("bazaar:refresh-counts", onChanged);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("bazaar:tickets-changed", onChanged);
      window.removeEventListener("bazaar:refresh-counts", onChanged);
    };
  }, [fetchOrders, fetchCounts]);

  // ─── Filter ─────────────────────────────────────────────────────────────

  const filtered = orders.filter((o) => {
    if (tab === "balance_due") {
      if (o.payment_status === "paid" || o.ticket_payment_strategy === "net") return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const name    = displayName(o).toLowerCase();
      const company = (o.customer?.company ?? "").toLowerCase();
      const title   = (o.title ?? "").toLowerCase();
      const ref     = (o.reference_code ?? "").toLowerCase();
      if (!name.includes(s) && !company.includes(s) && !title.includes(s) && !ref.includes(s)) return false;
    }
    return true;
  });

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" style={{ color: "var(--color-text-primary)" }}>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            In Production
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Orders currently being printed
          </p>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="flex items-end justify-between border-b mb-0" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex">
          {TABS.map((t) => {
            const count = tabCounts[t.id] ?? 0;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-sm relative transition-colors"
                style={{
                  color:      tab === t.id ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
                  fontWeight: tab === t.id ? 500 : 400,
                }}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                    style={{
                      background: tab === t.id
                        ? "var(--color-badge-bg)"
                        : "color-mix(in srgb, var(--color-badge-bg) 70%, transparent)",
                      color: "var(--color-badge-text)",
                    }}
                  >
                    {count}
                  </span>
                )}
                {tab === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ background: "var(--color-tab-underline)" }} />
                )}
              </button>
            );
          })}
        </div>

        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders…"
            className="pl-8 pr-3 py-1.5 text-sm rounded-md border outline-none w-52"
            style={{
              background: "var(--color-bg)",
              border:     "1px solid var(--color-border)",
              color:      "var(--color-text-primary)",
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-b-xl border border-t-0 overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {loading ? (
          <TableSkeleton cols={8} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {search ? "No orders match your search." : "No orders in production."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Order #", "Contact", "Title", "Total", "Payment", "Priority", "Due Date", "In Production"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, idx) => {
                const pay          = paymentIndicator(o);
                const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;
                const overdue      = isOverdue(o.due_date);
                const dueSoon      = isDueSoon(o.due_date);

                return (
                  <tr
                    key={o.id}
                    className="cursor-pointer transition-colors"
                    style={{ background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)")}
                    onClick={() => router.push(`/production/${o.id}`)}
                  >
                    {/* Order # */}
                    <td className="px-4 py-3">
                      {o.reference_code ? (
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
                          {o.reference_code}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(o)}</p>
                      {o.customer?.company && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{o.customer.company}</p>
                      )}
                    </td>

                    {/* Title */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {o.rush && <span title="Rush" style={{ color: "var(--color-danger)" }}><Zap size={13} /></span>}
                        <span className="text-sm truncate max-w-[180px]" style={{ color: "var(--color-text-primary)" }}>
                          {o.title ?? "—"}
                        </span>
                      </div>
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {o.quote_final_total != null ? formatCurrency(o.quote_final_total) : "—"}
                      </span>
                    </td>

                    {/* Payment indicator */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: pay.bg, color: pay.text }}
                      >
                        {pay.label}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: priorityStyle.color }}>
                        {o.priority ?? "—"}
                      </span>
                    </td>

                    {/* Due date */}
                    <td className="px-4 py-3">
                      {o.due_date ? (
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: overdue ? "var(--color-danger)" :
                                   dueSoon ? "var(--color-warning)" :
                                   "var(--color-text-muted)",
                          }}
                        >
                          {new Date(o.due_date + "T00:00:00").toLocaleDateString()}
                          {overdue && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>

                    {/* In production since */}
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {relativeTime(o.production_released_at)}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/production/${o.id}`); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-opacity hover:opacity-70"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", background: "var(--color-bg)" }}
                      >
                        <ExternalLink size={11} /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs mt-3 text-right" style={{ color: "var(--color-text-muted)" }}>
          {filtered.length} order{filtered.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          {[...Array(cols)].map((__, j) => (
            <div key={j} className="h-4 rounded flex-1" style={{ background: "var(--color-border)" }} />
          ))}
        </div>
      ))}
    </div>
  );
}
