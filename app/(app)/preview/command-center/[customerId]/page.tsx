// Hayk 2026-07-11 — Customer Command Center · per-customer unified timeline.
// The heart of Section 1: one chronological thread merging inquiry, quote,
// order, payment, permit and production events for a single customer, plus a
// "Right now" live-state rail. Server component. READ-ONLY. Additive.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadCustomerDetail,
  fmtMoney,
  fmtDateTime,
  fmtRelative,
  type EventSource,
  type TimelineEvent,
} from "../_data";

export const dynamic = "force-dynamic";

const ACCENT = "#FF5D2E";

// Distinct color + icon per event source.
const SOURCE_STYLE: Record<
  EventSource,
  { color: string; label: string; icon: string }
> = {
  inquiry: { color: "#64748b", label: "Inquiry", icon: "◍" },
  quote: { color: "#d97706", label: "Quote", icon: "✎" },
  order: { color: "#2563eb", label: "Order", icon: "▣" },
  payment: { color: "#16a34a", label: "Payment", icon: "$" },
  permit: { color: "#7c3aed", label: "Permit", icon: "⛨" },
  production: { color: "#0891b2", label: "Production", icon: "⚙" },
};

export default async function CustomerTimelinePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const data = await loadCustomerDetail(customerId);
  if (!data) notFound();

  const { customer, repName, isReturning, totals, taxExempt, events, rightNow } =
    data;
  const now = Date.now();

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "var(--preview-bg)",
        color: "var(--preview-text)",
        margin: "-20px",
        padding: "24px 22px 60px",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <Link
          href="/preview/command-center"
          style={{
            fontSize: 13,
            color: "var(--preview-text-muted)",
            textDecoration: "none",
          }}
        >
          ← All customers
        </Link>

        {/* ── Header card ─────────────────────────────────────────────── */}
        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--preview-border)",
            borderRadius: 14,
            background: "var(--preview-surface)",
            padding: "20px 22px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
                {customer.name?.trim() || "(unnamed customer)"}
                {isReturning && (
                  <span
                    style={{
                      marginLeft: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#16a34a",
                      background: "rgba(22,163,74,0.12)",
                      padding: "3px 9px",
                      borderRadius: 999,
                      verticalAlign: "middle",
                    }}
                  >
                    Returning customer
                  </span>
                )}
              </h1>
              <div
                style={{
                  marginTop: 5,
                  fontSize: 14,
                  color: "var(--preview-text-muted)",
                }}
              >
                {[customer.company, customer.phone, customer.email]
                  .filter(Boolean)
                  .join("  ·  ") || "No contact details on file"}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "var(--preview-text-faint)",
                }}
              >
                Key account rep:{" "}
                <strong style={{ color: "var(--preview-text-muted)" }}>
                  {repName || "Unassigned"}
                </strong>
                {"   ·   "}
                Tax-exempt:{" "}
                <strong style={{ color: "var(--preview-text-muted)" }}>
                  {taxExempt.onFile
                    ? `Yes${taxExempt.permit ? ` — permit #${taxExempt.permit}` : ""}`
                    : "No"}
                </strong>
              </div>
            </div>
          </div>

          {/* lifetime totals */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10,
              marginTop: 18,
            }}
          >
            <Stat label="Total quoted" value={fmtMoney(totals.quoted)} />
            <Stat label="Total ordered" value={fmtMoney(totals.ordered)} />
            <Stat label="Total paid" value={fmtMoney(totals.paid)} />
            <Stat
              label="Open balance"
              value={fmtMoney(totals.openBalance)}
              accent={totals.openBalance > 0}
            />
            <Stat label="Orders" value={String(totals.orderCount)} />
          </div>
        </div>

        {/* ── Two columns: timeline + right rail ──────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.9fr) minmax(0, 1fr)",
            gap: 20,
            marginTop: 20,
            alignItems: "start",
          }}
        >
          {/* Timeline */}
          <div>
            <SectionTitle>Timeline</SectionTitle>
            {events.length === 0 ? (
              <Empty>No history yet for this customer.</Empty>
            ) : (
              <div style={{ position: "relative" }}>
                {events.map((e, i) => (
                  <EventItem
                    key={i}
                    e={e}
                    now={now}
                    last={i === events.length - 1}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right rail */}
          <div style={{ position: "sticky", top: 16 }}>
            <SectionTitle>Right now</SectionTitle>

            <RailCard>
              <RailRow
                label="Open quotes"
                value={
                  rightNow.openQuotes.count > 0
                    ? `${rightNow.openQuotes.count} · ${fmtMoney(rightNow.openQuotes.value)}`
                    : "None"
                }
              />
              <RailRow
                label="Open balance"
                value={fmtMoney(rightNow.openBalance)}
                accent={rightNow.openBalance > 0}
              />
              <RailRow
                label="Active orders"
                value={String(rightNow.activeOrders.length)}
              />
            </RailCard>

            {rightNow.activeOrders.length > 0 && (
              <RailCard title="Active orders — live stage">
                {rightNow.activeOrders.map((o, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "8px 0",
                      borderTop: i === 0 ? "none" : "1px solid var(--preview-border)",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {o.code}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--preview-text-muted)",
                        }}
                      >
                        {o.stage}
                        <span style={{ color: "var(--preview-text-faint)" }}>
                          {" "}
                          · {o.source === "workflow" ? "production board" : "sales"}
                        </span>
                      </div>
                    </div>
                    {o.balance > 0 && (
                      <div
                        style={{
                          color: ACCENT,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtMoney(o.balance)}
                      </div>
                    )}
                  </div>
                ))}
              </RailCard>
            )}

            {rightNow.awaitingApproval.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  border: "1px solid rgba(217,119,6,0.35)",
                  background: "rgba(217,119,6,0.10)",
                  borderRadius: 10,
                  padding: "11px 13px",
                  fontSize: 13,
                }}
              >
                <strong style={{ color: "#d97706" }}>Waiting on customer</strong>
                <div style={{ marginTop: 4, color: "var(--preview-text-muted)" }}>
                  {rightNow.awaitingApproval.join(", ")} in an approval / waiting
                  stage.
                </div>
              </div>
            )}

            {rightNow.nextAction && (
              <RailCard title="Next action">
                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>
                    {rightNow.nextAction.label}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      color: "var(--preview-text-muted)",
                      fontSize: 12.5,
                    }}
                  >
                    {fmtDateTime(rightNow.nextAction.at)} ·{" "}
                    {fmtRelative(rightNow.nextAction.at, now)}
                  </div>
                </div>
              </RailCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Timeline event row ─────────────────────────────────────────────────────

