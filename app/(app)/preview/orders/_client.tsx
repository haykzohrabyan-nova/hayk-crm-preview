"use client";

// Hayk 2026-07-12 — Orders preview CLIENT UI.
// Pure presentation. Receives REAL orders + board stages as props from the
// server component (page.tsx). No hardcoded data lives here.

import { useMemo, useState, useRef, useEffect } from "react";
import {
  passportCore, fmtMoney, daysPastDue,
  STATUS_COLORS, PAY_COLORS, CHIPS, th, td,
  type Order, type OrderStatus, type PaymentStatus, type Priority,
  type OrderLineItem, type Attachment, type CommEntry, type PaymentEntry,
  type TimelineEntry, type CustomerProfile, type ChipKey, type BoardStage,
} from "./_shared";

const ACCENT = "#FF5D2E";
const GOLD = "#fbbf24";

// Shared control chrome so every header control (date, status, filters, team,
// search, view toggle) is the exact same height / radius / border — clean row.
const CONTROL: React.CSSProperties = {
  height: "36px",
  padding: "0 12px",
  background: "var(--preview-surface)",
  border: "1px solid var(--preview-border)",
  borderRadius: "8px",
  fontSize: "12.5px",
  color: "var(--preview-text)",
  cursor: "pointer",
  boxSizing: "border-box",
  outline: "none",
  display: "flex",
  alignItems: "center",
};

// Status filter options — each maps to a real OrderStatus value.
const STATUS_OPTIONS: { key: string; label: string; match: OrderStatus }[] = [
  { key: "pending",    label: "Pending Payment", match: "Pending Payment" },
  { key: "production", label: "In Production",   match: "In Production" },
  { key: "ready",      label: "Ready to Ship",   match: "Ready to Ship" },
  { key: "shipped",    label: "Shipped",         match: "Shipped" },
  { key: "completed",  label: "Completed",       match: "Delivered" },
  { key: "cancelled",  label: "Cancelled",       match: "Cancelled" },
  { key: "refunds",    label: "Refunds",         match: "Refunded" },
];

