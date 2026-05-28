"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildTicketLifecycleTimeline,
  findTicketCompletionActivity,
  formatTimelineStamp,
  type LifecycleTimelineNode,
  type TimelineActivity,
} from "@/lib/utils/ticket-lifecycle-timeline";
import { DetailCollapsibleSection } from "@/components/quotes/quote-detail/detail-layout-primitives";

const LINE_COLOR = "color-mix(in srgb, var(--color-accent) 55%, var(--color-border))";

const TONE_DOT: Record<string, string> = {
  start: "var(--color-accent)",
  milestone: "var(--color-info-text)",
  payment: "var(--color-success)",
  end: "var(--color-tab-active)",
  overdue: "var(--color-danger)",
  completed: "var(--color-success)",
  lead: "var(--color-info-text)",
};

function isCompletedNode(node: LifecycleTimelineNode): boolean {
  return node.tone === "completed";
}

function TimelineRing({ node }: { node: LifecycleTimelineNode }) {
  const dotColor = TONE_DOT[node.tone] ?? "var(--color-text-muted)";
  if (isCompletedNode(node)) {
    return (
      <div
        className="h-4 w-4 rounded-full shrink-0 z-[1]"
        style={{ background: "var(--color-success)" }}
      />
    );
  }
  return (
    <div
      className="h-3.5 w-3.5 rounded-full border-2 shrink-0 z-[1]"
      style={{ background: "var(--color-surface)", borderColor: dotColor }}
    />
  );
}

function TimelineTrackSegment({
  isFirst,
  isLast,
  node,
}: {
  isFirst: boolean;
  isLast: boolean;
  node: LifecycleTimelineNode;
}) {
  return (
    <div className="flex items-center w-full h-4 overflow-visible">
      {!isFirst ? (
        <div className="h-0.5 flex-1 min-w-0" style={{ background: LINE_COLOR }} />
      ) : null}
      <TimelineRing node={node} />
      {!isLast ? (
        <div className="h-0.5 flex-1 min-w-0" style={{ background: LINE_COLOR }} />
      ) : null}
    </div>
  );
}

function TimelineLabels({
  node,
  isFirst,
  isLast,
}: {
  node: LifecycleTimelineNode;
  isFirst: boolean;
  isLast: boolean;
}) {
  const dotColor = TONE_DOT[node.tone] ?? "var(--color-text-muted)";
  const stamp = formatTimelineStamp(node.at, node.dateOnly);
  const textAlign = isFirst ? "left" : isLast ? "right" : "center";
  const labelColor =
    node.tone === "overdue" ? "var(--color-danger)" : "var(--color-text-primary)";

  return (
    <div className="w-full min-w-0" style={{ textAlign }}>
      <p className="text-[14px] font-medium leading-snug" style={{ color: labelColor }}>
        {node.label}
      </p>
      <p className="text-[13px] tabular-nums leading-snug mt-1" style={{ color: "var(--color-text-muted)" }}>
        {stamp}
      </p>
      {node.actor ? (
        <p className="text-[13px] leading-snug font-medium break-words mt-1" style={{ color: dotColor }}>
          {node.actor}
        </p>
      ) : null}
      {node.detail ? (
        <p className="text-[13px] leading-snug break-words mt-1" style={{ color: "var(--color-text-muted)" }}>
          {node.detail}
        </p>
      ) : null}
    </div>
  );
}

function DesktopTimelineColumn({
  node,
  isFirst,
  isLast,
}: {
  node: LifecycleTimelineNode;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div
      className="flex flex-col flex-1 min-w-[118px] basis-0"
      style={{
        alignItems: isFirst ? "flex-start" : isLast ? "flex-end" : "center",
      }}
    >
      <TimelineTrackSegment isFirst={isFirst} isLast={isLast} node={node} />
      <div className="mt-3 w-full min-w-0 px-0.5">
        <TimelineLabels node={node} isFirst={isFirst} isLast={isLast} />
      </div>
    </div>
  );
}

