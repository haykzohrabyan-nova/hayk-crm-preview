"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, ChevronDown, Clock, AlertTriangle, Circle } from "lucide-react";
import {
  UserSessionCard,
  RoleSessionPill,
  formatSessionDuration,
  sessionAbsoluteTime,
} from "@/components/admin/user-session-card";
import { Button } from "@/components/ui/button";
import type { UserSession, UserSessionSummary } from "@/lib/types";


// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr
          key={i}
          style={{
            background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
            borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
          }}
        >
          {[35, 25, 20, 12, 15].map((w, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-3.5 animate-pulse rounded"
                style={{ background: "var(--color-border)", width: `${w}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const RANGE_OPTIONS = [
  { label: "Today",       value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days",value: "30d" },
];

function rangeFrom(value: string): string {
  const now = new Date();
  if (value === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = value === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function UserActivitySection() {
  const [summary, setSummary] = useState<UserSessionSummary[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterRange, setFilterRange] = useState<string>("7d");

  const fetchData = useCallback(async (currentOffset: number, append: boolean, userId: string, range: string) => {
    if (currentOffset === 0) setLoading(true);
    else setLoadingMore(true);

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(currentOffset),
      from: rangeFrom(range),
    });
    if (userId) params.set("user_id", userId);

    try {
      const res = await fetch(`/api/admin/sessions?${params}`);
      const data = await res.json();

      if (append) {
        setSessions((prev) => [...prev, ...(data.sessions ?? [])]);
      } else {
        setSessions(data.sessions ?? []);
        setSummary(data.summary ?? []);
      }
      setTotal(data.total ?? 0);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setOffset(0);
    fetchData(0, false, filterUserId, filterRange);
  }, [fetchData, filterUserId, filterRange]);

  function loadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    fetchData(next, true, filterUserId, filterRange);
  }

  const hasMore = sessions.length < total;
  const activeNow = summary.filter((u) => u.currently_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Users className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          <h2 className="text-[18px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            User Activity
          </h2>
          {activeNow > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium flex items-center gap-1"
              style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
            >
              <Circle className="h-1.5 w-1.5 fill-current" />
              {activeNow} active now
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Range selector */}
          <div className="flex rounded-[6px] overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterRange(opt.value)}
                className="px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  background: filterRange === opt.value ? "var(--color-btn-verify-bg)" : "var(--color-surface)",
                  color: filterRange === opt.value ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
                  borderRight: opt.value !== "30d" ? "1px solid var(--color-border)" : undefined,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* User filter */}
          {summary.length > 0 && (
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="rounded-[6px] border px-2.5 py-1.5 text-[12px] outline-none"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            >
              <option value="">All users</option>
              {summary.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name ?? "Unknown"}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="border-t" style={{ borderColor: "var(--color-border)" }} />

      {/* Per-user KPI cards */}
      {!loading && summary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {summary.map((u) => (
            <UserSessionCard
              key={u.user_id}
              fullName={u.full_name}
              roleName={u.role_name}
              active={u.currently_active}
              autoSignouts={u.auto_signouts}
              totalSessions={u.total_sessions}
              totalMinutes={u.total_minutes}
              lastSignedInAt={u.last_signed_in_at}
            />
          ))}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[10px] border p-4 space-y-3 animate-pulse"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full" style={{ background: "var(--color-border)" }} />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-28 rounded" style={{ background: "var(--color-border)" }} />
                  <div className="h-2.5 w-12 rounded" style={{ background: "var(--color-border)" }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="space-y-1">
                    <div className="h-2 w-10 rounded" style={{ background: "var(--color-border)" }} />
                    <div className="h-4 w-8 rounded" style={{ background: "var(--color-border)" }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Session history table — desktop */}
      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          Session History
        </p>

        <div
          className="hidden sm:block overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--color-border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
                {["User", "Signed In", "Signed Out", "Duration", "Reason"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left"
                    style={{
                      fontSize: 11, fontWeight: 500,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton />
              ) : sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    No sessions recorded for this period.
                  </td>
                </tr>
              ) : (
                sessions.map((s, i) => (
                  <tr
                    key={s.id}
                    style={{
                      background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                      borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                      minHeight: 52,
                    }}
                  >
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                          {s.full_name ?? "Unknown"}
                        </span>
                        <RoleSessionPill roleName={s.role_name} />
                      </div>
                    </td>

                    {/* Signed in */}
                    <td className="px-4 py-3">
                      <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                        {sessionAbsoluteTime(s.signed_in_at)}
                      </span>
                    </td>

                    {/* Signed out */}
                    <td className="px-4 py-3">
                      {s.signed_out_at ? (
                        <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                          {sessionAbsoluteTime(s.signed_out_at)}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-[12px] font-medium"
                          style={{ color: "var(--color-success)" }}
                        >
                          <Circle className="h-1.5 w-1.5 fill-current" />
                          Active now
                        </span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3">
                      <span className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                        {s.duration_minutes != null
                          ? formatSessionDuration(s.duration_minutes)
                          : "—"}
                      </span>
                    </td>

                    {/* Reason */}
                    <td className="px-4 py-3">
                      {s.sign_out_reason === "auto" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Auto (idle)
                        </span>
                      ) : s.sign_out_reason === "manual" ? (
                        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                          Manual
                        </span>
                      ) : s.sign_out_reason === "deactivated" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
                        >
                          Deactivated
                        </span>
                      ) : s.sign_out_reason ? (
                        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                          {s.sign_out_reason}
                        </span>
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="flex flex-col gap-3 sm:hidden">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[10px] border p-4 space-y-2 animate-pulse"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                <div className="h-3.5 w-36 rounded" style={{ background: "var(--color-border)" }} />
                <div className="h-3 w-48 rounded" style={{ background: "var(--color-border)" }} />
                <div className="h-3 w-32 rounded" style={{ background: "var(--color-border)" }} />
              </div>
            ))
          ) : sessions.length === 0 ? (
            <div
              className="rounded-[10px] border p-8 text-center text-sm"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
            >
              No sessions recorded for this period.
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-[10px] border p-4 space-y-2"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                      {s.full_name ?? "Unknown"}
                    </span>
                    <RoleSessionPill roleName={s.role_name} />
                  </div>
                  {s.sign_out_reason === "auto" && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-warning)" }} />
                  )}
                </div>
                <div className="text-[12px] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                  <div className="flex justify-between">
                    <span className="uppercase tracking-wide font-medium text-[10px]">Signed in</span>
                    <span>{sessionAbsoluteTime(s.signed_in_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="uppercase tracking-wide font-medium text-[10px]">Signed out</span>
                    <span>
                      {s.signed_out_at ? sessionAbsoluteTime(s.signed_out_at) : (
                        <span style={{ color: "var(--color-success)" }}>Active now</span>
                      )}
                    </span>
                  </div>
                  {s.duration_minutes != null && (
                    <div className="flex justify-between">
                      <span className="uppercase tracking-wide font-medium text-[10px]">Duration</span>
                      <span>{formatSessionDuration(s.duration_minutes)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="uppercase tracking-wide font-medium text-[10px]">Reason</span>
                    <span>{s.sign_out_reason ?? "—"}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Load more */}
      {hasMore && !loading && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            className="gap-1.5"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {loadingMore ? "Loading…" : `Load more (${total - sessions.length} remaining)`}
          </Button>
        </div>
      )}

      {/* Empty state — no data at all */}
      {!loading && summary.length === 0 && (
        <div
          className="rounded-[10px] border p-10 text-center"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <Clock className="mx-auto h-8 w-8 mb-3" style={{ color: "var(--color-text-muted)" }} />
          <p className="text-[14px] font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
            No sessions recorded yet
          </p>
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Sessions are logged when users sign in and out. Data will appear here once users log in.
          </p>
        </div>
      )}
    </div>
  );
}
