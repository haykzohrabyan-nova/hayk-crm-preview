"use client";

import type React from "react";
import { KpiHelpLine } from "@/components/ui/kpi-help-line";
import { DashboardHiddenValue } from "@/components/dashboard/dashboard-privacy";

export interface KpiCardProps {
  label: string;
  value: string | number;
  /** Secondary text line below the value. */
  sub?: string;
  help?: string;
  icon: React.ReactNode;
  accent?: boolean;
  /** Amber warning variant (reports page). */
  warning?: boolean;
  /** Colored sub-stat chips (admin dashboard). */
  subStats?: { label: string; value: number; color: string }[];
  /** Blur values when true (admin dashboard privacy). */
  valuesHidden?: boolean;
  valueKind?: "currency" | "count";
}

export function KpiCard({
  label,
  value,
  sub,
  help,
  icon,
  accent = false,
  warning = false,
  subStats,
  valuesHidden = false,
  valueKind = "count",
}: KpiCardProps) {
  const bg = accent
    ? "var(--color-btn-verify-bg)"
    : "var(--color-surface)";

  const border = accent
    ? "transparent"
    : warning
      ? "var(--color-warning-border)"
      : "var(--color-border)";

  const labelColor = accent
    ? "var(--color-btn-verify-text)"
    : warning
      ? "var(--color-warning-text-deep)"
      : "var(--color-text-muted)";

  const valueColor = accent
    ? "var(--color-btn-verify-text)"
    : warning
      ? "var(--color-warning)"
      : "var(--color-text-primary)";

  const iconBg = accent
    ? "rgba(255,255,255,0.15)"
    : warning
      ? "var(--color-warning-bg)"
      : "color-mix(in srgb, var(--color-accent) 12%, transparent)";

  const iconColor = accent
    ? "var(--color-btn-verify-text)"
    : warning
      ? "var(--color-warning)"
      : "var(--color-accent)";

  const helpVariant = accent ? "accent" : warning ? "warning" : "default";

  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col gap-3"
      style={{
        background: bg,
        borderColor: border,
        ...(warning ? { borderLeftWidth: "3px", borderLeftColor: "var(--color-warning)" } : {}),
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: labelColor, opacity: accent || warning ? 0.85 : 1 }}
        >
          {label}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[8px]"
          style={{ background: iconBg }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
      </div>
      <div>
        {valuesHidden ? (
          <DashboardHiddenValue kind={valueKind} accent={accent} />
        ) : (
          <p
            className="text-[28px] font-semibold leading-none tabular-nums"
            style={{ color: valueColor }}
          >
            {value}
          </p>
        )}
        {sub && (
          <p
            className="mt-1 text-[12px]"
            style={{
              color: warning ? "var(--color-text-primary)" : labelColor,
              opacity: accent ? 0.7 : 1,
            }}
          >
            {sub}
          </p>
        )}
        {help && <KpiHelpLine text={help} variant={helpVariant} />}
        {!valuesHidden && subStats && subStats.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            {subStats.map((s) => (
              <span
                key={s.label}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)`, color: s.color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: s.color }}
                />
                {s.label}: {s.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div
      className="rounded-[10px] border p-5 flex flex-col gap-3"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
        <div className="h-8 w-8 animate-pulse rounded-[8px]" style={{ background: "var(--color-border)" }} />
      </div>
      <div className="space-y-2">
        <div className="h-8 w-20 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
        <div className="h-3 w-16 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
      </div>
    </div>
  );
}
