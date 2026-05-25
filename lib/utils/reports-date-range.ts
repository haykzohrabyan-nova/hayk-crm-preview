import { getPeriodStart, PERIOD_LABELS } from "@/lib/utils/get-period-start";
import { parseLocalDate } from "@/lib/utils/format";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ReportTimelineMode = "day" | "week" | "month";

export interface ReportDateRange {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  label: string;
  mode: "preset" | "custom";
  /** Preset key or "custom" — used for legacy timeline bucketing fallback */
  period: string;
  timelineMode: ReportTimelineMode;
}

export function parseReportDateInput(value: string | null | undefined): Date | null {
  const v = value?.trim();
  if (!v || !DATE_RE.test(v)) return null;
  return parseLocalDate(v);
}

export function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function timelineModeForDaySpan(days: number): ReportTimelineMode {
  if (days <= 14) return "day";
  if (days <= 90) return "week";
  return "month";
}

/** Resolve report filter window from preset period or custom YYYY-MM-DD range. */
export function resolveReportDateRange(
  period: string,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
): ReportDateRange | { error: string } {
  const from = parseReportDateInput(dateFrom);
  const to = parseReportDateInput(dateTo);

  if (from || to) {
    if (!from || !to) {
      return { error: "Both start and end dates are required for a custom range." };
    }
    if (from > to) {
      return { error: "Start date must be on or before end date." };
    }
    const end = endOfLocalDay(to);
    const days = Math.max(1, Math.ceil((end.getTime() - from.getTime()) / 86_400_000));
    return {
      start: from,
      end,
      startIso: from.toISOString(),
      endIso: end.toISOString(),
      label: "Custom range",
      mode: "custom",
      period: "custom",
      timelineMode: timelineModeForDaySpan(days),
    };
  }

  if (!["week", "month", "quarter"].includes(period)) {
    return { error: "Invalid period." };
  }

  const start = getPeriodStart(period);
  const end = endOfLocalDay(new Date());
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  const timelineMode: ReportTimelineMode =
    period === "week" ? "day" : period === "month" ? "week" : "month";

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: PERIOD_LABELS[period] ?? period,
    mode: "preset",
    period,
    timelineMode: period === "quarter" ? "month" : timelineMode,
  };
}

export function formatReportDateRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

/** Format a Date as YYYY-MM-DD for `<input type="date">`. */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** From / To values shown when a week/month/quarter preset is selected. */
export function presetDateInputs(period: string): { from: string; to: string } {
  if (!["week", "month", "quarter"].includes(period)) {
    return { from: defaultCustomFromDate(), to: defaultCustomToDate() };
  }
  return {
    from: toDateInputValue(getPeriodStart(period)),
    to: defaultCustomToDate(),
  };
}

/** Default custom range: first day of current month → today (for date input placeholders). */
export function defaultCustomFromDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function defaultCustomToDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