function EventItem({
  e,
  now,
  last,
}: {
  e: TimelineEvent;
  now: number;
  last: boolean;
}) {
  const s = SOURCE_STYLE[e.source];
  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      {/* rail + dot */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: s.color,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {s.icon}
        </div>
        {!last && (
          <div
            style={{
              width: 2,
              flex: 1,
              minHeight: 18,
              background: "var(--preview-border-strong)",
            }}
          />
        )}
      </div>

      {/* content */}
      <div style={{ paddingBottom: 18, flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: s.color,
              background: hexToBg(s.color),
              padding: "2px 7px",
              borderRadius: 5,
            }}
          >
            {s.label}
          </span>
          <span style={{ fontWeight: 600, fontSize: 14.5 }}>{e.title}</span>
        </div>
        {e.detail && (
          <div
            style={{
              marginTop: 3,
              fontSize: 13.5,
              color: "var(--preview-text-muted)",
              lineHeight: 1.45,
            }}
          >
            {e.detail}
          </div>
        )}
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "var(--preview-text-faint)",
          }}
        >
          {fmtDateTime(e.at)} · {fmtRelative(e.at, now)}
          {e.who && <> · {e.who}</>}
        </div>
      </div>
    </div>
  );
}

// ── Small UI pieces ────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--preview-surface-2)",
        border: "1px solid var(--preview-border)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--preview-text-faint)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 18,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: accent ? ACCENT : "var(--preview-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: "var(--preview-text-faint)",
        margin: "0 0 12px",
      }}
    >
      {children}
    </h2>
  );
}

function RailCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--preview-border)",
        background: "var(--preview-surface)",
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 12,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: "var(--preview-text-faint)",
            marginBottom: 8,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function RailRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "5px 0",
        fontSize: 13.5,
      }}
    >
      <span style={{ color: "var(--preview-text-muted)" }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: accent ? ACCENT : "var(--preview-text)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px dashed var(--preview-border-strong)",
        borderRadius: 12,
        padding: "24px 16px",
        textAlign: "center",
        color: "var(--preview-text-muted)",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

// Translucent tint of a hex color for label chips (works light + dark).
function hexToBg(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.14)`;
}
