"use client";

import { Trophy } from "lucide-react";

export interface RepScorecardRow {
  id: string;
  full_name: string;
  cash_collected: number;
  payment_count: number;
  orders_paid: number;
  booked_value: number;
  collection_pct: number | null;
  leads_routed?: number;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function CollectionBar({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>;
  }
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div
        className="h-1.5 flex-1 rounded-full overflow-hidden"
        style={{ background: "var(--color-border)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: pct >= 80 ? "var(--color-success)" : "var(--color-accent)",
          }}
        />
      </div>
      <span className="text-[11px] tabular-nums w-8 text-right" style={{ color: "var(--color-text-muted)" }}>
        {pct}%
      </span>
    </div>
  );
}

export function RepScorecardTable({
  title,
  subtitle,
  rows,
  variant,
  selectedUserId,
  onSelectUser,
  showRouted,
}: {
  title: string;
  subtitle: string;
  rows: RepScorecardRow[];
  variant: "sales" | "sdr";
  selectedUserId: string | null;
  onSelectUser: (id: string | null) => void;
  showRouted?: boolean;
}) {
  const accent =
    variant === "sales"
      ? { bg: "var(--color-success-bg)", color: "var(--color-success)" }
      : { bg: "var(--color-info-bg)", color: "var(--color-info-text)" };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            className="text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            {title}
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {subtitle}
          </p>
        </div>
        {rows.length > 0 && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ background: accent.bg, color: accent.color }}
          >
            {rows.filter((r) => r.cash_collected > 0).length} with payments
          </span>
        )}
      </div>

      <div
        className="rounded-[10px] border overflow-hidden"
        style={{ borderColor: "var(--color-border)" }}
      >
        {rows.length === 0 ? (
          <p className="p-5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            No team members in this role.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr
                  style={{
                    background: "var(--color-row-alt)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {["Rep", "Cash Collected", "Payments", "Orders", ...(showRouted ? ["Routed"] : []), "Booked", "Collected %"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left font-medium uppercase tracking-[0.06em] text-[11px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isSelected = selectedUserId === row.id;
                  const isTop = idx === 0 && row.cash_collected > 0;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onSelectUser(isSelected ? null : row.id)}
                      className="cursor-pointer transition-colors"
                      style={{
                        background: isSelected
                          ? "color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))"
                          : idx % 2 === 0
                            ? "var(--color-surface)"
                            : "var(--color-row-alt)",
                        borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isTop && (
                            <Trophy className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-accent)" }} />
                          )}
                          <span
                            className="font-medium"
                            style={{
                              color: isSelected ? "var(--color-tab-active)" : "var(--color-text-primary)",
                            }}
                          >
                            {row.full_name}
                          </span>
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 font-semibold tabular-nums"
                        style={{ color: row.cash_collected > 0 ? "var(--color-success)" : "var(--color-text-muted)" }}
                      >
                        {formatCompact(row.cash_collected)}
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                        {row.payment_count}
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                        {row.orders_paid}
                      </td>
                      {showRouted && (
                        <td className="px-4 py-3 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                          {row.leads_routed ?? 0}
                        </td>
                      )}
                      <td className="px-4 py-3 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                        {formatCompact(row.booked_value)}
                      </td>
                      <td className="px-4 py-3">
                        <CollectionBar pct={row.collection_pct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p
          className="border-t px-4 py-2 text-[11px]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          Click a row to filter the page to that rep. Cash = payments recorded in the selected period.
        </p>
      </div>
    </section>
  );
}
