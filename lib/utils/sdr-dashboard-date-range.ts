import { endOfLocalDay, parseReportDateInput } from "@/lib/utils/reports-date-range";

export type SdrDashboardPreset = "today" | "yesterday" | "last_week" | "last_month" | "custom";

export interface SdrDashboardDateRange {
  preset: SdrDashboardPreset;
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  label: string;
  priorStart: Date;
  priorEnd: Date;
  priorStartIso: string;
  priorEndIso: string;
  priorLabel: string;
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Rolling N-day window ending today (inclusive). e.g. 7 → today + prior 6 days. */
function rollingDaysThroughToday(inclusiveDays: number): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startOfLocalDay(shiftDays(now, -(inclusiveDays - 1))),
    end: endOfLocalDay(now),
  };
}

function priorEquivalentRange(start: Date, end: Date): { start: Date; end: Date } {
  const ms = end.getTime() - start.getTime() + 1;
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - ms + 1);
  return { start: priorStart, end: priorEnd };
}

export const SDR_DASHBOARD_PRESET_LABELS: Record<Exclude<SdrDashboardPreset, "custom">, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_week: "Last 7 Days",
  last_month: "Last 30 Days",
};

const PRIOR_LABELS: Record<Exclude<SdrDashboardPreset, "custom">, string> = {
  today: "vs yesterday",
  yesterday: "vs prior day",
  last_week: "vs prior 7 days",
  last_month: "vs prior 30 days",
};

export function resolveSdrDashboardDateRange(
  preset: string,
  dateFrom?: string | null,
  dateTo?: string | null,
): SdrDashboardDateRange | { error: string } {
  const now = new Date();
  let start: Date;
  let end: Date;
  let label: string;
  let resolvedPreset: SdrDashboardPreset;
  let priorStart: Date;
  let priorEnd: Date;
  let priorLabel: string;

  if (preset === "custom") {
    const from = parseReportDateInput(dateFrom);
    const to = parseReportDateInput(dateTo);
    if (!from || !to) {
      return { error: "Both start and end dates are required for a custom range." };
    }
    if (from > to) {
      return { error: "Start date must be on or before end date." };
    }
    start = from;
    end = endOfLocalDay(to);
    label = "Custom";
    resolvedPreset = "custom";
    const prior = priorEquivalentRange(start, end);
    priorStart = prior.start;
    priorEnd = prior.end;
    priorLabel = "vs prior period";
  } else if (preset === "today") {
    start = startOfLocalDay(now);
    end = endOfLocalDay(now);
    label = SDR_DASHBOARD_PRESET_LABELS.today;
    resolvedPreset = "today";
    const y = shiftDays(start, -1);
    priorStart = startOfLocalDay(y);
    priorEnd = endOfLocalDay(y);
    priorLabel = PRIOR_LABELS.today;
  } else if (preset === "yesterday") {
    const y = shiftDays(now, -1);
    start = startOfLocalDay(y);
    end = endOfLocalDay(y);
    label = SDR_DASHBOARD_PRESET_LABELS.yesterday;
    resolvedPreset = "yesterday";
    const py = shiftDays(y, -1);
    priorStart = startOfLocalDay(py);
    priorEnd = endOfLocalDay(py);
    priorLabel = PRIOR_LABELS.yesterday;
  } else if (preset === "last_week") {
    ({ start, end } = rollingDaysThroughToday(7));
    label = SDR_DASHBOARD_PRESET_LABELS.last_week;
    resolvedPreset = "last_week";
    ({ start: priorStart, end: priorEnd } = priorEquivalentRange(start, end));
    priorLabel = PRIOR_LABELS.last_week;
  } else if (preset === "last_month") {
    ({ start, end } = rollingDaysThroughToday(30));
    label = SDR_DASHBOARD_PRESET_LABELS.last_month;
    resolvedPreset = "last_month";
    ({ start: priorStart, end: priorEnd } = priorEquivalentRange(start, end));
    priorLabel = PRIOR_LABELS.last_month;
  } else {
    return { error: "Invalid SDR dashboard preset." };
  }

  return {
    preset: resolvedPreset,
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label,
    priorStart,
    priorEnd,
    priorStartIso: priorStart.toISOString(),
    priorEndIso: priorEnd.toISOString(),
    priorLabel,
  };
}
