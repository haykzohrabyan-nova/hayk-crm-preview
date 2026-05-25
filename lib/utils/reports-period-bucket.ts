import type { ReportTimelineMode } from "@/lib/utils/reports-date-range";

/** Timeline bucket labels for reports cash-over-time charts. */
export function reportsTimelineBucket(iso: string, timelineMode: ReportTimelineMode | string): string {
  const d = new Date(iso);
  if (timelineMode === "day") {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (timelineMode === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