export default function OrdersClient({ orders, boardStages }: { orders: Order[]; boardStages: BoardStage[] }) {
  // Multi-select status filter (empty = All). Replaces the old single-select tab row.
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<"status" | "filters" | null>(null);
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "7d" | "30d" | "custom">("30d");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("open");
    return p || null;
  });
  const [view, setView] = useState<"table" | "kanban">("table");
  const [chips, setChips] = useState<Set<ChipKey>>(() => {
    // Auto-apply chip from ?filter= URL param, so dashboard callouts can deep-link.
    if (typeof window === "undefined") return new Set();
    const p = new URLSearchParams(window.location.search).get("filter");
    if (p === "payment-overdue") return new Set(["paymentOverdue" as ChipKey]);
    if (p === "past-due" || p === "overdue") return new Set(["overdue" as ChipKey]);
    if (p === "rush") return new Set(["rush" as ChipKey]);
    return new Set();
  });

  const toggleChip = (k: ChipKey) => {
    setChips(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // Real team members — derived from the loaded orders' creators.
  const teamMembers = useMemo(
    () => Array.from(new Set(orders.map(o => o.createdBy).filter(n => n && n !== "—"))).sort(),
    [orders],
  );

  const filtered = useMemo(() => {
    let out = orders;
    // Multi-select status: empty = All; otherwise keep orders matching ANY selected status.
    if (statusSel.size > 0) {
      const wanted = new Set(
        STATUS_OPTIONS.filter(s => statusSel.has(s.key)).map(s => s.match),
      );
      out = out.filter(o => wanted.has(o.status));
    }
    if (teamFilter) out = out.filter(o => o.createdBy === teamFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(o => o.contact.toLowerCase().includes(q) || o.company.toLowerCase().includes(q) || o.refId.includes(q) || o.title.toLowerCase().includes(q));
    }
    if (chips.has("overdue"))         out = out.filter(o => o.dueOverdue === true);
    if (chips.has("paymentOverdue"))  out = out.filter(o => o.paymentOverdue === true);
    if (chips.has("rush"))            out = out.filter(o => o.priority === "Rush");
    if (chips.has("hasFiles"))        out = out.filter(o => o.attachmentsCount > 0);
    if (chips.has("awaitingPayment")) out = out.filter(o => o.status === "Pending Payment" || o.payment !== "Paid");
    if (chips.has("balanceDue"))      out = out.filter(o => o.balanceDue > 0);
    // Overdue-first sort: any order past due (and still open) floats to the top,
    // regardless of tab/filter — so nothing critical gets buried.
    const isOverdue = (o: Order) => o.dueOverdue === true && o.status !== "Delivered" && o.status !== "Cancelled" && o.status !== "Refunded";
    return [...out].sort((a, b) => {
      const ao = isOverdue(a) ? 1 : 0;
      const bo = isOverdue(b) ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return 0;
    });
  }, [orders, statusSel, search, teamFilter, chips]);

  // Real counts — computed from the actual board-stage buckets of the loaded
  // orders. Any tab with no matching orders honestly shows 0.
  const counts = {
    all: orders.length,
    pending: orders.filter(o => o.status === "Pending Payment").length,
    production: orders.filter(o => o.status === "In Production").length,
    ready: orders.filter(o => o.status === "Ready to Ship").length,
    shipped: orders.filter(o => o.status === "Shipped").length,
    completed: orders.filter(o => o.status === "Delivered").length,
    cancelled: orders.filter(o => o.status === "Cancelled").length,
    refunds: orders.filter(o => o.status === "Refunded").length,
  };

  const detailOrder = detailId ? orders.find(o => o.refId === detailId) : null;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "var(--preview-bg)", color: "var(--preview-text)", margin: "-20px", padding: "20px", minHeight: "100vh" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text)" }}>Orders · live data from the shared production DB · continuous ref# through quote → order → production</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--preview-text-muted)" }}>{orders.length} connected order{orders.length === 1 ? "" : "s"}</span>
      </div>

      {detailOrder ? (
        <OrderDetail
          order={detailOrder}
          boardStages={boardStages}
          onBack={() => setDetailId(null)}
          onViewCustomerOrders={(q) => { setDetailId(null); setStatusSel(new Set()); setChips(new Set()); setSearch(q); }}
        />
      ) : (
        <>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Orders</h1>
            {/* Date range — compact dropdown (was a wide 5-button strip). */}
            <select value={dateRange} onChange={e => setDateRange(e.target.value as any)} style={{ ...CONTROL, fontWeight: 600, minWidth: "150px" }}>
              <option value="today">📅 Today</option>
              <option value="yesterday">📅 Yesterday</option>
              <option value="7d">📅 Last 7 Days</option>
              <option value="30d">📅 Last 30 Days</option>
              <option value="custom">📅 Custom range…</option>
            </select>
          </div>

          {/* Filter bar: Status + Quick-filter dropdowns (combinable) · view · team · search */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {/* STATUS multi-select dropdown */}
              <div style={{ position: "relative" }}>
                <button onClick={() => setOpenMenu(openMenu === "status" ? null : "status")} style={{
                  ...CONTROL, gap: "8px", fontWeight: 600,
                  border: `1px solid ${statusSel.size > 0 ? GOLD : "var(--preview-border)"}`,
                }}>
                  <span>Status</span>
                  {statusSel.size > 0
                    ? <span style={{ padding: "1px 8px", background: "#fef3c7", color: "#78350f", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>{statusSel.size}</span>
                    : <span style={{ color: "#999", fontWeight: 500 }}>All</span>}
                  <span style={{ color: "#999", fontSize: "10px" }}>▾</span>
                </button>
                {openMenu === "status" && (
                  <MenuPanel onClose={() => setOpenMenu(null)}>
                    <MenuHeader
                      title={`${counts.all} orders total`}
                      onClear={statusSel.size > 0 ? () => setStatusSel(new Set()) : undefined}
                      clearLabel="All statuses"
                    />
                    {STATUS_OPTIONS.map(s => {
                      const on = statusSel.has(s.key);
                      const c = (counts as any)[s.key] as number;
                      return (
                        <CheckRow key={s.key} on={on} label={s.label} count={c} onClick={() => {
                          setStatusSel(prev => {
                            const next = new Set(prev);
                            if (next.has(s.key)) next.delete(s.key); else next.add(s.key);
                            return next;
                          });
                        }} />
                      );
                    })}
                  </MenuPanel>
                )}
              </div>

              {/* QUICK FILTERS multi-select dropdown */}
              <div style={{ position: "relative" }}>
                <button onClick={() => setOpenMenu(openMenu === "filters" ? null : "filters")} style={{
                  ...CONTROL, gap: "8px", fontWeight: 600,
                  border: `1px solid ${chips.size > 0 ? GOLD : "var(--preview-border)"}`,
                }}>
                  <span>Quick filters</span>
                  {chips.size > 0
                    ? <span style={{ padding: "1px 8px", background: "#fef3c7", color: "#78350f", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>{chips.size}</span>
                    : <span style={{ color: "#999", fontWeight: 500 }}>None</span>}
                  <span style={{ color: "#999", fontSize: "10px" }}>▾</span>
                </button>
                {openMenu === "filters" && (
                  <MenuPanel onClose={() => setOpenMenu(null)}>
                    <MenuHeader
                      title="Combine any filters"
                      onClear={chips.size > 0 ? () => setChips(new Set()) : undefined}
                      clearLabel="Clear filters"
                    />
                    {CHIPS.map(c => (
                      <CheckRow key={c.key} on={chips.has(c.key)} label={c.label} tint={c.tint} onClick={() => toggleChip(c.key)} />
                    ))}
                  </MenuPanel>
                )}
              </div>

              {/* Active-filter pills (quick way to remove one) */}
              {Array.from(statusSel).map(k => {
                const s = STATUS_OPTIONS.find(x => x.key === k);
                if (!s) return null;
                return (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 8px 4px 10px", background: "#fef3c7", color: "#78350f", borderRadius: "999px", fontSize: "11.5px", fontWeight: 700 }}>
                    {s.label}
                    <button onClick={() => setStatusSel(prev => { const n = new Set(prev); n.delete(k); return n; })} style={{ background: "none", border: "none", color: "#78350f", cursor: "pointer", fontSize: "13px", lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                );
              })}
              {Array.from(chips).map(k => {
                const c = CHIPS.find(x => x.key === k);
                if (!c) return null;
                return (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 8px 4px 10px", background: c.tint + "22", color: c.tint, borderRadius: "999px", fontSize: "11.5px", fontWeight: 700 }}>
                    {c.label}
                    <button onClick={() => toggleChip(k)} style={{ background: "none", border: "none", color: c.tint, cursor: "pointer", fontSize: "13px", lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* View toggle: Table / Kanban — same 36px height as the rest */}
              <div style={{ ...CONTROL, padding: "3px", gap: "3px", cursor: "default" }}>
                <button onClick={() => setView("table")} style={{
                  height: "28px", padding: "0 12px", background: view === "table" ? "#0a0a0a" : "transparent",
                  color: view === "table" ? "#fff" : "#666", border: "none", borderRadius: "6px",
                  fontSize: "12px", fontWeight: view === "table" ? 700 : 500, cursor: "pointer",
                }}>☰ Table</button>
                <button onClick={() => setView("kanban")} style={{
                  height: "28px", padding: "0 12px", background: view === "kanban" ? "#0a0a0a" : "transparent",
                  color: view === "kanban" ? "#fff" : "#666", border: "none", borderRadius: "6px",
                  fontSize: "12px", fontWeight: view === "kanban" ? 700 : 500, cursor: "pointer",
                }}>▦ Kanban</button>
              </div>
              <select value={teamFilter || "all"} onChange={e => setTeamFilter(e.target.value === "all" ? null : e.target.value)} style={{ ...CONTROL, fontWeight: 500 }}>
                <option value="all">All team members</option>
                {teamMembers.map(m => <option key={m}>{m}</option>)}
              </select>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search orders..." style={{ ...CONTROL, display: "block", cursor: "text", width: "230px", fontWeight: 500 }} />
            </div>
          </div>

          {view === "kanban" ? (
            <KanbanBoard orders={filtered} onCardClick={id => setDetailId(id)} />
          ) : (
          /* Orders table */
          <div style={{ background: "var(--preview-surface)", borderRadius: "12px", border: "1px solid var(--preview-border)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#888", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.06em", background: "var(--preview-surface-2)" }}>
                  <th style={{ ...th, width: "110px" }}>Order #</th>
                  <th style={{ ...th, width: "92px", cursor: "help" }} title="Order Placed — the date the quote was converted to an order (customer paid or agreed to terms).">Date</th>
                  <th style={th}>Contact</th>
                  <th style={{ ...th, maxWidth: "280px" }}>Title</th>
                  <th style={th}>Created By</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={{ ...th, textAlign: "right" }}>Received</th>
                  <th style={{ ...th, textAlign: "right" }}>Balance Due</th>
                  <th style={th}>Priority</th>
                  <th style={th}>Due Date</th>
                  <th style={th}>Status</th>
                  <th style={th}>Payment</th>
                  <th style={{ width: "60px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: "40px 16px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "13px" }}>
                      {orders.length === 0
                        ? "No orders in the shared database yet."
                        : "No orders match the current filters."}
                    </td>
                  </tr>
                ) : filtered.map(o => (
                  <OrderRow
                    key={o.refId}
                    order={o}
                    expanded={expandedId === o.refId}
                    onToggle={() => setExpandedId(expandedId === o.refId ? null : o.refId)}
                    onView={() => setDetailId(o.refId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Row (with inline expand) ────────────────────────────────────────
function OrderRow({ order, expanded, onToggle, onView }: { order: Order; expanded: boolean; onToggle: () => void; onView: () => void }) {
  const overdue = order.dueOverdue;
  return (
    <>
      <tr onClick={onToggle} style={{
        borderTop: "1px solid #f4f4f4",
        background: overdue ? "#fef2f2" : expanded ? "#fff7ed" : "transparent",
        cursor: "pointer",
        borderLeft: overdue ? "3px solid #dc2626" : "3px solid transparent",
      }}>
        <td style={td}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "monospace", fontWeight: 700, color: expanded ? ACCENT : "#171717" }}>
            <span style={{ fontSize: "10px" }}>{expanded ? "▾" : "▸"}</span>
            ORD-{order.refId}
          </div>
        </td>
        <td style={td} title={`Order Placed — the date the quote was converted to an order (customer paid or agreed to terms). This order was placed on ${order.createdDate} (${order.createdAgo}).`}>
          <div style={{ fontSize: "12px", color: "var(--preview-text)", fontWeight: 600, whiteSpace: "nowrap", cursor: "help" }}>{order.createdDate}</div>
          <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{order.createdAgo}</div>
        </td>
        <td style={td}>
          <div style={{ fontSize: "13px", fontWeight: 700 }}>{order.contact}</div>
          {order.company && <div style={{ fontSize: "11px", color: "#888" }}>{order.company}</div>}
        </td>
        <td style={{ ...td, maxWidth: "300px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <OrderThumb src={order.thumbnailUrl} alt={order.title} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12.5px", lineHeight: 1.4, color: "#333", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any }}>{order.title || <span style={{ color: "#bbb" }}>—</span>}</div>
              <div style={{ fontSize: "10.5px", color: order.attachmentsCount > 0 ? "#3b82f6" : "#bbb", marginTop: "3px", fontWeight: 600 }}>
                {order.attachmentsCount > 0 ? `📎 ${order.attachmentsCount}` : "—"}
              </div>
            </div>
          </div>
        </td>
        <td style={td}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "9px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.ownerAvatar}</span>
            <span style={{ fontSize: "12px" }}>{order.createdBy.split(" ")[0]}</span>
          </div>
        </td>
        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(order.total)}</td>
        <td style={{ ...td, textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{order.received > 0 ? fmtMoney(order.received) : "—"}</td>
        <td style={{ ...td, textAlign: "right", color: order.balanceDue > 0 ? "#dc2626" : "#171717", fontWeight: order.balanceDue > 0 ? 700 : 500 }}>
          <div>{fmtMoney(order.balanceDue)}</div>
          {order.paymentOverdue && order.paymentDueDate && (() => {
            const d = daysPastDue(order.paymentDueDate);
            if (d <= 0) return null;
            return (
              <div style={{ fontSize: "10px", color: "#b91c1c", fontWeight: 700, marginTop: "2px" }} title={`${order.paymentTerms || "Payment"} due ${order.paymentDueDate} — ${d} day${d === 1 ? "" : "s"} past due`}>
                💸 {d} {d === 1 ? "day" : "days"} late
              </div>
            );
          })()}
        </td>
        <td style={td}>
          <span style={{ color: order.priority === "High" ? "#dc2626" : order.priority === "Rush" ? "#f59e0b" : "#22c55e", fontWeight: 700, fontSize: "11.5px" }}>
            {order.priority}
          </span>
        </td>
        <td style={td}>
          {order.dueDate ? (
            <>
              <div style={{ fontSize: "11.5px", color: overdue ? "#dc2626" : "var(--preview-text)", fontWeight: overdue ? 700 : 500 }}>{order.dueDate}</div>
              {overdue && (() => {
                const d = daysPastDue(order.dueDate);
                return <div style={{ fontSize: "10px", color: "#dc2626", fontWeight: 700 }} title={`Due date passed ${d} day${d === 1 ? "" : "s"} ago`}>⚠ {d} {d === 1 ? "day" : "days"} late</div>;
              })()}
            </>
          ) : <span style={{ color: "#bbb" }}>—</span>}
        </td>
        <td style={td}>
          <span title={`Live production stage${order.stageName ? ` — ${order.stageName}` : ""}`} style={{ padding: "2px 8px", background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].fg, fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{order.stageName ?? order.status}</span>
        </td>
        <td style={td}>
          <span style={{ padding: "2px 8px", background: PAY_COLORS[order.payment].bg, color: PAY_COLORS[order.payment].fg, fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{order.payment}</span>
        </td>
        <td style={td}>
          <button onClick={e => { e.stopPropagation(); onView(); }} style={{ padding: "5px 10px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>↗ View</button>
        </td>
      </tr>

      {/* Expanded row — line items in quote-parameter format */}
      {expanded && (
        <tr style={{ background: "var(--preview-surface)" }}>
          <td colSpan={13} style={{ padding: "6px 20px 14px 20px" }}>
            {/* Pinned left so the expanded detail always reads fully, even if the
                wide table scrolls horizontally. */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", position: "sticky", left: "20px", width: "min(1180px, calc(100vw - 360px))" }}>
              {order.lineItems.map(l => (
                <div key={l.id} style={{ background: "#fff7ed", border: `1px solid ${ACCENT}44`, borderRadius: "10px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "4px" }}>
                      {l.productName}{l.materialName && <span style={{ fontSize: "11.5px", color: "#888", fontWeight: 500 }}> · {l.materialName}</span>}
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                      {l.productCategory && <Pill>{l.productCategory}</Pill>}
                      {l.colorMode && <Pill>Color: {l.colorMode}</Pill>}
                      {l.sides && <Pill>Sides: {l.sides === "S1" ? "Single-sided" : "Double-sided"}</Pill>}
                      {l.widthIn && l.heightIn && <Pill>Size: {l.widthIn}" × {l.heightIn}"</Pill>}
                      <Pill>Qty: {l.quantity.toLocaleString()}</Pill>
                      <Pill>Unit: {fmtMoney(l.unitPrice)}</Pill>
                      {(l.specs ?? []).map(s => <Pill key={s.label}>{s.label}: {s.value}</Pill>)}
                      {(l.finishingLabels ?? []).map(f => <Pill key={f} tone="amber">{f}</Pill>)}
                      {(l.specialEffectLabels ?? []).map(e => <Pill key={e} tone="purple">{e}</Pill>)}
                    </div>
                    {l.comment && <div style={{ fontSize: "11.5px", color: "#666", marginTop: "6px", fontStyle: "italic" }}>{l.comment}</div>}
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#16a34a", whiteSpace: "nowrap" }}>{fmtMoney(l.extended)}</div>
                </div>
              ))}
              {order.attachments.length > 0 && (
                <div style={{ padding: "2px 4px" }}>
                  <div style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Attachments ({order.attachmentsCount})</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {order.attachments.slice(0, 3).map(name => (
                      <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", fontSize: "11px", fontWeight: 600, borderRadius: "6px" }}>
                        📎 {name}
                      </span>
                    ))}
                    {order.attachments.length > 3 && (
                      <span style={{ fontSize: "11px", color: "#888", padding: "3px 4px" }}>+{order.attachments.length - 3} more</span>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 4px", fontSize: "12px", color: "#666" }}>
                <span>Quote source: <b style={{ color: ACCENT, fontFamily: "monospace" }}>{order.quoteRefId}</b> · {order.attachmentsCount} attachment{order.attachmentsCount !== 1 ? "s" : ""} · {order.shippingMethod || "Not set"}</span>
                <button onClick={onView} style={{ padding: "5px 12px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>Full details →</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "amber" | "purple" }) {
  const bg = tone === "amber" ? "#fef3c7" : tone === "purple" ? "#ede9fe" : "#fff";
  const fg = tone === "amber" ? "#78350f" : tone === "purple" ? "#5b21b6" : "#333";
  const bd = tone === "amber" ? "#fde68a" : tone === "purple" ? "#c4b5fd" : "#e5e5e5";
  return (
    <span style={{ padding: "3px 10px", background: bg, color: fg, border: `1px solid ${bd}`, fontSize: "11px", fontWeight: 600, borderRadius: "6px", whiteSpace: "nowrap" }}>{children}</span>
  );
}

// ─── Kanban board ────────────────────────────────────────
function KanbanBoard({ orders, onCardClick }: { orders: Order[]; onCardClick: (id: string) => void }) {
  const columns: OrderStatus[] = ["Pending Payment", "In Production", "Ready to Ship", "Shipped", "Delivered", "Cancelled", "Refunded"];
  return (
    <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "8px" }}>
      {columns.map(col => {
        const items = orders.filter(o => o.status === col);
        const c = STATUS_COLORS[col];
        return (
          <div key={col} style={{ flex: "0 0 260px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "calc(100vh - 260px)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 6px 4px", borderBottom: `2px solid ${c.fg}22` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.fg }} />
                <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#171717" }}>{col}</span>
              </div>
              <span style={{ padding: "1px 7px", background: c.bg, color: c.fg, borderRadius: "999px", fontSize: "10.5px", fontWeight: 700 }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
              {items.length === 0 ? (
                <div style={{ padding: "16px 8px", textAlign: "center", color: "#bbb", fontSize: "11px", fontStyle: "italic" }}>Empty</div>
              ) : items.map(o => (
                <KanbanCard key={o.refId} order={o} onClick={() => onCardClick(o.refId)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const overdue = order.dueOverdue;
  return (
    <div onClick={onClick} style={{
      background: "var(--preview-surface)",
      border: `1px solid ${overdue ? "#dc2626" : "var(--preview-border)"}`,
      borderLeft: `3px solid ${overdue ? "#dc2626" : order.priority === "Rush" ? "#f59e0b" : order.priority === "High" ? "#dc2626" : "#22c55e"}`,
      borderRadius: "8px",
      padding: "10px 12px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "var(--preview-text)" }}>ORD-{order.refId}</span>
        <span
          title={`Priority: ${order.priority}${order.priority === "Rush" ? " — top priority" : order.priority === "High" ? " — above normal" : " — normal turnaround"}`}
          style={{ fontSize: "10px", fontWeight: 700, color: order.priority === "Rush" ? "#f59e0b" : order.priority === "High" ? "#dc2626" : "#22c55e", cursor: "help", padding: "1px 6px", background: order.priority === "Rush" ? "rgba(245,158,11,0.12)" : order.priority === "High" ? "rgba(220,38,38,0.12)" : "rgba(34,197,94,0.12)", borderRadius: "999px" }}
        >⚑ {order.priority}</span>
      </div>
      <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--preview-text)", lineHeight: 1.3 }}>{order.contact}</div>
      {order.company && <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{order.company}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
        <span style={{ fontSize: "13px", fontWeight: 800, color: "#16a34a" }}>{fmtMoney(order.total)}</span>
        {order.dueDate ? (
          <span style={{ fontSize: "10.5px", color: overdue ? "#dc2626" : "var(--preview-text-muted)", fontWeight: overdue ? 700 : 500 }}>
            {overdue ? "⚠ " : "📅 "}{order.dueDate}
          </span>
        ) : <span style={{ fontSize: "10.5px", color: "var(--preview-text-faint)" }}>—</span>}
      </div>
      {overdue && (() => {
        const d = daysPastDue(order.dueDate);
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", marginTop: "2px", padding: "2px 7px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "999px", fontSize: "10px", color: "#dc2626", fontWeight: 700, alignSelf: "flex-start" }}
            title={`Due date passed ${d} day${d === 1 ? "" : "s"} ago`}
          >⚠ {d} {d === 1 ? "day" : "days"} late</div>
        );
      })()}
      {order.paymentOverdue && order.paymentDueDate && (() => {
        const d = daysPastDue(order.paymentDueDate);
        if (d <= 0) return null;
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", marginTop: "2px", padding: "2px 7px", background: "rgba(185,28,28,0.12)", border: "1px solid rgba(185,28,28,0.3)", borderRadius: "999px", fontSize: "10px", color: "#b91c1c", fontWeight: 700, alignSelf: "flex-start" }}
            title={`${order.paymentTerms || "Payment"} due ${order.paymentDueDate} — ${d} day${d === 1 ? "" : "s"} past due · balance ${fmtMoney(order.balanceDue)}`}
          >💸 Payment {d} {d === 1 ? "day" : "days"} late</div>
        );
      })()}
      {order.attachmentsCount > 0 && (
        <div style={{ fontSize: "10px", color: "#3b82f6", fontWeight: 600, marginTop: "2px" }}>📎 {order.attachmentsCount}</div>
      )}
    </div>
  );
}

// ─── Order Detail (full page takeover) ────────────────────────────────────────
function OrderDetail({ order, boardStages, onBack, onViewCustomerOrders }: { order: Order; boardStages: BoardStage[]; onBack: () => void; onViewCustomerOrders: (query: string) => void }) {
  const [status, setStatus] = useState<string>(order.stageName ?? order.status);
  const [priority, setPriority] = useState(order.priority);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [moreTab, setMoreTab] = useState<"quotes" | "activity" | "files">("quotes");

  // Real workflow statuses come straight from the live production board columns.
  const WORKFLOW_STATUSES = boardStages.map(s => s.name).filter(Boolean);
  const statusOptions = WORKFLOW_STATUSES.length ? WORKFLOW_STATUSES : [order.status];

  // Per-item people rosters (real): account managers + production stations.
  const ACCOUNT_MANAGERS = ["Marianna", "Gary", "Ernesto", "Manny"];
  const prodFromBoard = boardStages.map(s => s.name).filter(n => ["Arsen", "Hrach", "Production", "Apparel"].includes(n));
  const PRODUCTION_OWNERS = prodFromBoard.length ? prodFromBoard : ["Arsen", "Hrach", "Production", "Apparel"];

  const timeline: TimelineEvent[] = order.timeline
    ? order.timeline.map(t => ({ icon: t.icon, tint: t.tint, title: t.title, sub: t.sub, at: t.at, ref: t.ref })).reverse()
    : buildTimeline(order);

  const payPill = PAY_COLORS[order.payment];

  return (
    <div>
      {/* Top bar — Send to Workflow removed */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#666", fontSize: "13px", cursor: "pointer", fontWeight: 500 }}>← Back to Orders</button>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ ...CONTROL, fontWeight: 600 }}>📄 View Source Quote ({order.quoteRefId})</button>
          <button style={{ ...CONTROL, fontWeight: 600 }}>✎ Edit Order</button>
          <button style={{ ...CONTROL, padding: "0 12px" }}>⋯</button>
        </div>
      </div>

      {/* ONE combined header — identity + customer + meta + total, all in a single card */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "18px 22px", marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, fontFamily: "monospace" }}>ORD-{order.refId}</h1>
              <button style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "13px", padding: "2px 4px" }} title="Copy full ID">⧉</button>
              <button style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: "13px", padding: "2px 4px" }} title="Print order">🖨</button>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: "999px", fontSize: "11px", fontWeight: 800, fontFamily: "monospace" }}
                title={`Same number rides on the quote, production card, invoice, and shipping. Never re-invented.`}
              >🔒 Passport: {passportCore(order.refId)}</span>
            </div>
            {/* Clickable customer → popup with contact + all-orders */}
            <div style={{ fontSize: "14px", color: "var(--preview-text)", marginTop: "6px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button onClick={() => setShowCustomer(true)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: "15px", fontWeight: 800, color: ACCENT, textDecoration: "underline", textUnderlineOffset: "2px" }} title="View customer contact & all their orders">
                {order.contact}
              </button>
              {order.company && order.company !== order.contact && <span style={{ color: "#888" }}>· {order.company}</span>}
              {order.customer?.returning
                ? <span style={{ padding: "2px 8px", background: "#dcfce7", color: "#166534", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px" }}>Returning · {order.customer.lifetimeOrders} orders</span>
                : <span style={{ padding: "2px 8px", background: "#e0e7ff", color: "#4338ca", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px" }}>New customer</span>}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Order Total</div>
            <div style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "-0.5px" }}>{fmtMoney(order.total)}</div>
            <div style={{ fontSize: "11.5px", marginTop: "2px", color: "#16a34a", fontWeight: 700 }}>
              Received {fmtMoney(order.received)}
              {order.balanceDue > 0 && <span style={{ color: "#dc2626", marginLeft: "8px" }}>· Balance {fmtMoney(order.balanceDue)}</span>}
            </div>
          </div>
        </div>

        {/* Inline meta row (was a separate strip) — no Fulfillment */}
        <div style={{ display: "flex", gap: "26px", alignItems: "center", flexWrap: "wrap", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--preview-border)" }}>
          <MetaInline icon="👤" label="Created by">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontWeight: 700 }}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "9px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.ownerAvatar}</span>
              {order.createdBy}
            </span>
          </MetaInline>
          <MetaInline icon="📅" label="Created">{order.createdDate} <span style={{ color: "#888", fontWeight: 500 }}>· {order.createdAgo}</span></MetaInline>
          <MetaInline icon="📅" label="Due">
            <span style={{ fontWeight: 700, color: order.dueOverdue ? "#dc2626" : "var(--preview-text)" }}>{order.dueDate || "—"}</span>
            {order.dueOverdue && (() => { const d = daysPastDue(order.dueDate); return <span style={{ marginLeft: "6px", color: "#dc2626", fontWeight: 700, fontSize: "11px" }}>⚠ {d}d late</span>; })()}
          </MetaInline>
          <MetaInline icon="🚩" label="Priority">
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} style={{ padding: "4px 8px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
              <option>Normal</option><option>High</option><option>Rush</option><option>Low</option>
            </select>
          </MetaInline>
          <MetaInline icon="⚙" label="Status">
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: "4px 8px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", maxWidth: "180px" }}>
              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </MetaInline>
        </div>
      </div>

      {/* Payment strip — up top, buttons right here */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "14px 20px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>💰</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: "#888", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>Payment</span>
              <span style={{ padding: "2px 9px", background: payPill.bg, color: payPill.fg, fontSize: "11px", fontWeight: 800, borderRadius: "5px" }}>{order.payment}</span>
            </div>
            <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "3px" }}>
              {fmtMoney(order.received)} received of {fmtMoney(order.total)}
              {order.balanceDue > 0 && <span style={{ color: "#dc2626" }}> · {fmtMoney(order.balanceDue)} balance due</span>}
              {order.balanceDue === 0 && <span style={{ color: "#16a34a" }}> · paid in full</span>}
            </div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          {order.balanceDue > 0 && (
            <button style={{ padding: "9px 16px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>＋ Make a payment</button>
          )}
          <button style={{ padding: "9px 16px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>✉ Send payment request</button>
          <button style={{ padding: "9px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>📄 Receipt</button>
        </div>
      </div>

      {/* Body: LEFT main (line items + communication) | RIGHT rail (workflow + actions) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "14px", marginBottom: "14px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
          <LineItemsSection order={order} accountManagers={ACCOUNT_MANAGERS} productionOwners={PRODUCTION_OWNERS} />
          <CommunicationSection order={order} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <WorkflowProgressCard order={order} boardStages={boardStages} />
          <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
            <div style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <ActionButton bg="#0a0a0a" fg="#fff">✓ Mark as Completed</ActionButton>
              <ActionButton bg="#fff" fg="#333" border="#e5e5e5">🔗 Resend Link to Customer</ActionButton>
              <ActionButton bg="#fef3c7" fg="#78350f" border="#fde68a">↩ Refund Payment</ActionButton>
              <ActionButton bg="#fee2e2" fg="#dc2626" border="#fecaca">✕ Cancel Order</ActionButton>
            </div>
          </div>
        </div>
      </div>

      {/* Lower — collapsible Quote History / Activity / Files (secondary info) */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", marginBottom: "14px", overflow: "hidden" }}>
        <button onClick={() => setShowMore(v => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: "transparent", border: "none", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, color: "var(--preview-text)" }}>
          <span>Quote history · activity timeline · files</span>
          <span style={{ color: "#888" }}>{showMore ? "▲ Hide" : "▼ Show"}</span>
        </button>
        {showMore && (
          <div style={{ borderTop: "1px solid var(--preview-border)" }}>
            <div style={{ display: "flex", gap: "20px", padding: "0 20px", borderBottom: "1px solid var(--preview-border)" }}>
              {([["quotes", `Quote History (${order.quoteHistory?.length ?? 0})`], ["activity", `Activity Timeline (${timeline.length})`], ["files", `Files (${order.attachmentsCount})`]] as const).map(([k, lbl]) => {
                const active = moreTab === k;
                return <button key={k} onClick={() => setMoreTab(k)} style={{ background: "transparent", border: "none", padding: "12px 4px", marginBottom: "-1px", borderBottom: active ? `2px solid ${ACCENT}` : "2px solid transparent", color: active ? "var(--preview-text)" : "#666", fontSize: "12.5px", fontWeight: active ? 700 : 500, cursor: "pointer" }}>{lbl}</button>;
              })}
            </div>
            <div style={{ padding: "18px 20px" }}>
              {moreTab === "quotes" && <QuoteHistoryTab order={order} />}
              {moreTab === "activity" && <ActivityTab events={timeline} />}
              {moreTab === "files" && <FilesTab order={order} />}
            </div>
          </div>
        )}
      </div>

      {showCustomer && <CustomerPopup order={order} onClose={() => setShowCustomer(false)} onViewAllOrders={() => { setShowCustomer(false); onViewCustomerOrders(order.company || order.contact); }} />}
    </div>
  );
}

// Inline meta item for the combined header row.
function MetaInline({ icon, label, children }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "9.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <div style={{ fontSize: "12.5px" }}>{children}</div>
    </div>
  );
}

// ─── Line items — each SKU with its image, files, and people assignment ───
function LineItemsSection({ order, accountManagers, productionOwners }: { order: Order; accountManagers: string[]; productionOwners: string[] }) {
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>LINE ITEMS ({order.lineItems.length})</div>
        <button style={{ padding: "5px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>+ Upload File</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {order.lineItems.map((l, i) => (
          <LineItemCard key={l.id} line={l} index={i} accountManagers={accountManagers} productionOwners={productionOwners} />
        ))}
      </div>

      {/* Production notes */}
      <div style={{ marginTop: "16px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.04em", marginBottom: "6px", color: "#666" }}>📝 PRODUCTION NOTES</div>
        <textarea defaultValue={order.productionNotes || ""} placeholder="Notes visible to production team..." style={{ width: "100%", minHeight: "56px", padding: "10px 12px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", background: "var(--preview-surface)", color: "var(--preview-text)" }} />
      </div>
    </div>
  );
}

function LineItemCard({ line, index, accountManagers, productionOwners }: { line: OrderLineItem; index: number; accountManagers: string[]; productionOwners: string[] }) {
  const [am, setAm] = useState(line.accountManager ?? "");
  const [prod, setProd] = useState(line.productionOwner ?? "");
  const files = line.files ?? [];
  return (
    <div style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 16px" }}>
      <div style={{ display: "flex", gap: "14px" }}>
        <LineThumb src={line.thumbnailUrl} alt={line.productName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>SKU {index + 1}</div>
              <div style={{ fontSize: "15px", fontWeight: 800, marginTop: "1px" }}>{line.productName}{line.materialName && <span style={{ fontSize: "12px", color: "#888", fontWeight: 500 }}> · {line.materialName}</span>}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#16a34a" }}>{fmtMoney(line.extended)}</div>
              <div style={{ fontSize: "10.5px", color: "#888" }}>{line.quantity.toLocaleString()} × {fmtMoney(line.unitPrice)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
            {line.widthIn && line.heightIn && <Pill>Size: {line.widthIn}" × {line.heightIn}"</Pill>}
            {line.sides && <Pill>Sides: {line.sides === "S1" ? "Single" : "Double"}</Pill>}
            {line.colorMode && <Pill>Color: {line.colorMode}</Pill>}
            {(line.specs ?? []).map(s => <Pill key={s.label}>{s.label}: {s.value}</Pill>)}
            {(line.finishingLabels ?? []).map(f => <Pill key={f} tone="amber">{f}</Pill>)}
            {(line.specialEffectLabels ?? []).map(e => <Pill key={e} tone="purple">{e}</Pill>)}
          </div>
        </div>
      </div>

      {/* Files for THIS item */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
        {files.length === 0 ? (
          <span style={{ fontSize: "11px", color: "#aaa" }}>No files on this item yet</span>
        ) : files.map((f, k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", fontSize: "11px", fontWeight: 600, borderRadius: "6px" }}>
            {f.kind === "img" ? "🖼️" : "📎"} {f.name}
          </span>
        ))}
      </div>

      {/* People assigned to THIS item */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--preview-border)" }}>
        <PersonSelect icon="🎨" label="Account Manager" value={am} onChange={setAm} options={accountManagers} />
        <PersonSelect icon="🏭" label="Production / Design" value={prod} onChange={setProd} options={productionOwners} />
      </div>
    </div>
  );
}

function PersonSelect({ icon, label, value, onChange, options }: { icon: string; label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <span style={{ fontSize: "9.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{icon} {label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: "5px 8px", background: "var(--preview-surface)", border: `1px solid ${value ? "var(--preview-border)" : "#fca5a5"}`, borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", color: "var(--preview-text)", minWidth: "150px" }}>
        <option value="">— Unassigned —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// Per-line artwork thumbnail (bigger than the row thumb).
function LineThumb({ src, alt }: { src?: string; alt?: string }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = { width: "72px", height: "72px", flexShrink: 0, borderRadius: "10px", border: "1px solid var(--preview-border)", overflow: "hidden", background: "var(--preview-surface)", display: "flex", alignItems: "center", justifyContent: "center" };
  if (!src || broken) return <div style={box} title="No proof uploaded yet"><span style={{ fontSize: "22px", opacity: 0.4 }}>🖼️</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt || "proof"} onError={() => setBroken(true)} style={{ ...box, objectFit: "cover" }} />;
}

// ─── Communication — full per-order history + send/update actions ───
function CommunicationSection({ order }: { order: Order }) {
  const comms = order.communications ?? [];
  const iconFor = (c: CommEntry["channel"]) => {
    switch (c) {
      case "email_in": return { icon: "✉", tint: "#3b82f6", label: "Email in" };
      case "email_out": return { icon: "✉", tint: "#22c55e", label: "Email out" };
      case "call_in": return { icon: "📞", tint: "#3b82f6", label: "Call in" };
      case "call_out": return { icon: "📞", tint: "#22c55e", label: "Call out" };
      case "sms_in": return { icon: "💬", tint: "#3b82f6", label: "Text in" };
      case "sms_out": return { icon: "💬", tint: "#22c55e", label: "Text out" };
      case "ig_in": return { icon: "📷", tint: "#e11d48", label: "IG DM in" };
      case "ig_out": return { icon: "📷", tint: "#e11d48", label: "IG DM out" };
      case "note": return { icon: "📝", tint: "#78350f", label: "Internal note" };
      default: return { icon: "•", tint: "#64748b", label: "Update" };
    }
  };
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>💬 COMMUNICATION</div>
        <span style={{ fontSize: "10.5px", color: "#888" }}>Calls · texts · email — synced with JustCall</span>
      </div>

      {/* Composer: reach the customer + push an update, right here */}
      <div style={{ border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "12px", marginBottom: "14px", background: "var(--preview-surface-2)" }}>
        <textarea placeholder={`Message ${order.contact}…`} style={{ width: "100%", minHeight: "48px", padding: "8px 10px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", background: "var(--preview-surface)", color: "var(--preview-text)" }} />
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px", alignItems: "center" }}>
          <button style={{ padding: "6px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>✉ Send email</button>
          <button style={{ padding: "6px 12px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "7px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>💬 Send text</button>
          <span style={{ width: "1px", height: "20px", background: "var(--preview-border)", margin: "0 2px" }} />
          <span style={{ fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase" }}>Quick update:</span>
          <button style={quickUpdateBtn}>📄 Send proof</button>
          <button style={quickUpdateBtn}>✅ Ready to ship</button>
          <button style={quickUpdateBtn}>💰 Request payment</button>
        </div>
      </div>

      {/* History */}
      {comms.length === 0 ? (
        <div style={{ padding: "20px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "12px", border: "1px dashed var(--preview-border)", borderRadius: "8px" }}>
          No messages logged for this order yet. Calls, texts and emails will thread here once JustCall + email are connected.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {comms.map((c, i) => {
            const meta = iconFor(c.channel);
            return (
              <div key={i} style={{ padding: "12px 14px", background: c.channel === "note" ? "#fffbeb" : "var(--preview-surface-2)", border: `1px solid ${c.channel === "note" ? "#fde68a" : "var(--preview-border)"}`, borderRadius: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: meta.tint + "22", color: meta.tint, fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{meta.icon}</span>
                    <span style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</span>
                    <span style={{ fontSize: "12px", fontWeight: 700 }}>· {c.author}</span>
                  </div>
                  <span style={{ fontSize: "10.5px", color: "#888" }}>{c.at}</span>
                </div>
                {c.subject && <div style={{ fontSize: "12.5px", fontWeight: 700, marginBottom: "3px" }}>{c.subject}</div>}
                <div style={{ fontSize: "12px", color: "var(--preview-text)", lineHeight: 1.5 }}>{c.body}</div>
                {c.attachments && c.attachments.length > 0 && (
                  <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "6px" }}>
                    {c.attachments.map(a => <span key={a} style={{ padding: "2px 8px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", fontSize: "10.5px", fontWeight: 600, borderRadius: "5px" }}>📎 {a}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const quickUpdateBtn: React.CSSProperties = { padding: "6px 10px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "7px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", color: "var(--preview-text)" };

// ─── Customer popup — contact + jump to all their orders ───
function CustomerPopup({ order, onClose, onViewAllOrders }: { order: Order; onClose: () => void; onViewAllOrders: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "16px", padding: "22px 24px", width: "380px", maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "46px", height: "46px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "15px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.contact.slice(0, 2).toUpperCase()}</div>
            <div>
              <div style={{ fontSize: "17px", fontWeight: 800 }}>{order.contact}</div>
              {order.company && <div style={{ fontSize: "12px", color: "#888" }}>{order.company}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: "18px", color: "#888", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span>📞</span> {order.customer?.phone || "—"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><span>✉</span> {order.customer?.email || "—"}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "12px", background: "var(--preview-surface-2)", borderRadius: "10px", marginBottom: "16px" }}>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Lifetime spend</div><div style={{ fontSize: "15px", fontWeight: 800 }}>${(order.customer?.lifetimeValue ?? 0).toLocaleString()}</div></div>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Total orders</div><div style={{ fontSize: "15px", fontWeight: 800 }}>{order.customer?.lifetimeOrders ?? 0}</div></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button onClick={onViewAllOrders} style={{ padding: "10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "9px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>📋 Show all of {order.contact}'s orders</button>
          <button onClick={onClose} style={{ padding: "9px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "9px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", color: "var(--preview-text)" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function MetaCell({ icon, label, children }: any) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div style={{ fontSize: "12.5px" }}>{children}</div>
    </div>
  );
}

// ─── Left: Customer sidebar ────────────────────────────────
function CustomerSidebar({ order }: { order: Order }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", position: "sticky", top: "16px", height: "fit-content" }}>
      {/* Customer card */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <span style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer</span>
          <button style={{ padding: "3px 10px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "10.5px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "12px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.contact.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 800 }}>{order.contact}</div>
            {order.company && <div style={{ fontSize: "11.5px", color: "#888" }}>{order.company}</div>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11.5px", color: "#666", marginBottom: "12px" }}>
          <div>📞 {order.customer?.phone || "—"}</div>
          <div>✉ {order.customer?.email || "—"}</div>
          <div>📍 {[order.customer?.city, order.customer?.state].filter(Boolean).join(", ") || "—"}</div>
        </div>
        <span style={{ display: "inline-block", padding: "2px 8px", background: order.customer?.returning ? "#dcfce7" : "#e0e7ff", color: order.customer?.returning ? "#166534" : "#4338ca", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px", marginBottom: "12px" }}>{order.customer?.returning ? "Returning Customer" : "New Customer"}</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", padding: "10px", background: "var(--preview-surface-2)", borderRadius: "8px" }}>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Lifetime</div><div style={{ fontSize: "12px", fontWeight: 800 }}>${(order.customer?.lifetimeValue ?? 0).toLocaleString()}</div></div>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Orders</div><div style={{ fontSize: "12px", fontWeight: 800 }}>{order.customer?.lifetimeOrders ?? 0}</div></div>
          <div><div style={{ fontSize: "9.5px", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>Terms</div><div style={{ fontSize: "12px", fontWeight: 800 }}>{order.paymentTerms || order.customer?.terms || "—"}</div></div>
        </div>
      </div>

      {/* Actions block */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
        <div style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>Actions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <ActionButton bg="#0a0a0a" fg="#fff">✓ Mark as Completed</ActionButton>
          <ActionButton bg="#fef3c7" fg="#78350f" border="#fde68a">↩ Refund Payment</ActionButton>
          <ActionButton bg="#fee2e2" fg="#dc2626" border="#fecaca">✕ Cancel Order</ActionButton>
          <ActionButton bg="#fff" fg="#333" border="#e5e5e5">🔗 Resend Link to Customer</ActionButton>
        </div>
      </div>

      {/* Help card */}
      <div style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "10px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.ownerAvatar}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", fontWeight: 700 }}>Need help with this order?</div>
          <div style={{ fontSize: "10.5px", color: "#888" }}>Contact your account manager</div>
        </div>
        <button style={{ padding: "5px 10px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "10.5px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>💬 Message</button>
      </div>
    </div>
  );
}

function ActionButton({ bg, fg, border, children }: any) {
  return (
    <button style={{
      padding: "9px 12px",
      background: bg,
      color: fg,
      border: border ? `1px solid ${border}` : "none",
      borderRadius: "8px",
      fontSize: "12.5px",
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "left",
    }}>{children}</button>
  );
}

// ─── Middle: Tab content ─────────────────────────────────
function OverviewTab({ order, showEngIds, setShowEngIds }: { order: Order; showEngIds: boolean; setShowEngIds: (v: boolean) => void }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>LINE ITEMS ({order.lineItems.length})</div>
        <label style={{ fontSize: "10.5px", color: "#888", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
          <input type="checkbox" checked={showEngIds} onChange={e => setShowEngIds(e.target.checked)} /> Show catalog IDs (dev)
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
        {order.lineItems.map((l, i) => (
          <div key={l.id} style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <div style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>LINE {i + 1}{l.productCategory ? ` · ${l.productCategory}` : ""}</div>
                <div style={{ fontSize: "15px", fontWeight: 800, marginTop: "2px" }}>{l.productName}</div>
                {l.materialName && <div style={{ fontSize: "12px", color: "#666" }}>{l.materialName}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#16a34a" }}>{fmtMoney(l.extended)}</div>
                <div style={{ fontSize: "10.5px", color: "#888" }}>{l.quantity.toLocaleString()} × {fmtMoney(l.unitPrice)}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {l.widthIn && l.heightIn && <Pill>Size: {l.widthIn}" × {l.heightIn}"</Pill>}
              {l.sides && <Pill>Sides: {l.sides === "S1" ? "Single" : "Double"}</Pill>}
              {l.colorMode && <Pill>Color: {l.colorMode}</Pill>}
              {(l.specs ?? []).map(s => <Pill key={s.label}>{s.label}: {s.value}</Pill>)}
              {(l.finishingLabels ?? []).map(f => <Pill key={f} tone="amber">{f}</Pill>)}
              {(l.specialEffectLabels ?? []).map(e => <Pill key={e} tone="purple">{e}</Pill>)}
            </div>
            {l.comment && <div style={{ marginTop: "8px", padding: "6px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "11.5px", color: "#78350f" }}>💬 {l.comment}</div>}
          </div>
        ))}
      </div>

      {/* Production notes */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", marginBottom: "8px" }}>📝 PRODUCTION NOTES</div>
        <textarea defaultValue={order.productionNotes || ""} placeholder="Notes visible to production team..." style={{ width: "100%", minHeight: "70px", padding: "10px 12px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
      </div>

      {/* Attachments */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>📎 ATTACHMENTS ({order.attachmentsCount})</div>
          <button style={{ padding: "4px 10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>+ Upload File</button>
        </div>
        {order.attachmentsCount === 0 ? (
          <div style={{ padding: "14px", textAlign: "center", color: "#aaa", fontSize: "12px", border: "1px dashed #ddd", borderRadius: "6px" }}>No attachments</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
            {(order.files ?? order.attachments.map(name => ({ name, sizeKB: 480, kind: (name.endsWith(".ai") ? "ai" : name.endsWith(".jpg") ? "jpg" : name.endsWith(".png") ? "png" : name.endsWith(".dxf") ? "dxf" : "pdf") as Attachment["kind"] }))).map((f, i) => {
              const tintBg = f.kind === "pdf" ? "#fee2e2" : f.kind === "ai" ? "#fef3c7" : f.kind === "dxf" ? "#e0e7ff" : "#dbeafe";
              const tintFg = f.kind === "pdf" ? "#dc2626" : f.kind === "ai" ? "#a16207" : f.kind === "dxf" ? "#4338ca" : "#1e40af";
              const sizeLabel = f.sizeKB >= 1024 ? `${(f.sizeKB / 1024).toFixed(1)} MB` : `${f.sizeKB} KB`;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
                  <div style={{ width: "36px", height: "36px", background: tintBg, color: tintFg, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800 }}>{f.kind.toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                    <div style={{ fontSize: "10.5px", color: "#888" }}>{f.kind.toUpperCase()} · {sizeLabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function ActivityTab({ events }: { events: TimelineEvent[] }) {
  return (
    <div style={{ position: "relative", paddingLeft: "10px" }}>
      <div style={{ position: "absolute", left: "24px", top: "10px", bottom: "10px", width: "2px", background: "#f0f0f0" }} />
      {events.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: "14px", padding: "10px 0", position: "relative", zIndex: 1 }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: e.tint + "22", color: e.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, border: "2px solid #fff" }}>{e.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700 }}>{e.title}</span>
              <span style={{ fontSize: "10.5px", color: "#888" }}>{e.at}</span>
            </div>
            {e.sub && <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>{e.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuoteHistoryTab({ order }: { order: Order }) {
  const quotes = order.quoteHistory ?? (order.quote ? [order.quote] : []);
  if (quotes.length === 0) {
    return <div style={{ padding: "20px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "12.5px" }}>No linked quote on record for this order.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {quotes.map((v, i) => (
        <div key={v.ref} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: i === 0 ? "#fff7ed" : "var(--preview-surface-2)", border: `1px solid ${i === 0 ? ACCENT + "33" : "#eee"}`, borderRadius: "8px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700, color: ACCENT }}>{v.ref}</span>
              <span style={{ fontSize: "11.5px", color: "#666", fontWeight: 700, textTransform: "capitalize" }}>{v.status}</span>
            </div>
            <div style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}>{v.date} · by {order.createdBy}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "14px", fontWeight: 800 }}>{fmtMoney(v.total)}</div>
            <button style={{ marginTop: "3px", padding: "3px 8px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "5px", fontSize: "10.5px", fontWeight: 600, cursor: "pointer" }}>View</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilesTab({ order }: { order: Order }) {
  const richFiles: Attachment[] = order.files ?? [];
  if (richFiles.length === 0) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>0 FILES</div>
          <button style={{ padding: "5px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>+ Upload File</button>
        </div>
        <div style={{ padding: "24px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "12.5px", border: "1px dashed var(--preview-border)", borderRadius: "8px" }}>
          No files uploaded for this order yet.
        </div>
        <div style={{ marginTop: "10px", fontSize: "10.5px", color: "#888", fontStyle: "italic" }}>
          Recommended filename convention: {"{clean-name}"}-{passportCore(order.refId)}.{"{ext}"} — makes files searchable by passport number across the shop.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>{richFiles.length} FILE{richFiles.length !== 1 ? "S" : ""}</div>
        <button style={{ padding: "5px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>+ Upload File</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
        {richFiles.map((f, i) => (
          <div key={i} style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", overflow: "hidden", cursor: "pointer" }}>
            <div style={{ aspectRatio: "16/10", background: f.kind === "pdf" ? "linear-gradient(135deg, #dc2626, #f97316)" : f.kind === "ai" ? "linear-gradient(135deg, #f97316, #eab308)" : "linear-gradient(135deg, #3b82f6, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "16px", fontWeight: 800 }}>
              {f.kind.toUpperCase()}
            </div>
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: "11.5px", fontWeight: 700 }}>{f.name}</div>
              <div style={{ fontSize: "10px", color: "#888" }}>{f.kind.toUpperCase()} · {f.sizeKB >= 1024 ? (f.sizeKB / 1024).toFixed(1) + " MB" : f.sizeKB + " KB"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Communications tab — email / call / SMS / IG / note log ───
function CommsTab({ order }: { order: Order }) {
  const comms = order.communications ?? [];
  if (comms.length === 0) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "12.5px", border: "1px dashed var(--preview-border)", borderRadius: "8px" }}>
        No customer communications recorded yet — this connects when the comm hub is wired.
      </div>
    );
  }
  const iconFor = (c: CommEntry["channel"]) => {
    switch (c) {
      case "email_in": return { icon: "✉", tint: "#3b82f6", label: "Email in" };
      case "email_out": return { icon: "✉", tint: "#22c55e", label: "Email out" };
      case "call_in": return { icon: "📞", tint: "#3b82f6", label: "Call in" };
      case "call_out": return { icon: "📞", tint: "#22c55e", label: "Call out" };
      case "sms_in": return { icon: "💬", tint: "#3b82f6", label: "SMS in" };
      case "sms_out": return { icon: "💬", tint: "#22c55e", label: "SMS out" };
      case "ig_in": return { icon: "📷", tint: "#e11d48", label: "IG DM in" };
      case "ig_out": return { icon: "📷", tint: "#e11d48", label: "IG DM out" };
      case "note": return { icon: "📝", tint: "#78350f", label: "Internal note" };
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {comms.map((c, i) => {
        const meta = iconFor(c.channel);
        return (
          <div key={i} style={{ padding: "12px 14px", background: c.channel === "note" ? "#fffbeb" : "var(--preview-surface-2)", border: `1px solid ${c.channel === "note" ? "#fde68a" : "var(--preview-border)"}`, borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: meta.tint + "22", color: meta.tint, fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{meta.icon}</span>
                <span style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</span>
                <span style={{ fontSize: "12px", fontWeight: 700 }}>· {c.author}</span>
              </div>
              <span style={{ fontSize: "10.5px", color: "#888" }}>{c.at}</span>
            </div>
            {c.subject && <div style={{ fontSize: "12.5px", fontWeight: 700, marginBottom: "3px" }}>{c.subject}</div>}
            <div style={{ fontSize: "12px", color: "#333", lineHeight: 1.5 }}>{c.body}</div>
            {c.attachments && c.attachments.length > 0 && (
              <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "6px" }}>
                {c.attachments.map(a => (
                  <span key={a} style={{ padding: "2px 8px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", fontSize: "10.5px", fontWeight: 600, borderRadius: "5px" }}>📎 {a}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button style={{ marginTop: "6px", padding: "8px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>+ Log new communication</button>
    </div>
  );
}

function PaymentsTab({ order }: { order: Order }) {
  const payments = order.payments ?? [];
  if (payments.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#dc2626" }}>Awaiting payment — {fmtMoney(order.balanceDue)}</div>
          <div style={{ fontSize: "11px", color: "#dc2626" }}>No payments recorded yet.</div>
        </div>
        <button style={{ padding: "10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>+ Record Payment</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {payments.map((p, i) => (
        <div key={i} style={{ padding: "12px 16px", background: p.amount < 0 ? "#fef3c7" : "var(--preview-surface-2)", border: `1px solid ${p.amount < 0 ? "#fde68a" : "var(--preview-border)"}`, borderRadius: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 800 }}>
                {p.amount < 0 ? "Refund" : `Payment #${i + 1}`} — {fmtMoney(Math.abs(p.amount))}
              </div>
              <div style={{ fontSize: "11px", color: "#888" }}>{p.date} · {p.method} · {p.ref}</div>
            </div>
            <div style={{ padding: "3px 8px", background: p.status === "Completed" ? "#dcfce7" : p.status === "Pending Clearance" ? "#fef3c7" : "#fee2e2", color: p.status === "Completed" ? "#166534" : p.status === "Pending Clearance" ? "#78350f" : "#dc2626", fontSize: "11px", fontWeight: 700, borderRadius: "5px" }}>{p.status}</div>
          </div>
        </div>
      ))}
      {order.balanceDue > 0 && (
        <div style={{ padding: "12px 16px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#dc2626" }}>Balance Due — {fmtMoney(order.balanceDue)}</div>
          <div style={{ fontSize: "11px", color: "#dc2626" }}>Awaiting payment · terms {order.paymentTerms || "—"}</div>
        </div>
      )}
      <button style={{ padding: "10px", background: ACCENT, color: "#fff", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>+ Record Payment</button>
    </div>
  );
}

// ─── Right: Activity Timeline card (compact) ─────────────────
function ActivityTimelineCard({ events }: { events: TimelineEvent[] }) {
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Activity Timeline</div>
        <span style={{ fontSize: "11px", color: ACCENT, fontWeight: 700, cursor: "pointer" }}>View all</span>
      </div>
      <div style={{ position: "relative", paddingLeft: "6px" }}>
        <div style={{ position: "absolute", left: "20px", top: "10px", bottom: "10px", width: "2px", background: "#f0f0f0" }} />
        {events.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", padding: "6px 0", position: "relative", zIndex: 1 }}>
            <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: e.tint + "22", color: e.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0, border: "2px solid #fff" }}>{e.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10.5px", color: "#888" }}>{e.at}</div>
              <div style={{ fontSize: "12px", fontWeight: 700, marginTop: "1px" }}>{e.title}</div>
              {e.sub && <div style={{ fontSize: "10.5px", color: "#888", marginTop: "1px" }}>{e.sub}</div>}
            </div>
          </div>
        ))}
      </div>
      <button style={{ width: "100%", marginTop: "10px", padding: "6px 8px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>🕐 View Full Timeline</button>
    </div>
  );
}

// ─── Right: Workflow Progress card ─────────────────
// Real live board columns (position order) with the order's current stage
// highlighted. Rendered as a vertical list since real boards can carry many
// columns (this tenant has 12).
function WorkflowProgressCard({ order, boardStages }: { order: Order; boardStages: BoardStage[] }) {
  const currentIdx = typeof order.stageIndex === "number"
    ? order.stageIndex
    : boardStages.findIndex(s => s.name === order.stageName);
  const stages = boardStages.length ? boardStages : (order.stageName ? [{ name: order.stageName, kind: order.stageKind ?? null }] : []);
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 18px" }}>
      <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>Workflow Progress</div>
      {stages.length === 0 ? (
        <div style={{ fontSize: "12px", color: "var(--preview-text-muted)", marginBottom: "12px" }}>Not on the production board yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "14px" }}>
          {stages.map((s, i) => {
            const done = currentIdx >= 0 && i < currentIdx;
            const current = i === currentIdx;
            return (
              <div key={`${s.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "3px 0" }}>
                <div style={{
                  width: "20px", height: "20px", borderRadius: "50%",
                  background: done ? "#22c55e" : current ? ACCENT : "var(--preview-surface-2)",
                  color: done || current ? "#fff" : "var(--preview-text-muted)",
                  border: done || current ? "none" : "1px solid var(--preview-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "9px", fontWeight: 800, flexShrink: 0,
                }}>{done ? "✓" : current ? "●" : i + 1}</div>
                <span style={{ fontSize: "11.5px", color: current ? "var(--preview-text)" : done ? "var(--preview-text)" : "var(--preview-text-muted)", fontWeight: current ? 800 : 500 }}>{s.name}</span>
                {current && <span style={{ marginLeft: "auto", fontSize: "9.5px", fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.04em" }}>Current</span>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ paddingTop: "12px", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: order.ownerColor + "22", color: order.ownerColor, fontSize: "10px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{order.ownerAvatar}</div>
        <div>
          <div style={{ fontSize: "10.5px", color: "#888" }}>Created by</div>
          <div style={{ fontSize: "12.5px", fontWeight: 700 }}>{order.createdBy}</div>
        </div>
      </div>
      {order.lastActivityAt && <div style={{ fontSize: "10.5px", color: "#888", marginBottom: "10px" }}>Last update · {order.lastActivityAt}</div>}
      <button style={{ width: "100%", padding: "8px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>↗ Open in Workflow</button>
    </div>
  );
}

// ─── Financial Summary bar ─────────────────
function FinancialSummary({ order }: { order: Order }) {
  const paid = order.balanceDue === 0;
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "14px 22px", display: "flex", alignItems: "center", gap: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
        <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>💰 Financial Summary</div>
        <span style={{ padding: "2px 8px", background: paid ? "#dcfce7" : "#fef3c7", color: paid ? "#166534" : "#78350f", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px" }}>{paid ? "Paid in full" : "Partial"}</span>
      </div>
      <FinCell label="Amount Paid" value={fmtMoney(order.received)} />
      <FinCell label="Last Payment" value={order.payments && order.payments.length > 0 ? order.payments[order.payments.length - 1].date : "—"} />
      <FinCell label="Payment Method" value={order.payments && order.payments.length > 0 ? `${order.payments[order.payments.length - 1].method} · ${order.payments[order.payments.length - 1].ref}` : (order.balanceDue > 0 ? "Awaiting" : "—")} />
      <button style={{ padding: "8px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>📄 View Receipt</button>
    </div>
  );
}

function FinCell({ label, value }: any) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "12.5px", fontWeight: 700, marginTop: "2px" }}>{value}</div>
    </div>
  );
}

function QuickField({ icon, label, children }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
      <span style={{ fontSize: "13px" }}>{icon}</span>
      <span style={{ fontSize: "10px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Activity Timeline ────────────────────────────────
interface TimelineEvent { icon: string; tint: string; title: string; sub?: string; at: string; ref?: string }

function buildTimeline(order: Order): TimelineEvent[] {
  const paidPart = order.received > 0 && order.received < order.total;
  const paidFull = order.received >= order.total && order.total > 0;
  const now: TimelineEvent[] = [];

  // Quote lifecycle
  now.push({ icon: "📝", tint: "#f97316", title: "Quote drafted", sub: `${order.quoteRefId} by ${order.createdBy}`, at: "5d ago", ref: order.quoteRefId });
  now.push({ icon: "✉", tint: "#3b82f6", title: "Quote sent to customer", sub: `Email + SMS to ${order.contact}`, at: "5d ago" });
  now.push({ icon: "👁", tint: "#22c55e", title: "Customer viewed quote", sub: order.quoteRefId, at: "4d ago" });
  now.push({ icon: "✓", tint: "#16a34a", title: "Customer approved quote", sub: `${order.contact} accepted terms`, at: "3d ago" });

  // Payment
  if (paidFull) {
    now.push({ icon: "💵", tint: "#16a34a", title: "Payment received", sub: `${fmtMoney(order.total)} · full payment`, at: "3d ago" });
  } else if (paidPart) {
    now.push({ icon: "💵", tint: "#f59e0b", title: "Partial payment received", sub: `${fmtMoney(order.received)} of ${fmtMoney(order.total)} · balance ${fmtMoney(order.balanceDue)}`, at: "3d ago" });
  } else if (order.payment === "Tax Exempt") {
    now.push({ icon: "🧾", tint: "#4f46e5", title: "Tax-exempt approved", sub: "Reseller certificate on file", at: "3d ago" });
  } else if (order.payment === "Pending Tax Review") {
    now.push({ icon: "⏳", tint: "#a16207", title: "Awaiting tax review", sub: "Reseller certificate submitted, pending verification", at: "1d ago" });
  }

  // Order creation
  now.push({ icon: "📦", tint: "#8b5cf6", title: "Order created", sub: `ORD-${order.refId} · from ${order.quoteRefId}`, at: order.createdAgo, ref: `ORD-${order.refId}` });

  // Production events
  if (["In Production", "Ready to Ship", "Shipped", "Delivered"].includes(order.status)) {
    now.push({ icon: "🎯", tint: "#3b82f6", title: "Sent to Workflow", sub: `Job card #${order.refId} on production board`, at: "20h ago" });
    now.push({ icon: "🎨", tint: "#a78bfa", title: "Assigned to designer", sub: "Marianna", at: "18h ago" });
    now.push({ icon: "✏", tint: "#f59e0b", title: "Proof sent to customer", sub: "Awaiting sign-off", at: "12h ago" });
    now.push({ icon: "✓", tint: "#16a34a", title: "Proof approved", sub: `${order.contact} approved artwork`, at: "8h ago" });
    now.push({ icon: "🏭", tint: "#06b6d4", title: "In production", sub: "HP Indigo 6K · press operator: Arsen", at: "4h ago" });
  }
  if (["Ready to Ship", "Shipped", "Delivered"].includes(order.status)) {
    now.push({ icon: "📦", tint: "#f59e0b", title: "Ready to ship", sub: "QC passed · boxed", at: "2h ago" });
  }
  if (["Shipped", "Delivered"].includes(order.status)) {
    now.push({ icon: "🚚", tint: "#3b82f6", title: "Shipped", sub: order.trackingRef ? `Tracking ${order.trackingRef}` : "In transit", at: "1h ago" });
  }
  if (order.status === "Delivered") {
    now.push({ icon: "✓", tint: "#16a34a", title: "Delivered", sub: "Signed by customer", at: "just now" });
  }

  return now.reverse(); // newest first
}

function OrderTimeline({ events, order }: { events: TimelineEvent[]; order: Order }) {
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "14px", padding: "16px 20px", height: "fit-content" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em" }}>🕐 ORDER HISTORY</div>
        <span style={{ fontSize: "11px", color: "#888" }}>{events.length} events</span>
      </div>

      <div style={{ position: "relative", paddingLeft: "8px" }}>
        <div style={{ position: "absolute", left: "22px", top: "10px", bottom: "10px", width: "2px", background: "#f0f0f0" }} />
        {events.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: "12px", padding: "6px 0", position: "relative", zIndex: 1 }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: e.tint + "22", color: e.tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, border: "2px solid #fff" }}>{e.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{e.title}</span>
                <span style={{ fontSize: "10.5px", color: "#888", whiteSpace: "nowrap" }}>{e.at}</span>
              </div>
              {e.sub && <div style={{ fontSize: "11px", color: "#666", marginTop: "1px", lineHeight: 1.4 }}>
                {e.ref ? (
                  <>{e.sub.split(e.ref)[0]}<span style={{ color: ACCENT, fontWeight: 700, cursor: "pointer" }}>{e.ref}</span>{e.sub.split(e.ref)[1] || ""}</>
                ) : e.sub}
              </div>}
            </div>
          </div>
        ))}
      </div>

      {/* Comment / note composer */}
      <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #f0f0f0" }}>
        <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>+ Add Note</div>
        <textarea placeholder="Log something... visible to team." style={{ width: "100%", minHeight: "50px", padding: "8px 10px", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
          <button style={{ padding: "5px 12px", background: ACCENT, color: "#fff", border: "none", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>Add to timeline</button>
        </div>
      </div>
    </div>
  );
}

// Small product/proof thumbnail on each order row — mirrors the workflow board cards.
// Falls back to a clean tile when an order has no image yet (honest, not a broken img).
function OrderThumb({ src, alt }: { src?: string; alt?: string }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = {
    width: "44px", height: "44px", flexShrink: 0, borderRadius: "8px",
    border: "1px solid var(--preview-border)", overflow: "hidden",
    background: "var(--preview-surface-2)", display: "flex", alignItems: "center", justifyContent: "center",
  };
  if (!src || broken) {
    return <div style={box} title="No proof uploaded yet"><span style={{ fontSize: "16px", opacity: 0.5 }}>🖼️</span></div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt || "proof"} onError={() => setBroken(true)}
      style={{ ...box, objectFit: "cover" }} />
  );
}

function Meta({ label, children }: any) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: "3px" }}>{label}</div>
      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#171717" }}>{children}</div>
    </div>
  );
}

// ---- Multi-select dropdown primitives (used by Status + Quick-filter menus) ----

// Panel that floats under its trigger and closes on any outside click / Esc.
function MenuPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Delay binding so the opening click itself doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
      minWidth: "230px", background: "var(--preview-surface)",
      border: "1px solid var(--preview-border)", borderRadius: "10px",
      boxShadow: "0 8px 28px rgba(0,0,0,0.14)", padding: "6px", overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function MenuHeader({ title, onClear, clearLabel }: { title: string; onClear?: () => void; clearLabel: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px 8px", borderBottom: "1px solid var(--preview-border)", marginBottom: "4px" }}>
      <span style={{ fontSize: "10.5px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>
      {onClear && (
        <button onClick={onClear} style={{ background: "none", border: "none", color: "#888", fontSize: "11px", cursor: "pointer", textDecoration: "underline", padding: 0 }}>{clearLabel}</button>
      )}
    </div>
  );
}

function CheckRow({ on, label, count, tint, onClick }: { on: boolean; label: string; count?: number; tint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: "9px", width: "100%",
      padding: "7px 8px", background: on ? "var(--preview-surface-2)" : "transparent",
      border: "none", borderRadius: "6px", cursor: "pointer", textAlign: "left",
      fontSize: "12.5px", color: "var(--preview-text)", fontWeight: on ? 700 : 500,
    }}>
      <span style={{
        width: "16px", height: "16px", flexShrink: 0, borderRadius: "4px",
        border: `1.5px solid ${on ? (tint || GOLD) : "var(--preview-border)"}`,
        background: on ? (tint || GOLD) : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: "11px", fontWeight: 900,
      }}>{on ? "✓" : ""}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {typeof count === "number" && (
        <span style={{ padding: "1px 8px", background: "var(--preview-surface-2)", color: "#888", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>{count}</span>
      )}
    </button>
  );
}
