"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { relativeTime } from "@/lib/utils/format";

// ─── Helpers (duplicated from consumers — centralised here) ───────────────────

export function formatSessionDuration(minutes: number): string {
  if (minutes < 1) return "< 1m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}


export function sessionAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Role pill ────────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, { bg: string; color: string }> = {
  admin:      { bg: "var(--color-badge-bg)",    color: "var(--color-badge-text)" },
  sdr:        { bg: "var(--color-info-bg)",     color: "var(--color-info-text)" },
  sales:      { bg: "var(--color-success-bg)",  color: "var(--color-success)" },
  accountant: { bg: "var(--color-warning-bg)",  color: "var(--color-warning)" },
};

export function RoleSessionPill({ roleName, label }: { roleName: string | null; label?: string | null }) {
  if (!roleName) return null;
  const style = ROLE_STYLES[roleName] ?? { bg: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ background: style.bg, color: style.color }}
    >
      {label ?? roleName}
    </span>
  );
}

// ─── Shared card ──────────────────────────────────────────────────────────────

export interface UserSessionCardProps {
  fullName: string | null;
  roleName: string | null;
  /** Display label for the role pill (e.g. "Sales Rep"). Falls back to roleName. */
  roleLabel?: string | null;
  active: boolean;
  autoSignouts: number;
  totalSessions: number;
  totalMinutes: number;
  lastSignedInAt: string | null;
  /** When true, numeric values are replaced with a redacted placeholder. */
  valuesHidden?: boolean;
  /** Extra content rendered below the stats row (e.g. work metrics). */
  children?: ReactNode;
}

export function UserSessionCard({
  fullName,
  roleName,
  roleLabel,
  active,
  autoSignouts,
  totalSessions,
  totalMinutes,
  lastSignedInAt,
  valuesHidden = false,
  children,
}: UserSessionCardProps) {
  const initial = (fullName ?? "?")[0].toUpperCase();

  return (
    <div
      className="rounded-[10px] border p-4 space-y-3"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      {/* ── Header: avatar + name + role + auto-signout warning ─────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar with online dot */}
          <div className="relative shrink-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold"
              style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
            >
              {initial}
            </div>
            <span
              className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full"
              style={{
                background: active ? "var(--color-success)" : "var(--color-border)",
                outline: "2px solid var(--color-surface)",
              }}
            />
          </div>

          {/* Name + role */}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {fullName ?? "—"}
            </p>
            <RoleSessionPill roleName={roleName} label={roleLabel} />
          </div>
        </div>

        {/* Auto sign-out badge */}
        {!valuesHidden && autoSignouts > 0 && (
          <div
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0"
            style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {autoSignouts} idle
          </div>
        )}
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-3 gap-2 pt-1"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-muted)" }}>
            Sessions
          </p>
          <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {valuesHidden ? "—" : totalSessions}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-muted)" }}>
            Active time
          </p>
          <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {valuesHidden ? "—" : formatSessionDuration(totalMinutes)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--color-text-muted)" }}>
            Last seen
          </p>
          <p
            className="text-[12px] font-medium"
            style={{ color: active ? "var(--color-success)" : "var(--color-text-muted)" }}
            title={lastSignedInAt ? sessionAbsoluteTime(lastSignedInAt) : undefined}
          >
            {active
              ? "Active now"
              : lastSignedInAt
                ? relativeTime(lastSignedInAt)
                : "—"}
          </p>
        </div>
      </div>

      {/* ── Extra content (work metrics, claimed leads, etc.) ─────────────── */}
      {children}
    </div>
  );
}
