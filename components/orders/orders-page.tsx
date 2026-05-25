"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MobileListCard,
  MobileListCardRow,
  MobileListCardFields,
  MobileListCardSkeleton,
  MobileListCardEmpty,
  TicketListToolbar,
} from "@/components/ui/mobile-list-card";
import { Zap, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import {
  displayContactName,
  isDueSoon,
  isOverdue,
  relativeTime,
} from "@/lib/utils/format";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import type { OrderListStatusTone } from "@/lib/utils/order-list-status";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderTicket {
  id: string;
  ticket_kind: string;
  ticket_status: string;
  status_label: string;
  status_tone: OrderListStatusTone;
  payment_status: "unpaid" | "partial" | "paid" | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_paid_at: string | null;
  title: string | null;
  reference_code: string | null;
  quote_final_total: number | null;
  payment_amount_received: number | null;
  priority: string | null;
  due_date: string | null;
  rush: boolean;
  created_at: string;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  created_by: { id: string; full_name: string | null } | null;
}

const PAYMENT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  unpaid:  { bg: "var(--color-danger-bg)",  text: "var(--color-danger)",  label: "Unpaid" },
  partial: { bg: "var(--color-warning-bg)", text: "var(--color-warning)", label: "Partial" },
  paid:    { bg: "var(--color-success-bg)", text: "var(--color-success)", label: "Paid" },
};

function paymentDisplay(o: OrderTicket): { bg: string; text: string; label: string } {
  if (isPaymentEvidencePending(o)) {
    return {
      bg: "var(--color-warning-bg)",
      text: "var(--color-warning-text-deep)",
      label: "Awaiting review",
    };
  }
  return PAYMENT_STYLE[o.payment_status ?? "unpaid"] ?? PAYMENT_STYLE.unpaid;
}

type Tab = "all" | "pending" | "in_production" | "cancelled";

const TABS: { id: Tab; label: string; statuses?: string[] }[] = [
  { id: "all",            label: "All",             statuses: ["order", "in_production", "cancelled"] },
  { id: "pending",        label: "Pending Payment", statuses: ["order"] },
  { id: "in_production",  label: "In Production",   statuses: ["in_production"] },
  { id: "cancelled",      label: "Cancelled",       statuses: ["cancelled"] },
];

const STATUS_TONE_STYLE: Record<OrderListStatusTone, { bg: string; text: string }> = {
  confirmed:              { bg: "var(--color-success-bg)", text: "var(--color-success)" },
  converted:              { bg: "var(--color-info-bg)",    text: "var(--color-info-text)" },
  awaiting_confirmation:  { bg: "var(--color-warning-bg)", text: "var(--color-warning-text-deep)" },
  admin_override:         { bg: "var(--color-warning-bg)", text: "var(--color-warning-text-deep)" },
  in_production:          { bg: "var(--color-info-bg)",    text: "var(--color-info-text)" },
  cancelled:              { bg: "var(--color-danger-bg)",  text: "var(--color-danger)" },
};

