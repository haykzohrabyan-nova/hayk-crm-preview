import { endOfLocalDay } from "@/lib/utils/reports-date-range";
import { formatDate } from "@/lib/utils/format";

/** Shared period boundaries for dashboard and reports KPIs. */
export function getPeriodStart(period: string): Date {
  const now = new Date();
  if (period === "week") {
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }
  if (period === "quarter") {
    const quarter = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), quarter * 3, 1);
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** End of today — matches Reports preset ranges (start → now). */
export function getPeriodEnd(): Date {
  return endOfLocalDay(new Date());
}

export function getDashboardPeriodBounds(period: string): {
  periodStartIso: string;
  periodEndIso: string;
} {
  return {
    periodStartIso: getPeriodStart(period).toISOString(),
    periodEndIso: getPeriodEnd().toISOString(),
  };
}

export const PERIOD_LABELS: Record<string, string> = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
};

/** Human-readable range for the active period filter (start → today). */
export function formatPeriodRange(periodStartIso: string): string {
  return `${formatDate(periodStartIso)} – ${formatDate(new Date().toISOString())}`;
}
