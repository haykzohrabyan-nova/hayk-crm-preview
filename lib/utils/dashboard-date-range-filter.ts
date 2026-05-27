import {
  resolveSdrDashboardDateRange,
  type SdrDashboardDateRange,
  type SdrDashboardPreset,
} from "@/lib/utils/sdr-dashboard-date-range";
import {
  defaultCustomFromDate,
  defaultCustomToDate,
} from "@/lib/utils/reports-date-range";

export type DashboardDateRangePreset = SdrDashboardPreset;

export interface DashboardDateRangeFilterValue {
  preset: DashboardDateRangePreset;
  dateFrom: string;
  dateTo: string;
}

export function defaultDashboardDateRangeFilterValue(
  preset: DashboardDateRangePreset = "today",
): DashboardDateRangeFilterValue {
  return {
    preset,
    dateFrom: defaultCustomFromDate(),
    dateTo: defaultCustomToDate(),
  };
}

export function resolveDashboardDateRangeFilter(
  value: DashboardDateRangeFilterValue,
): SdrDashboardDateRange | null {
  const resolved = resolveSdrDashboardDateRange(value.preset, value.dateFrom, value.dateTo);
  if ("error" in resolved) return null;
  return resolved;
}

/** True when an ISO timestamp falls within a resolved dashboard range (inclusive). */
export function isoTimestampInDashboardRange(
  iso: string,
  range: SdrDashboardDateRange,
): boolean {
  const t = new Date(iso).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}
