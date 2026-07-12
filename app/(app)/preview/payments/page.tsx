"use client";

// Hayk 2026-07-02 — Payments Manager preview for Arusyak (accountant view).
// KPIs / past-due / coming-due / ledger / terms approval queue.
// All numbers computed live from the ORDERS seed in ../orders/page.tsx.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ORDERS, fmtMoney, daysPastDue, type Order, type PaymentEntry } from "../orders/_shared";
import { usePreviewRole, canSee, PREVIEW_ROLE_LABELS } from "../_shared/role";

const ACCENT = "#FF5D2E";
const GOLD = "#fbbf24";

// Fixed "today" = 07/01/2026 (mirrors orders page).
const TODAY = new Date(2026, 6, 1);

// Parse MM/DD/YYYY → Date
function parseMDY(s?: string): Date | null {
  if (!s) return null;
  const [m, d, y] = s.split("/").map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}
function daysUntil(dt?: string): number | null {
  const d = parseMDY(dt);
  if (!d) return null;
  return Math.floor((d.getTime() - TODAY.getTime()) / 86400000);
}
function daysAgo(dt?: string): number | null {
  const d = parseMDY(dt);
  if (!d) return null;
  return Math.floor((TODAY.getTime() - d.getTime()) / 86400000);
}
function relTime(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// Channel icons for last comm
const CHANNEL_ICONS: Record<string, string> = {
  email_in: "✉", email_out: "✉",
  call_in: "📞", call_out: "📞",
  sms_in: "💬", sms_out: "💬",
  ig_in: "◈", ig_out: "◈",
  note: "📝",
};

interface TermsRequest {
  id: string;
  customer: string;
  rep: string;
  requestedTerms: string;
  requestedAt: string;
  justification: string;
  ltv?: number;
  orderCount?: number;
  status: "pending" | "approved" | "denied";
}

const TERMS_REQUEST_STORAGE_KEY = "bazaar.preview.termsRequests";

// Seeded pending requests (hardcoded — supplement any localStorage-added ones).
const SEED_TERMS_REQUESTS: TermsRequest[] = [
  {
    id: "seed-1",
    customer: "Alex Golden / Gold Custom Packaging",
    rep: "Ernesto Navarro",
    requestedTerms: "Net-30",
    requestedAt: "06/28 · 2:14 PM",
    justification: "9 lifetime orders, $148K LTV, wire-paid every time. Requesting Net-30 to unlock bigger production runs — customer wants to bump next PO to 50K units.",
    ltv: 148300,
    orderCount: 9,
    status: "pending",
  },
  {
    id: "seed-2",
    customer: "Corey Nishimura / SafeCare Packaging",
    rep: "Ernesto Navarro",
    requestedTerms: "Net-15",
    requestedAt: "06/29 · 10:20 AM",
    justification: "4 lifetime orders, $22K LTV, ACH on file, resale cert clean. Customer asked for terms so they can align w/ their retailer AR cycle.",
    ltv: 22400,
    orderCount: 4,
    status: "pending",
  },
  {
    id: "seed-3",
    customer: "Marcus King / Rise Botanicals",
    rep: "Maria Hakobyan",
    requestedTerms: "Net-15",
    requestedAt: "06/30 · 4:44 PM",
    justification: "3 orders, always paid card same-day. Small ticket but consistent — they're expanding into 20 more retailers Q3.",
    ltv: 6120,
    orderCount: 3,
    status: "pending",
  },
  {
    id: "seed-4",
    customer: "Priya Nair / Green Leaf Wellness",
    rep: "Marianna",
    requestedTerms: "Net-45",
    requestedAt: "07/01 · 9:12 AM",
    justification: "First-time Net request. Only 1 order on file ($3,750). LTV modest but she runs a chain of 8 stores and wants Net-45 as standard. Risk flag: not enough history.",
    ltv: 3750,
    orderCount: 1,
    status: "pending",
  },
];

export default function PaymentsPreview() {
  const [role] = usePreviewRole();
  const gate = canSee(role, "payments-module");

  // ─── Terms requests state ─────────────────
  const [termsRequests, setTermsRequests] = useState<TermsRequest[]>([]);
  const [recentlyDecidedCollapsed, setRecentlyDecidedCollapsed] = useState(true);
  const [chaseTarget, setChaseTarget] = useState<Order | null>(null);
  const [discussTarget, setDiscussTarget] = useState<TermsRequest | null>(null);
  const [comingDueTab, setComingDueTab] = useState<7 | 14 | 30>(14);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TERMS_REQUEST_STORAGE_KEY);
      const stored: TermsRequest[] = raw ? JSON.parse(raw) : [];
      // Merge seed + stored (stored first if new, but keep seed if not overwritten)
      const merged = [...stored, ...SEED_TERMS_REQUESTS];
      setTermsRequests(merged);
    } catch {
      setTermsRequests(SEED_TERMS_REQUESTS);
    }
  }, []);

  function persistUserRequests(all: TermsRequest[]) {
    const userReqs = all.filter(r => !r.id.startsWith("seed-"));
    try { localStorage.setItem(TERMS_REQUEST_STORAGE_KEY, JSON.stringify(userReqs)); } catch {}
  }

  function decideRequest(id: string, decision: "approved" | "denied") {
    setTermsRequests(prev => {
      const next = prev.map(r => r.id === id ? { ...r, status: decision } : r);
      persistUserRequests(next);
      return next;
    });
  }

  // ─── Compute KPIs ─────────────────
  const {
    comingDueNext30,
    pastDue,
    pastDueCount,
    collected30,
    pendingClearance,
    refunded30,
    ledger,
    pastDueOrders,
    comingDueOrdersFiltered,
  } = useMemo(() => {
    let comingDueNext30 = 0;
    let pastDue = 0;
    let pastDueCount = 0;
    let collected30 = 0;
    let pendingClearance = 0;
    let refunded30 = 0;
    const pastDueOrders: Order[] = [];
    const comingDueOrders: Order[] = [];
    const ledgerRows: { order: Order; payment: PaymentEntry }[] = [];

    for (const o of ORDERS) {
      // Past due — either flagged, or Net-X passed and balance remains
      const dueDays = daysUntil(o.paymentDueDate);
      const isPastDue = o.paymentOverdue === true || (o.balanceDue > 0 && o.paymentDueDate && dueDays !== null && dueDays < 0);
      if (isPastDue && o.balanceDue > 0) {
        pastDue += o.balanceDue;
        pastDueCount += 1;
        pastDueOrders.push(o);
      }

      // Coming due — unpaid + due within 30 days AND not past due AND has terms
      if (!isPastDue && o.balanceDue > 0 && o.paymentTerms && dueDays !== null && dueDays >= 0 && dueDays <= 30) {
        comingDueNext30 += o.balanceDue;
        comingDueOrders.push(o);
      }

      // Payment ledger — walk payments
      if (o.payments && o.payments.length > 0) {
        for (const p of o.payments) {
          ledgerRows.push({ order: o, payment: p });
          const paidAgo = daysAgo(p.date);
          if (p.status === "Completed" && paidAgo !== null && paidAgo <= 30) {
            if (p.amount < 0) refunded30 += Math.abs(p.amount);
            else collected30 += p.amount;
          }
          if (p.status === "Pending Clearance" && p.amount > 0) {
            pendingClearance += p.amount;
          }
        }
      }
    }

    // Sort ledger by date desc (last 30)
    ledgerRows.sort((a, b) => {
      const da = parseMDY(a.payment.date)?.getTime() || 0;
      const db = parseMDY(b.payment.date)?.getTime() || 0;
      return db - da;
    });

    // Sort past due by days late desc
    pastDueOrders.sort((a, b) => (daysPastDue(b.paymentDueDate || "") - daysPastDue(a.paymentDueDate || "")));

    return {
      comingDueNext30,
      pastDue,
      pastDueCount,
      collected30,
      pendingClearance,
      refunded30,
      ledger: ledgerRows.slice(0, 30),
      pastDueOrders,
      comingDueOrdersFiltered: comingDueOrders,
    };
  }, []);

  const comingDueForTab = useMemo(() => {
    return comingDueOrdersFiltered
      .filter(o => {
        const d = daysUntil(o.paymentDueDate);
        return d !== null && d >= 0 && d <= comingDueTab;
      })
      .sort((a, b) => (daysUntil(a.paymentDueDate) || 0) - (daysUntil(b.paymentDueDate) || 0));
  }, [comingDueOrdersFiltered, comingDueTab]);

  // ─── Gate ─────────────────
  if (!gate) {
    return (
      <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", padding: "40px 20px", background: "var(--preview-bg)", minHeight: "100vh", color: "var(--preview-text)" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto", padding: "32px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", textAlign: "center" }}>
          <div style={{ fontSize: "44px", marginBottom: "10px" }}>🔒</div>
          <div style={{ fontSize: "17px", fontWeight: 800, marginBottom: "8px" }}>Payments Manager</div>
          <div style={{ fontSize: "13px", color: "var(--preview-text-muted)", marginBottom: "18px" }}>
            This module is only available in the Admin or Accountant view.
          </div>
          <div style={{ fontSize: "12px", color: "var(--preview-text-muted)" }}>
            You're currently viewing as: <b style={{ color: "var(--preview-text)" }}>{PREVIEW_ROLE_LABELS[role]}</b>. Switch role from the sidebar to see this page.
          </div>
        </div>
      </div>
    );
  }

  const pendingRequests = termsRequests.filter(r => r.status === "pending");
  const decidedRequests = termsRequests.filter(r => r.status !== "pending");

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "var(--preview-bg)", color: "var(--preview-text)", margin: "-20px", padding: "20px", minHeight: "100vh" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", marginBottom: "14px", color: "var(--preview-text)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px" }}>Payments Manager · Arusyak's view · live from orders seed</span>
        <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "var(--preview-text-muted)" }}>Viewing as <b style={{ color: "var(--preview-text)" }}>{PREVIEW_ROLE_LABELS[role]}</b> · today = 07/01/2026</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Payments · Arusyak's view</h1>
        <div style={{ fontSize: "12.5px", color: "var(--preview-text-muted)", marginTop: "4px" }}>Money coming in · money going out · accounts to chase</div>
      </div>

      {/* KPI row (5 tiles) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "16px" }}>
        <KpiTile label="Coming Due" sub="next 30 days" value={fmtMoney(comingDueNext30)} tint="#3b82f6" />
        <KpiTile label="Past Due" sub={`${pastDueCount} account${pastDueCount === 1 ? "" : "s"}`} value={fmtMoney(pastDue)} tint="#dc2626" />
        <KpiTile label="Collected" sub="last 30 days" value={fmtMoney(collected30)} tint="#16a34a" />
        <KpiTile label="Pending Clearance" sub="ACH / wire not cleared" value={fmtMoney(pendingClearance)} tint="#a16207" />
        <KpiTile label="Refunded" sub="last 30 days" value={fmtMoney(refunded30)} tint="#6d28d9" />
      </div>

      {/* Main body: 2-col grid — left main content, right sticky terms rail */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Two tables side-by-side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Past Due */}
            <Panel title="Past Due Accounts" tint="#dc2626" subtitle={`${pastDueOrders.length} account${pastDueOrders.length === 1 ? "" : "s"} — chase priority`}>
              {pastDueOrders.length === 0 ? (
                <Empty label="No past-due accounts. Nice." />
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Terms</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Days Late</th>
                      <th style={thStyle}>Last comm</th>
                      <th style={{ ...thStyle, textAlign: "right" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastDueOrders.map(o => {
                      const daysLate = daysPastDue(o.paymentDueDate || "");
                      const red = daysLate > 14;
                      const lastComm = o.communications && o.communications.length > 0 ? o.communications[o.communications.length - 1] : null;
                      return (
                        <tr key={o.refId}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 700, fontSize: "13px" }}>{o.company}</div>
                            <div style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>{o.contact} · ORD-{o.refId}</div>
                          </td>
                          <td style={tdStyle}>
                            <Pill text={o.paymentTerms || "—"} bg="#e0e7ff" fg="#4338ca" />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", color: "#dc2626", fontWeight: 800 }}>{fmtMoney(o.balanceDue)}</td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <Pill text={`${daysLate}d`} bg={red ? "#fee2e2" : "#fef3c7"} fg={red ? "#991b1b" : "#92400e"} />
                          </td>
                          <td style={tdStyle}>
                            {lastComm ? (
                              <span title={lastComm.body} style={{ fontSize: "11.5px", color: "var(--preview-text-muted)" }}>
                                <span style={{ marginRight: "4px" }}>{CHANNEL_ICONS[lastComm.channel] || "•"}</span>
                                {lastComm.at.split(" · ")[0]}
                              </span>
                            ) : <span style={{ fontSize: "11.5px", color: "var(--preview-text-muted)" }}>—</span>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <button onClick={() => setChaseTarget(o)} style={chaseBtn}>Chase</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>

            {/* Coming Due */}
            <Panel title="Coming Due" tint="#3b82f6" subtitle="Watch these — not yet late">
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                {[7, 14, 30].map(n => (
                  <button
                    key={n}
                    onClick={() => setComingDueTab(n as 7 | 14 | 30)}
                    style={{
                      padding: "5px 10px",
                      background: comingDueTab === n ? "#0a0a0a" : "var(--preview-surface-2)",
                      color: comingDueTab === n ? "#fff" : "var(--preview-text-muted)",
                      border: "1px solid var(--preview-border)",
                      borderRadius: "6px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Next {n}d
                  </button>
                ))}
              </div>
              {comingDueForTab.length === 0 ? (
                <Empty label="Nothing coming due in that window." />
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Terms</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Due in</th>
                      <th style={thStyle}>Last comm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comingDueForTab.map(o => {
                      const dueIn = daysUntil(o.paymentDueDate) || 0;
                      const soon = dueIn <= 3;
                      const lastComm = o.communications && o.communications.length > 0 ? o.communications[o.communications.length - 1] : null;
                      return (
                        <tr key={o.refId}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 700, fontSize: "13px" }}>{o.company}</div>
                            <div style={{ fontSize: "11px", color: "var(--preview-text-muted)" }}>{o.contact} · ORD-{o.refId}</div>
                          </td>
                          <td style={tdStyle}>
                            <Pill text={o.paymentTerms || "—"} bg="#e0e7ff" fg="#4338ca" />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{fmtMoney(o.balanceDue)}</td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <Pill text={dueIn === 0 ? "today" : `${dueIn}d`} bg={soon ? "#fef3c7" : "#dbeafe"} fg={soon ? "#92400e" : "#1e40af"} />
                          </td>
                          <td style={tdStyle}>
                            {lastComm ? (
                              <span title={lastComm.body} style={{ fontSize: "11.5px", color: "var(--preview-text-muted)" }}>
                                <span style={{ marginRight: "4px" }}>{CHANNEL_ICONS[lastComm.channel] || "•"}</span>
                                {lastComm.at.split(" · ")[0]}
                              </span>
                            ) : <span style={{ fontSize: "11.5px", color: "var(--preview-text-muted)" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          {/* Payments Ledger */}
          <Panel title="Payments Ledger" tint="#171717" subtitle={`Last ${ledger.length} payment${ledger.length === 1 ? "" : "s"} — chronological`}>
            {ledger.length === 0 ? (
              <Empty label="No payments logged yet." />
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Customer</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={thStyle}>Method</th>
                    <th style={thStyle}>Reference</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(({ order, payment }, i) => {
                    const isRefund = payment.amount < 0;
                    const statusColor =
                      payment.status === "Completed" ? { bg: "#dcfce7", fg: "#166534" } :
                      payment.status === "Pending Clearance" ? { bg: "#fef3c7", fg: "#92400e" } :
                      { bg: "#fee2e2", fg: "#991b1b" };
                    return (
                      <tr key={`${order.refId}-${i}`}>
                        <td style={{ ...tdStyle, fontSize: "12px", fontFamily: "monospace", color: "var(--preview-text-muted)" }}>{payment.date}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, fontSize: "12.5px" }}>{order.company}</div>
                          <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>ORD-{order.refId}</div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: isRefund ? "#dc2626" : "#16a34a" }}>
                          {isRefund ? "-" : "+"}{fmtMoney(Math.abs(payment.amount))}
                        </td>
                        <td style={tdStyle}>
                          <Pill text={payment.method} bg="#e0e7ff" fg="#4338ca" />
                        </td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px", color: "var(--preview-text-muted)" }}>{payment.ref}</td>
                        <td style={tdStyle}>
                          <Pill text={payment.status} bg={statusColor.bg} fg={statusColor.fg} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        {/* Right rail — Terms Approval Queue */}
        <aside style={{ position: "sticky", top: "16px", alignSelf: "start", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px", height: "fit-content" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 800 }}>Terms Approval Queue</div>
              <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "2px" }}>{pendingRequests.length} pending</div>
            </div>
            <div style={{ padding: "3px 8px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "10.5px", fontWeight: 800, color: "#92400e" }}>ACTION</div>
          </div>

          {pendingRequests.length === 0 && (
            <div style={{ padding: "16px", background: "var(--preview-surface-2)", borderRadius: "8px", fontSize: "12px", color: "var(--preview-text-muted)", textAlign: "center" }}>Nothing pending. Nice.</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {pendingRequests.map(r => (
              <div key={r.id} style={{ padding: "10px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", fontWeight: 800, lineHeight: 1.3 }}>{r.customer}</div>
                    <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", marginTop: "2px" }}>Rep: {r.rep} · {r.requestedAt}</div>
                  </div>
                  <Pill text={r.requestedTerms} bg="#fef3c7" fg="#92400e" />
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--preview-text)", lineHeight: 1.4, marginBottom: "8px" }}>{r.justification}</div>
                {(r.ltv !== undefined || r.orderCount !== undefined) && (
                  <div style={{ display: "flex", gap: "10px", fontSize: "10.5px", color: "var(--preview-text-muted)", marginBottom: "8px" }}>
                    {r.orderCount !== undefined && <span>📦 {r.orderCount} order{r.orderCount === 1 ? "" : "s"}</span>}
                    {r.ltv !== undefined && <span>💰 LTV {fmtMoney(r.ltv)}</span>}
                  </div>
                )}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => decideRequest(r.id, "approved")} style={approveBtn}>Approve</button>
                  <button onClick={() => decideRequest(r.id, "denied")} style={denyBtn}>Deny</button>
                  <button onClick={() => setDiscussTarget(r)} style={discussBtn}>Discuss</button>
                </div>
              </div>
            ))}
          </div>

          {decidedRequests.length > 0 && (
            <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--preview-border)" }}>
              <button
                onClick={() => setRecentlyDecidedCollapsed(v => !v)}
                style={{ background: "transparent", border: "none", color: "var(--preview-text-muted)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", padding: 0 }}
              >
                {recentlyDecidedCollapsed ? "▸" : "▾"} Recently decided ({decidedRequests.length})
              </button>
              {!recentlyDecidedCollapsed && (
                <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {decidedRequests.map(r => (
                    <div key={r.id} style={{ padding: "6px 10px", background: "var(--preview-surface-2)", borderRadius: "6px", fontSize: "11px" }}>
                      <div style={{ fontWeight: 700 }}>{r.customer}</div>
                      <div style={{ color: "var(--preview-text-muted)", marginTop: "2px" }}>
                        {r.requestedTerms} · <b style={{ color: r.status === "approved" ? "#16a34a" : "#dc2626" }}>{r.status}</b>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Chase modal */}
      {chaseTarget && <ChaseModal order={chaseTarget} onClose={() => setChaseTarget(null)} />}
      {discussTarget && <DiscussModal request={discussTarget} onClose={() => setDiscussTarget(null)} />}
    </div>
  );
}

// ─── KPI tile ─────────────────
function KpiTile({ label, sub, value, tint }: { label: string; sub: string; value: string; tint: string }) {
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: tint, flexShrink: 0 }} />
        <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      </div>
      <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--preview-text)", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "3px" }}>{sub}</div>
    </div>
  );
}

// ─── Panel wrapper ─────────────────
function Panel({ title, subtitle, tint, children }: { title: string; subtitle?: string; tint: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <span style={{ width: "4px", height: "16px", background: tint, borderRadius: "2px" }} />
        <div style={{ fontSize: "13.5px", fontWeight: 800 }}>{title}</div>
      </div>
      {subtitle && <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)", marginBottom: "12px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", background: bg, color: fg, fontSize: "10.5px", fontWeight: 800, borderRadius: "5px", lineHeight: 1.4, whiteSpace: "nowrap" }}>{text}</span>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ padding: "18px", textAlign: "center", background: "var(--preview-surface-2)", borderRadius: "8px", fontSize: "12px", color: "var(--preview-text-muted)" }}>{label}</div>
  );
}

// ─── Modals ─────────────────
function ChaseModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const daysLate = daysPastDue(order.paymentDueDate || "");
  const defaultSubject = `Payment past due — ORD-${order.refId} (${fmtMoney(order.balanceDue)})`;
  const defaultBody = `Hi ${order.contact.split(" ")[0]},\n\nFlagging that ORD-${order.refId} (${fmtMoney(order.balanceDue)}) is now ${daysLate} day${daysLate === 1 ? "" : "s"} past our ${order.paymentTerms || "agreed"} terms. Can we get an ETA on when this settles?\n\nHappy to jump on a quick call if it's easier.\n\n— Arusyak`;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function handleSend() {
    setSending(true);
    // Preview-only: log to console + local toast.
    // eslint-disable-next-line no-console
    console.log("[payments/chase] Would send reminder:", { to: order.contact, subject, body });
    setTimeout(() => { setSending(false); setSent(true); }, 500);
    setTimeout(() => onClose(), 1400);
  }

  return (
    <ModalShell onClose={onClose} title={`Chase — ${order.company}`} subtitle={`${daysLate} days past ${order.paymentTerms || "terms"} · ${fmtMoney(order.balanceDue)} outstanding`}>
      {sent ? (
        <div style={{ padding: "20px", textAlign: "center", background: "#dcfce7", borderRadius: "8px", color: "#166534", fontWeight: 700 }}>✓ Reminder queued — Arusyak will follow up.</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <div style={fieldLabel}>To</div>
              <div style={{ padding: "8px 12px", background: "var(--preview-surface-2)", borderRadius: "8px", fontSize: "12.5px" }}>
                {order.contact} · <span style={{ color: "var(--preview-text-muted)" }}>{order.customer?.email || "email on file"}</span>
              </div>
            </div>
            <div>
              <div style={fieldLabel}>Subject</div>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inpStyle} />
            </div>
            <div>
              <div style={fieldLabel}>Message</div>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} style={{ ...inpStyle, resize: "vertical", fontFamily: "system-ui, sans-serif" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
            <button onClick={onClose} style={btnLightStyle}>Cancel</button>
            <button onClick={handleSend} disabled={sending} style={{ ...btnPrimaryStyle, opacity: sending ? 0.5 : 1 }}>{sending ? "Sending…" : "Send reminder"}</button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function DiscussModal({ request, onClose }: { request: TermsRequest; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  function handleSend() {
    // eslint-disable-next-line no-console
    console.log("[payments/discuss] Note on terms request:", { id: request.id, note });
    setSent(true);
    setTimeout(() => onClose(), 1200);
  }
  return (
    <ModalShell onClose={onClose} title={`Discuss — ${request.customer}`} subtitle={`Requested ${request.requestedTerms} · rep ${request.rep}`}>
      {sent ? (
        <div style={{ padding: "20px", textAlign: "center", background: "#dcfce7", borderRadius: "8px", color: "#166534", fontWeight: 700 }}>✓ Note posted to rep thread.</div>
      ) : (
        <>
          <div style={{ padding: "10px 12px", background: "var(--preview-surface-2)", borderRadius: "8px", fontSize: "12px", marginBottom: "12px", color: "var(--preview-text)" }}>
            <b>Rep's justification:</b> {request.justification}
          </div>
          <div style={fieldLabel}>Your note back to {request.rep.split(" ")[0]}</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={6} placeholder="What questions or conditions do you have?" style={{ ...inpStyle, resize: "vertical", fontFamily: "system-ui, sans-serif" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
            <button onClick={onClose} style={btnLightStyle}>Cancel</button>
            <button onClick={handleSend} disabled={note.trim().length === 0} style={{ ...btnPrimaryStyle, opacity: note.trim().length === 0 ? 0.4 : 1 }}>Post note</button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--preview-surface)", borderRadius: "12px", padding: "20px", width: "min(520px, 100%)", maxHeight: "88vh", overflow: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.3)", color: "var(--preview-text)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 800 }}>{title}</div>
            {subtitle && <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)", marginTop: "3px" }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: "20px", color: "var(--preview-text-muted)", cursor: "pointer", padding: 0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "12.5px" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: "10.5px", fontWeight: 800, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--preview-border)" };
const tdStyle: React.CSSProperties = { padding: "10px 6px", borderBottom: "1px solid var(--preview-border)", verticalAlign: "middle" };
const chaseBtn: React.CSSProperties = { padding: "5px 10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 800, cursor: "pointer" };
const approveBtn: React.CSSProperties = { flex: 1, padding: "5px 10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 800, cursor: "pointer" };
const denyBtn: React.CSSProperties = { flex: 1, padding: "5px 10px", background: "#fff", color: "#dc2626", border: "1px solid #dc2626", borderRadius: "6px", fontSize: "11px", fontWeight: 800, cursor: "pointer" };
const discussBtn: React.CSSProperties = { flex: 1, padding: "5px 10px", background: "var(--preview-surface-2)", color: "var(--preview-text)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11px", fontWeight: 800, cursor: "pointer" };
const fieldLabel: React.CSSProperties = { fontSize: "10.5px", fontWeight: 800, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" };
const inpStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", outline: "none", boxSizing: "border-box", color: "var(--preview-text)" };
const btnPrimaryStyle: React.CSSProperties = { padding: "8px 16px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" };
const btnLightStyle: React.CSSProperties = { padding: "8px 14px", background: "var(--preview-surface)", color: "var(--preview-text)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" };