function MobileTimelineNode({ node }: { node: LifecycleTimelineNode }) {
  const dotColor = TONE_DOT[node.tone] ?? "var(--color-text-muted)";
  const stamp = formatTimelineStamp(node.at, node.dateOnly);
  const labelColor =
    node.tone === "overdue" ? "var(--color-danger)" : "var(--color-text-primary)";
  const completed = isCompletedNode(node);

  return (
    <div className="flex gap-3 min-w-0">
      <div className="flex flex-col items-center shrink-0 pt-1">
        {completed ? (
          <div
            className="h-4 w-4 rounded-full shrink-0"
            style={{ background: "var(--color-success)" }}
          />
        ) : (
          <div
            className="h-3 w-3 rounded-full border-2"
            style={{ background: "var(--color-surface)", borderColor: dotColor }}
          />
        )}
        <div className="w-px flex-1 min-h-[12px] mt-1" style={{ background: "var(--color-border)" }} />
      </div>
      <div className="pb-5 min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug" style={{ color: labelColor }}>
          {node.label}
        </p>
        <p className="text-[14px] mt-1 tabular-nums leading-snug" style={{ color: "var(--color-text-muted)" }}>
          {stamp}
        </p>
        {node.actor ? (
          <p className="text-[14px] mt-1 font-medium leading-snug" style={{ color: dotColor }}>
            {node.actor}
          </p>
        ) : null}
        {node.detail ? (
          <p className="text-[14px] mt-1 leading-snug" style={{ color: "var(--color-text-muted)" }}>
            {node.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DesktopTimeline({ nodes }: { nodes: LifecycleTimelineNode[] }) {
  return (
    <div className="flex w-full items-start min-h-[112px] overflow-visible">
      {nodes.map((node, i) => (
        <DesktopTimelineColumn
          key={node.id}
          node={node}
          isFirst={i === 0}
          isLast={i === nodes.length - 1}
        />
      ))}
    </div>
  );
}

export function TicketLifecycleTimeline({
  ticketId,
  createdAt,
  dueDate,
  createdByName,
  isQuote,
  referenceCode,
  ticketStatus,
  completedAtFallback,
  onCompletedAt,
  leadCreatedAt,
  leadSource,
  customerCreatedAt,
  quoteSource,
  ticketKind,
}: {
  ticketId: string;
  createdAt: string;
  dueDate: string | null;
  createdByName?: string | null;
  isQuote?: boolean;
  referenceCode?: string | null;
  ticketStatus?: string | null;
  completedAtFallback?: string | null;
  onCompletedAt?: (iso: string | null) => void;
  leadCreatedAt?: string | null;
  leadSource?: string | null;
  customerCreatedAt?: string | null;
  quoteSource?: string | null;
  ticketKind?: string | null;
}) {
  const [activities, setActivities] = useState<TimelineActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(() => {
    fetch(`/api/activities?ticket_id=${encodeURIComponent(ticketId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.activities) setActivities(d.activities as TimelineActivity[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    window.addEventListener("bazaar:activities-changed", fetchActivities);
    return () => window.removeEventListener("bazaar:activities-changed", fetchActivities);
  }, [fetchActivities]);

  useEffect(() => {
    if (!onCompletedAt || ticketStatus !== "completed") return;
    const completion = findTicketCompletionActivity(activities);
    onCompletedAt(completion?.created_at ?? completedAtFallback ?? null);
  }, [activities, ticketStatus, completedAtFallback, onCompletedAt]);

  const nodes = useMemo(
    () =>
      buildTicketLifecycleTimeline({
        activities,
        createdAt,
        dueDate,
        createdByName,
        isQuote,
        referenceCode,
        ticketStatus,
        completedAtFallback,
        leadCreatedAt,
        leadSource,
        customerCreatedAt,
        quoteSource,
        ticketKind,
      }),
    [
      activities,
      createdAt,
      dueDate,
      createdByName,
      isQuote,
      referenceCode,
      ticketStatus,
      completedAtFallback,
      leadCreatedAt,
      leadSource,
      customerCreatedAt,
      quoteSource,
      ticketKind,
    ],
  );

  if (loading) {
    return (
      <div
        className="mb-6 rounded-xl border p-4 animate-pulse"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="h-3 w-24 rounded mb-4" style={{ background: "var(--color-border)" }} />
        <div className="h-2 w-full rounded" style={{ background: "var(--color-border)" }} />
      </div>
    );
  }

  if (nodes.length <= 1 && !dueDate) return null;

  return (
    <div
      className="mb-6 rounded-xl border p-4 md:p-5 overflow-visible"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "0 1px 3px color-mix(in srgb, var(--color-text-primary) 6%, transparent)",
      }}
    >
      <DetailCollapsibleSection title="Timeline" titleClassName="text-[11px] md:text-[12px] font-medium uppercase tracking-[0.08em]">
        <div className="md:hidden">
          {nodes.map((node) => (
            <MobileTimelineNode key={node.id} node={node} />
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto overflow-y-visible pt-0.5 pb-1">
          <DesktopTimeline nodes={nodes} />
        </div>
      </DetailCollapsibleSection>
    </div>
  );
}
