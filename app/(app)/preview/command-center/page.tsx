// Hayk 2026-07-11 — Customer Command Center (Section 1 of the unified vision).
// One window per customer. This INDEX lists every customer with activity, with
// live counts (leads / quotes / orders) and open balance, threaded from BOTH
// the CRM tables and the workflow board — all from the shared local Postgres.
// Server component. READ-ONLY. Additive. Nothing live is touched.

import Link from "next/link";
import { loadIndex, fmtMoney, fmtRelative, type IndexRow } from "./_data";

export const dynamic = "force-dynamic";

const ACCENT = "#FF5D2E";

export default async function CommandCenterIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp?.q ?? "").trim();
  const { rows, totalActive } = await loadIndex(q);

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "var(--preview-bg)",
        color: "var(--preview-text)",
        margin: "-20px",
        padding: "28px 22px 60px",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Preview banner */}
        <div
          style={{
            fontSize: 12,
            color: "var(--preview-text-muted)",
            background: "var(--preview-surface)",
            border: "1px solid var(--preview-border)",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 18,
          }}
        >
          Reads the live shared local DB · threads CRM + workflow · additive,
          nothing live touched
        </div>

        {/* Header */}
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 4px" }}>
          Customer Command Center
        </h1>
        <p
          style={{
            margin: "0 0 20px",
            color: "var(--preview-text-muted)",
            fontSize: 15,
          }}
        >
          One window per customer — their whole life across sales and production
          in a single timeline.
        </p>

        {/* Search */}
        <form method="get" style={{ marginBottom: 18 }}>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by name, company, phone, or email…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "11px 14px",
              fontSize: 15,
              borderRadius: 10,
              border: "1px solid var(--preview-border-strong)",
              background: "var(--preview-surface)",
              color: "var(--preview-text)",
              outline: "none",
            }}
          />
        </form>

        <div
          style={{
            fontSize: 13,
            color: "var(--preview-text-faint)",
            marginBottom: 10,
          }}
        >
          {q ? (
            <>
              Showing {rows.length} match{rows.length === 1 ? "" : "es"} for
              &ldquo;{q}&rdquo; · {totalActive} customers with activity
            </>
          ) : (
            <>
              {totalActive} customers with activity · showing most recent{" "}
              {rows.length}
            </>
          )}
        </div>

        {/* Table */}
        <div
          style={{
            border: "1px solid var(--preview-border)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--preview-surface)",
          }}
        >
          {/* head */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2.4fr 0.7fr 0.7fr 0.7fr 1.1fr 1fr",
              gap: 10,
              padding: "11px 16px",
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "var(--preview-text-faint)",
              borderBottom: "1px solid var(--preview-border)",
            }}
          >
            <div>Customer</div>
            <div style={{ textAlign: "center" }}>Leads</div>
            <div style={{ textAlign: "center" }}>Quotes</div>
            <div style={{ textAlign: "center" }}>Orders</div>
            <div style={{ textAlign: "right" }}>Open balance</div>
            <div style={{ textAlign: "right" }}>Last activity</div>
          </div>

          {rows.length === 0 && (
            <div
              style={{
                padding: "28px 16px",
                textAlign: "center",
                color: "var(--preview-text-muted)",
                fontSize: 14,
              }}
            >
              No customers found.
            </div>
          )}

          {rows.map((r, i) => (
            <Row key={r.id} r={r} last={i === rows.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ r, last }: { r: IndexRow; last: boolean }) {
  return (
    <Link
      href={`/preview/command-center/${r.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2.4fr 0.7fr 0.7fr 0.7fr 1.1fr 1fr",
          gap: 10,
          padding: "13px 16px",
          alignItems: "center",
          borderBottom: last ? "none" : "1px solid var(--preview-border)",
          fontSize: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.name}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--preview-text-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {[r.company, r.phone, r.email].filter(Boolean).join(" · ") ||
              "—"}
          </div>
        </div>
        <Count n={r.leadCount} />
        <Count n={r.quoteCount} />
        <Count n={r.orderCount} />
        <div
          style={{
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            fontWeight: r.openBalance > 0 ? 600 : 400,
            color: r.openBalance > 0 ? ACCENT : "var(--preview-text-faint)",
          }}
        >
          {r.openBalance > 0 ? fmtMoney(r.openBalance) : "—"}
        </div>
        <div
          style={{
            textAlign: "right",
            fontSize: 12.5,
            color: "var(--preview-text-muted)",
          }}
        >
          {r.lastActivity ? fmtRelative(r.lastActivity) : "—"}
        </div>
      </div>
    </Link>
  );
}

function Count({ n }: { n: number }) {
  return (
    <div
      style={{
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
        color: n > 0 ? "var(--preview-text)" : "var(--preview-text-faint)",
      }}
    >
      {n || "—"}
    </div>
  );
}
