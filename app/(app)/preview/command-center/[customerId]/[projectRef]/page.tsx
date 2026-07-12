// Hayk 2026-07-11 — Customer Command Center · ONE PROJECT'S FULL THREAD.
// The heart of the per-project model: the whole life of a single job, threaded
// chronologically — how it started (inquiry/channel) → quote → order placed →
// production events (live board stage) → payments → comms. Plus a "Right now"
// rail: current stage, balance, next action. Server component. READ-ONLY.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadProjectThread,
  fmtMoney,
  fmtDateTime,
  fmtRelative,
  type EventSource,
  type TimelineEvent,
} from "../../_data";

export const dynamic = "force-dynamic";

const ACCENT = "#FF5D2E";

const SOURCE_STYLE: Record<EventSource, { color: string; label: string; icon: string }> = {
  inquiry: { color: "#64748b", label: "Inquiry", icon: "◍" },
  quote: { color: "#d97706", label: "Quote", icon: "✎" },
  order: { color: "#2563eb", label: "Order", icon: "▣" },
  payment: { color: "#16a34a", label: "Payment", icon: "$" },
  permit: { color: "#7c3aed", label: "Permit", icon: "⛨" },
  production: { color: "#0891b2", label: "Production", icon: "⚙" },
};

export default async function ProjectThreadPage({
  params,
}: {
  params: Promise<{ customerId: string; projectRef: string }>;
}) {
  const { customerId, projectRef } = await params;
  const data = await loadProjectThread(customerId, decodeURIComponent(projectRef));
  if (!data) notFound();

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
          href={`/preview/command-center/${customerId}`}
          style={{ fontSize: 13, color: "var(--preview-text-muted)", textDecoration: "none" }}
        >
          ← {data.customerName} · all projects
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
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: ACCENT,
                background: "rgba(255,93,46,0.12)",
                padding: "3px 10px",
                borderRadius: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              #{data.passport ?? data.ref}
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{data.title}</h1>
          </div>
          <div style={{ marginTop: 6, fontSize: 13.5, color: "var(--preview-text-muted)" }}>
            {data.customerName}
            {"  ·  "}
            {data.ref}
            {data.crmOrderNo ? ` → ${data.crmOrderNo}` : ""}
            {data.owner ? `  ·  ${data.owner}` : ""}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10,
              marginTop: 18,
            }}
          >
            <Stat label="Current stage" value={data.stage} />
            <Stat label="Total" value={fmtMoney(data.total)} />
            <Stat label="Balance" value={fmtMoney(data.balance)} accent={data.balance > 0} />
          </div>
        </div>

        {/* ── Two columns: thread + right rail ────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.9fr) minmax(0, 1fr)",
            gap: 20,
            marginTop: 20,
            alignItems: "start",
          }}
        >
          <div>
            <SectionTitle>This project, start to now</SectionTitle>
            {data.events.length === 0 ? (
              <Empty>No events recorded for this project yet.</Empty>
            ) : (
              <div style={{ position: "relative" }}>
                {data.events.map((e, i) => (
                  <EventItem key={i} e={e} now={now} last={i === data.events.length - 1} />
                ))}
              </div>
            )}
          </div>

          {/* Right rail */}
          <div style={{ position: "sticky", top: 16 }}>
            <SectionTitle>Right now</SectionTitle>
            <RailCard>
              <RailRow label="Stage" value={data.stage} />
              <RailRow label="Balance" value={fmtMoney(data.balance)} accent={data.balance > 0} />
            </RailCard>
            {data.rightNow.nextAction && (
              <RailCard title="Next action">
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{data.rightNow.nextAction}</div>
              </RailCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Timeline event row ─────────────────────────────────────────────────────
function EventItem({ e, now, last }: { e: TimelineEvent; now: number; last: boolean }) {
  const s = SOURCE_STYLE[e.source];
  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
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
          <div style={{ width: 2, flex: 1, minHeight: 18, background: "var(--preview-border-strong)" }} />
        )}
      </div>
      <div style={{ paddingBottom: 18, flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
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
          <div style={{ marginTop: 3, fontSize: 13.5, color: "var(--preview-text-muted)", lineHeight: 1.45 }}>
            {e.detail}
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--preview-text-faint)" }}>
          {fmtDateTime(e.at)} · {fmtRelative(e.at, now)}
          {e.who && <> · {e.who}</>}
        </div>
      </div>
    </div>
  );
}

// ── Small UI pieces ────────────────────────────────────────────────────────
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: "var(--preview-surface-2)",
        border: "1px solid var(--preview-border)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--preview-text-faint)" }}>
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

function RailCard({ title, children }: { title?: string; children: React.ReactNode }) {
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

function RailRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
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

function hexToBg(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.14)`;
}