const PRIORITY_STYLE: Record<string, { color: string }> = {
  High:   { color: "var(--color-danger)" },
  Normal: { color: "var(--color-text-muted)" },
  Low:    { color: "var(--color-success)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(o: OrderTicket): string {
  return displayContactName(o.customer, { preferPerson: true });
}

function orderPaymentAmounts(o: OrderTicket): {
  total: string;
  received: string;
  balanceDue: string;
  receivedValue: number | null;
  balanceDueValue: number | null;
} {
  if (o.quote_final_total == null) {
    return { total: "—", received: "—", balanceDue: "—", receivedValue: null, balanceDueValue: null };
  }

  const total = Number(o.quote_final_total);
  const receivedValue = o.payment_amount_received;
  const received =
    receivedValue != null && Number.isFinite(Number(receivedValue))
      ? formatCurrency(Number(receivedValue))
      : "—";
  const balanceDueValue = Math.max(0, total - Number(receivedValue ?? 0));

  return {
    total: formatCurrency(total),
    received,
    balanceDue: formatCurrency(balanceDueValue),
    receivedValue: receivedValue != null ? Number(receivedValue) : null,
    balanceDueValue,
  };
}

function OrderMobileCard({
  order: o,
  onOpen,
}: {
  order: OrderTicket;
  onOpen: () => void;
}) {
  const statusStyle = STATUS_TONE_STYLE[o.status_tone] ?? STATUS_TONE_STYLE.converted;
  const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;
  const overdue = isOverdue(o.due_date);
  const dueSoon = isDueSoon(o.due_date);
  const ps = paymentDisplay(o);
  const amounts = orderPaymentAmounts(o);

  return (
    <MobileListCard onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {o.reference_code ? (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded inline-block" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
              {o.reference_code}
            </span>
          ) : (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Draft</span>
          )}
          <p className="font-semibold text-sm mt-1.5 truncate" style={{ color: "var(--color-text-primary)" }}>
            {displayName(o)}
          </p>
          {o.customer?.company && (
            <p className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{o.customer.company}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium max-w-[140px] truncate"
            title={o.status_label}
            style={{ background: statusStyle.bg, color: statusStyle.text }}
          >
            {o.status_label}
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={{ background: ps.bg, color: ps.text }}
          >
            {ps.label}
          </span>
        </div>
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
        <MobileListCardRow label="Total" value={amounts.total} />
        <MobileListCardRow
          label="Received"
          value={amounts.received}
          valueColor={
            amounts.receivedValue != null && amounts.receivedValue > 0.01
              ? "var(--color-success)"
              : undefined
          }
        />
        <MobileListCardRow
          label="Balance Due"
          value={amounts.balanceDue}
          valueColor={
            amounts.balanceDueValue != null && amounts.balanceDueValue > 0.01
              ? "var(--color-warning)"
              : undefined
          }
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
        <MobileListCardRow label="Created" value={relativeTime(o.created_at)} />
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

function OrdersTableDesktop({
  orders: filtered,
  onOpen,
}: {
  orders: OrderTicket[];
  onOpen: (id: string) => void;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
          {["Order #", "Contact", "Title", "Total", "Received", "Balance Due", "Priority", "Due Date", "Status", "Payment", "Created"].map((h) => (
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
          const statusStyle = STATUS_TONE_STYLE[o.status_tone] ?? STATUS_TONE_STYLE.converted;
          const priorityStyle = PRIORITY_STYLE[o.priority ?? "Normal"] ?? PRIORITY_STYLE.Normal;
          const overdue = isOverdue(o.due_date);
          const dueSoon = isDueSoon(o.due_date);
          const amounts = orderPaymentAmounts(o);

          return (
            <tr
              key={o.id}
              className="cursor-pointer transition-colors"
              style={{ background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)")}
              onClick={() => onOpen(o.id)}
            >
              <td className="px-4 py-3">
                {o.reference_code ? (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
                    {o.reference_code}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Draft</span>
                )}
              </td>
              <td className="px-4 py-3">
                <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(o)}</p>
                {o.customer?.company && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{o.customer.company}</p>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {o.rush && (
                    <span title="Rush" style={{ color: "var(--color-danger)" }}>
                      <Zap size={13} />
                    </span>
                  )}
                  <span className="text-sm truncate max-w-[180px]" style={{ color: "var(--color-text-primary)" }}>
                    {o.title ?? "—"}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm font-medium tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                  {amounts.total}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="text-sm font-medium tabular-nums"
                  style={{
                    color:
                      amounts.receivedValue != null && amounts.receivedValue > 0.01
                        ? "var(--color-success)"
                        : "var(--color-text-muted)",
                  }}
                >
                  {amounts.received}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className="text-sm font-medium tabular-nums"
                  style={{
                    color:
                      amounts.balanceDueValue != null && amounts.balanceDueValue > 0.01
                        ? "var(--color-warning)"
                        : "var(--color-text-muted)",
                  }}
                >
                  {amounts.balanceDue}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm font-medium" style={{ color: priorityStyle.color }}>
                  {o.priority ?? "—"}
                </span>
              </td>
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
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium max-w-[180px] truncate"
                  title={o.status_label}
                  style={{ background: statusStyle.bg, color: statusStyle.text }}
                >
                  {o.status_label}
                </span>
              </td>
              <td className="px-4 py-3">
                {(() => {
                  const ps = paymentDisplay(o);
                  return (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: ps.bg, color: ps.text }}
                    >
                      {ps.label}
                    </span>
                  );
                })()}
              </td>
              <td className="px-4 py-3">
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {relativeTime(o.created_at)}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpen(o.id); }}
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
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "all" || t === "pending" || t === "in_production" || t === "cancelled") {
      setTab(t);
    }
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  // ─── Fetch counts ───────────────────────────────────────────────────────

  const fetchCounts = useCallback(() => {
    fetch("/api/tickets/counts")
      .then((r) => r.json())
      .then((d) => {
        if (d.counts) {
          const pending = d.counts.orders ?? 0;
          const inProduction = d.counts.in_production ?? 0;
          const cancelled = d.counts.cancelled ?? 0;
          setTabCounts({
            all: pending + inProduction + cancelled,
            pending,
            in_production: inProduction,
            cancelled,
          });
        }
      })
      .catch(() => {});
  }, []);

  // ─── Fetch orders ───────────────────────────────────────────────────────

  const fetchOrders = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/orders/orders")
      .then((r) => r.json())
      .then((d) => { if (d.orders) setOrders(d.orders); })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchCounts();
  }, [fetchOrders, fetchCounts]);

  // Realtime: refresh on ticket changes
  useEffect(() => {
    function onChanged() { fetchOrders(true); fetchCounts(); }
    window.addEventListener("bazaar:tickets-changed", onChanged);
    window.addEventListener("bazaar:refresh-counts",  onChanged);
    return () => {
      window.removeEventListener("bazaar:tickets-changed", onChanged);
      window.removeEventListener("bazaar:refresh-counts",  onChanged);
    };
  }, [fetchOrders, fetchCounts]);

  // ─── Filter ─────────────────────────────────────────────────────────────

  const activeTabDef = TABS.find((t) => t.id === tab)!;

  const filtered = orders.filter((o) => {
    if (activeTabDef.statuses && !activeTabDef.statuses.includes(o.ticket_status)) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = displayName(o).toLowerCase();
      const company = (o.customer?.company ?? "").toLowerCase();
      const title = (o.title ?? "").toLowerCase();
      const ref = (o.reference_code ?? "").toLowerCase();
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
            Orders
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Active orders and in-production jobs — payment proof awaiting accountant review stays visible here for the rep who owns the order
          </p>
        </div>
      </div>

      <TicketListToolbar
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={tab}
        onTabChange={(id) => selectTab(id as Tab)}
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
          <DesktopTableSkeleton cols={11} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {search ? "No orders match your search." : "No orders yet."}
            </p>
          </div>
        ) : (
          <OrdersTableDesktop orders={filtered} onOpen={(id) => router.push(`/orders/${id}`)} />
        )}
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          <MobileListCardSkeleton />
        ) : filtered.length === 0 ? (
          <MobileListCardEmpty message={search ? "No orders match your search." : "No orders yet."} />
        ) : (
          filtered.map((o) => (
            <OrderMobileCard key={o.id} order={o} onOpen={() => router.push(`/orders/${o.id}`)} />
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DesktopTableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          {[...Array(cols)].map((__, j) => (
            <div key={j} className="h-4 rounded flex-1" style={{ background: "var(--color-border)" }} />
          ))}
        </div>
      ))}
    </div>
  );
}
