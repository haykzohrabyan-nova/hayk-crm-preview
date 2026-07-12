// Hayk 2026-07-11 — Customer Command Center · PER-PROJECT view.
// The primary experience: customer header → the list of their PROJECTS (each a
// job that threads inquiry → quote → order → production). Click a project to
// open its full life thread. A secondary "Full timeline" tab keeps the old
// blended cross-project view. Server component. READ-ONLY. Additive.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadCustomerProjects,
  loadCustomerDetail,
  fmtMoney,
  fmtDateTime,
  fmtRelative,
  type ProjectSummary,
  type EventSource,
  type TimelineEvent,
} from "../_data";

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

function stageColor(kind: string | null): string {
  switch ((kind ?? "").toLowerCase()) {
    case "done":
      return "#16a34a";
    case "approval":
      return "#d97706";
    case "exception":
      return "#dc2626";
    case "archive":
      return "#64748b";
    default:
      return "#2563eb";
  }
}

function payColor(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "paid":
      return "#16a34a";
    case "partial":
      return "#d97706";
    case "unpaid":
      return ACCENT;
    default:
      return "#64748b";
  }
}

function payLabel(status: string | null): string {
  switch ((status ?? "").toLowerCase()) {
    case "paid":
      return "Paid in full";
    case "partial":
      return "Deposit paid";
    case "unpaid":
      return "Awaiting payment";
    default:
      return status || "—";
  }
}

export default async function CustomerProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { customerId } = await params;
  const sp = await searchParams;
  const view = sp?.view === "timeline" ? "timeline" : "projects";

  const data = await loadCustomerProjects(customerId);
  if (!data) notFound();
  const { customer, repName, isReturning, totals, projects } = data;

  // Only fetch the (heavier) blended timeline when that tab is active.
  const blended = view === "timeline" ? await loadCustomerDetail(customerId) : null;
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
          style={{ fontSize: 13, color: "var(--preview-text-muted)", textDecoration: "none" }}
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
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
          </div>
          <div style={{ marginTop: 5, fontSize: 14, color: "var(--preview-text-muted)" }}>
            {[customer.company, customer.phone, customer.email].filter(Boolean).join("  ·  ") ||
              "No contact details on file"}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--preview-text-faint)" }}>
            Key account rep:{" "}
            <strong style={{ color: "var(--preview-text-muted)" }}>{repName || "Unassigned"}</strong>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10,
              marginTop: 18,
            }}
          >
            <Stat label="Projects" value={String(projects.length)} />
            <Stat label="Total ordered" value={fmtMoney(totals.ordered)} />
            <Stat label="Total paid" value={fmtMoney(totals.paid)} />
            <Stat label="Open balance" value={fmtMoney(totals.openBalance)} accent={totals.openBalance > 0} />
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginTop: 20, marginBottom: 16 }}>
          <Tab href={`/preview/command-center/${customerId}`} active={view === "projects"}>
            Projects
          </Tab>
          <Tab href={`/preview/command-center/${customerId}?view=timeline`} active={view === "timeline"}>
            Full timeline
          </Tab>
        </div>

        {view === "projects" ? (
          projects.length === 0 ? (
            <Empty>No projects yet for this customer.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {projects.map((p) => (
                <ProjectRow key={p.key} customerId={customerId} p={p} now={now} />
              ))}
            </div>
          )
        ) : (
          <BlendedTimeline events={blended?.events ?? []} now={now} />
        )}
      </div>
    </div>
  );
}

// ── One project row (click → project thread) ───────────────────────────────
function ProjectRow({
  customerId,
  p,
  now,
}: {
  customerId: string;
  p: ProjectSummary;
  now: number;
}) {
  return (
    <Link
      href={`/preview/command-center/${customerId}/${encodeURIComponent(p.key)}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          border: "1px solid var(--preview-border)",
          borderRadius: 12,
          background: "var(--preview-surface)",
          padding: "16px 18px",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: ACCENT,
                background: "rgba(255,93,46,0.12)",
                padding: "2px 8px",
                borderRadius: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              #{p.passport ?? p.ref}
            </span>
            <span style={{ fontWeight: 650, fontSize: 15.5 }}>{p.title}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--preview-text-muted)" }}>
            {p.ref}
            {p.crmOrderNo ? ` → ${p.crmOrderNo}` : ""}
            {p.channel && p.startedAt ? ` · started via ${p.channel} on ${fmtDateTime(p.startedAt)}` : ""}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <StageChip stage={p.stage} kind={p.stageKind} />
            <PayChip status={p.paymentStatus} />
            {p.owner && (
              <span style={{ fontSize: 12, color: "var(--preview-text-faint)" }}>· {p.owner}</span>
            )}
          </div>
        </div>

        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {fmtMoney(p.total)}
          </div>
          {p.balance > 0 ? (
            <div style={{ fontSize: 12.5, color: ACCENT, fontWeight: 600, marginTop: 2 }}>
              {fmtMoney(p.balance)} due
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "#16a34a", marginTop: 2 }}>Paid</div>
          )}
          <div style={{ fontSize: 11.5, color: "var(--preview-text-faint)", marginTop: 4 }}>
            {p.startedAt ? fmtRelative(p.startedAt, now) : ""}
          </div>
        </div>
      </div>
    </Link>
  );
}

function StageChip({ stage, kind }: { stage: string; kind: string | null }) {
  const c = stageColor(kind);
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        color: c,
        background: hexToBg(c),
        padding: "3px 9px",
        borderRadius: 999,
      }}
    >
      {stage}
    </span>
  );
}

function PayChip({ status }: { status: string | null }) {
  const c = payColor(status);
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        color: c,
        background: hexToBg(c),
        padding: "3px 9px",
        borderRadius: 999,
      }}
    >
      {payLabel(status)}
    </span>
  );
}

// ── Blended timeline (secondary tab — the old cross-project view) ───────────
function BlendedTimeline({ events, now }: { events: TimelineEvent[]; now: number }) {
  if (events.length === 0) return <Empty>No history yet for this customer.</Empty>;
  return (
    <div style={{ position: "relative", maxWidth: 720 }}>
      {events.map((e, i) => {
        const s = SOURCE_STYLE[e.source];
        const last = i === events.length - 1;
        return (
          <div key={i} style={{ display: "flex", gap: 12, position: "relative" }}>
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
      })}
    </div>
  );
}

// ── Small UI pieces ────────────────────────────────────────────────────────
function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 600,
        padding: "7px 14px",
        borderRadius: 999,
        border: "1px solid var(--preview-border)",
        color: active ? "#fff" : "var(--preview-text-muted)",
        background: active ? ACCENT : "var(--preview-surface)",
      }}
    >
      {children}
    </Link>
  );
}

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
