"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime, formatDateTime } from "@/lib/utils/format";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ActivityActor {
  id: string;
  full_name: string | null;
  role_name: string | null;
}

interface ActivityCustomer {
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface ActivityItem {
  id: string;
  type: string;
  label: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor: ActivityActor | null;
  customer: ActivityCustomer | null;
  ticket_ref: string | null;
}

function TicketRefBadge({ ref }: { ref: string }) {
  const isOrder = ref.startsWith("ORD-");
  const isQuote = ref.startsWith("QUO-");
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium font-mono"
      style={{
        background: isOrder
          ? "var(--color-success-bg)"
          : isQuote
            ? "var(--color-info-bg)"
            : "var(--color-neutral-bg)",
        color: isOrder
          ? "var(--color-success)"
          : isQuote
            ? "var(--color-info-text)"
            : "var(--color-neutral-text)",
      }}
    >
      {ref}
    </span>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────


function customerName(c: ActivityCustomer | null): string | null {
  if (!c) return null;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return name || c.company || null;
}

const ROLE_STYLES: Record<string, { bg: string; color: string }> = {
  admin: { bg: "var(--color-badge-bg)", color: "var(--color-badge-text)" },
  sdr:   { bg: "var(--color-info-bg)", color: "var(--color-info-text)" },
  sales: { bg: "var(--color-success-bg)", color: "var(--color-success)" },
};

function RolePill({ role }: { role: string | null }) {
  if (!role) return null;
  const style = ROLE_STYLES[role] ?? { bg: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ background: style.bg, color: style.color }}
    >
      {role}
    </span>
  );
}

// ─── Table skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
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
          {[40, 55, 35, 20, 20].map((w, j) => (
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

// ─── Main component ─────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export function ActivityLogSection() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchActivities = useCallback(async (currentOffset: number, append: boolean) => {
    if (currentOffset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(`/api/admin/activity-log?limit=${PAGE_SIZE}&offset=${currentOffset}`);
      const data = await res.json();
      if (append) {
        setActivities((prev) => [...prev, ...(data.activities ?? [])]);
      } else {
        setActivities(data.activities ?? []);
      }
      setTotal(data.total ?? 0);
    } catch {
      // silently ignore fetch errors
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities(0, false);
  }, [fetchActivities]);

  // Realtime: auto-prepend new activity rows as they arrive — no manual refresh needed
  useEffect(() => {
    function onActivitiesChanged() {
      // Re-fetch page 1 and replace the list so new events appear at the top
      fetchActivities(0, false);
      setOffset(0);
    }
    window.addEventListener("bazaar:activities-changed", onActivitiesChanged);
    return () => window.removeEventListener("bazaar:activities-changed", onActivitiesChanged);
  }, [fetchActivities]);

  function loadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    fetchActivities(next, true);
  }

  const hasMore = activities.length < total;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Activity className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          <h2 className="text-[18px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Activity Log
          </h2>
          {!loading && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
            >
              {total.toLocaleString()} events
            </span>
          )}
        </div>
      </div>

      <div className="border-t" style={{ borderColor: "var(--color-border)" }} />

      {/* Desktop table */}
      <div
        className="hidden sm:block overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--color-border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
              {["Who", "Action", "Lead / Customer", "Quote / Order", "When"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left"
                  style={{
                    fontSize: 11, fontWeight: 500, textTransform: "uppercase",
                    letterSpacing: "0.06em", color: "var(--color-text-muted)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <Skeleton />
            ) : activities.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  No activity recorded yet.
                </td>
              </tr>
            ) : (
              activities.map((a, i) => (
                <tr
                  key={a.id}
                  style={{
                    background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                    borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
                    minHeight: 52,
                  }}
                >
                  {/* Who */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                        {a.actor?.full_name ?? "System"}
                      </span>
                      <RolePill role={a.actor?.role_name ?? null} />
                    </div>
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3">
                    <span className="text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                      {a.label}
                    </span>
                  </td>

                  {/* Lead / Customer */}
                  <td className="px-4 py-3">
                    <span className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                      {customerName(a.customer) ?? "—"}
                    </span>
                  </td>

                  {/* Quote / Order */}
                  <td className="px-4 py-3">
                    {a.ticket_ref ? (
                      <TicketRefBadge ref={a.ticket_ref} />
                    ) : (
                      <span className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>—</span>
                    )}
                  </td>

                  {/* When */}
                  <td className="px-4 py-3">
                    <span
                      className="text-[12px] cursor-default"
                      title={formatDateTime(a.created_at)}
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {relativeTime(a.created_at)}
                    </span>
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
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[10px] border p-4 space-y-2 animate-pulse"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="h-3.5 w-40 rounded" style={{ background: "var(--color-border)" }} />
              <div className="h-3 w-56 rounded" style={{ background: "var(--color-border)" }} />
            </div>
          ))
        ) : activities.length === 0 ? (
          <div
            className="rounded-[10px] border p-8 text-center text-sm"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            No activity recorded yet.
          </div>
        ) : (
          activities.map((a) => (
            <div
              key={a.id}
              className="rounded-[10px] border p-4 space-y-2"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                    {a.actor?.full_name ?? "System"}
                  </span>
                  <RolePill role={a.actor?.role_name ?? null} />
                </div>
                <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  {relativeTime(a.created_at)}
                </span>
              </div>
              <div className="text-[12px] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                <div>{a.label}</div>
                {customerName(a.customer) && (
                  <div style={{ color: "var(--color-text-muted)" }}>{customerName(a.customer)}</div>
                )}
                {a.ticket_ref && (
                  <div className="pt-0.5">
                    <TicketRefBadge ref={a.ticket_ref} />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
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
            {loadingMore ? "Loading…" : `Load more (${total - activities.length} remaining)`}
          </Button>
        </div>
      )}
    </div>
  );
}
