"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Zap, ExternalLink } from "lucide-react";
import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { TableDivSkeleton } from "@/components/ui/table-skeleton";
import {
  MobileListCard,
  MobileListCardRow,
  MobileListCardFields,
  MobileListCardSkeleton,
  MobileListCardEmpty,
  TicketListToolbar,
} from "@/components/ui/mobile-list-card";
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

function ProductionMobileCard({
  order: o,
  onOpen,
}: {
  order: ProductionOrder;
  onOpen: () => void;
}) {
  const pay = paymentIndicator(o);
  const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;
  const overdue = isOverdue(o.due_date);
  const dueSoon = isDueSoon(o.due_date);

  return (
    <MobileListCard onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {o.reference_code ? (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded inline-block" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
              {o.reference_code}
            </span>
          ) : (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
          )}
          <p className="font-semibold text-sm mt-1.5 truncate" style={{ color: "var(--color-text-primary)" }}>
            {displayName(o)}
          </p>
          {o.customer?.company && (
            <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{o.customer.company}</p>
          )}
        </div>
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 max-w-[130px] truncate"
          style={{ background: pay.bg, color: pay.text }}
        >
          {pay.label}
        </span>
      </div>

      {(o.title || o.rush) && (
        <div className="flex items-center gap-1.5 min-w-0">
          {o.rush && (
            <span title="Rush" style={{ color: "var(--color-danger)" }}>
              <Zap size={13} className="shrink-0" />
            </span>
          )}
          <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
            {o.title ?? "—"}
          </p>
        </div>
      )}

      <MobileListCardFields>
        <MobileListCardRow
          label="Total"
          value={o.quote_final_total != null ? formatCurrency(o.quote_final_total) : "—"}
        />
        <MobileListCardRow label="Priority" value={o.priority ?? "—"} valueColor={priorityStyle.color} />
        <MobileListCardRow
          label="Due Date"
          value={
            o.due_date
              ? `${new Date(o.due_date + "T00:00:00").toLocaleDateString()}${overdue ? " ⚠" : ""}`
              : "—"
          }
          valueColor={overdue ? "var(--color-danger)" : dueSoon ? "var(--color-warning)" : undefined}
        />
        <MobileListCardRow label="In Production" value={relativeTime(o.production_released_at)} />
      </MobileListCardFields>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className="w-full flex items-center justify-center gap-1 px-2.5 py-2 rounded-md text-xs font-medium border transition-opacity hover:opacity-70"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", background: "var(--color-bg)" }}
      >
        <ExternalLink size={11} /> View order
      </button>
    </MobileListCard>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductionPage() {
  const router = useRouter();
  const [orders, setOrders]     = useState<ProductionOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [tab, setTab]           = useState<Tab>("all");
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  const fetchPageData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/production/page-data")
      .then((r) => r.json())
      .then((d) => {
        if (d.orders) setOrders(d.orders);
        if (d.counts) setTabCounts(d.counts);
      })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useCoalescedRefresh(fetchPageData, [], {
    events: ["bazaar:tickets-changed", "bazaar:refresh-counts"],
  });

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

      <TicketListToolbar
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={tab}
        onTabChange={(id) => setTab(id as Tab)}
        tabCounts={tabCounts}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search orders…"
      />

      {/* Desktop table */}
      <div
        className="hidden lg:block rounded-b-xl border border-t-0 overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {loading ? (
          <TableDivSkeleton cols={8} />
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

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          <MobileListCardSkeleton />
        ) : filtered.length === 0 ? (
          <MobileListCardEmpty message={search ? "No orders match your search." : "No orders in production."} />
        ) : (
          filtered.map((o) => (
            <ProductionMobileCard key={o.id} order={o} onOpen={() => router.push(`/production/${o.id}`)} />
          ))
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

// ─── Skeleton — see components/ui/table-skeleton.tsx ─────────────────────────
