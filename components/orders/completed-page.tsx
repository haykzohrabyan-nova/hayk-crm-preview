"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Zap, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { displayContactName, formatDate } from "@/lib/utils/format";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompletedOrder {
  id: string;
  reference_code: string | null;
  title: string | null;
  ticket_status: string;
  payment_status: "unpaid" | "partial" | "paid" | null;
  quote_final_total: number | null;
  payment_amount_received: number | null;
  ticket_payment_strategy: "full" | "partial" | "net" | null;
  priority: string | null;
  due_date: string | null;
  rush: boolean;
  updated_at: string;
  created_at: string;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
}

const PAYMENT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  unpaid:  { bg: "var(--color-danger-bg)",  text: "var(--color-danger)",  label: "Unpaid" },
  partial: { bg: "var(--color-warning-bg)", text: "var(--color-warning)", label: "Partial" },
  paid:    { bg: "var(--color-success-bg)", text: "var(--color-success)", label: "Paid" },
};

const PRIORITY_STYLE: Record<string, { color: string }> = {
  High:   { color: "var(--color-danger)" },
  Normal: { color: "var(--color-text-muted)" },
  Low:    { color: "var(--color-success)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(o: CompletedOrder): string {
  return displayContactName(o.customer, { preferPerson: true });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CompletedPage() {
  const router = useRouter();
  const [orders, setOrders]   = useState<CompletedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  const fetchOrders = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/completed/orders")
      .then((r) => r.json())
      .then((d) => { if (d.orders) setOrders(d.orders); })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    function onChanged() { fetchOrders(true); }
    window.addEventListener("bazaar:tickets-changed", onChanged);
    return () => window.removeEventListener("bazaar:tickets-changed", onChanged);
  }, [fetchOrders]);

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const s       = search.toLowerCase();
    const name    = displayName(o).toLowerCase();
    const company = (o.customer?.company ?? "").toLowerCase();
    const title   = (o.title ?? "").toLowerCase();
    const ref     = (o.reference_code ?? "").toLowerCase();
    return name.includes(s) || company.includes(s) || title.includes(s) || ref.includes(s);
  });

  return (
    <div className="space-y-5" style={{ color: "var(--color-text-primary)" }}>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Completed Orders
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            All finished orders
          </p>
        </div>

        {/* Search */}
        <div className="relative">
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
        className="rounded-[10px] border overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {loading ? (
          <TableSkeleton cols={8} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {search ? "No orders match your search." : "No completed orders yet."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Order #", "Contact", "Title", "Total", "Payment", "Priority", "Due Date", "Completed"].map((h) => (
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
                const ps = PAYMENT_STYLE[o.payment_status ?? "unpaid"] ?? PAYMENT_STYLE.unpaid;
                const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;

                return (
                  <tr
                    key={o.id}
                    className="cursor-pointer transition-colors"
                    style={{ background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)")}
                    onClick={() => router.push(`/completed/${o.id}`)}
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

                    {/* Payment */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: ps.bg, color: ps.text }}
                      >
                        {ps.label}
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
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {o.due_date ? new Date(o.due_date + "T00:00:00").toLocaleDateString() : "—"}
                      </span>
                    </td>

                    {/* Completed at */}
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {formatDate(o.updated_at)}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/completed/${o.id}`); }}
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
