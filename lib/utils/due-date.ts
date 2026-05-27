import { formatDate, parseLocalDate } from "@/lib/utils/format";

/** YYYY-MM-DD in local timezone from an ISO timestamp. */
export function localDateStringFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today as YYYY-MM-DD (local). */
export function todayLocalDateString(): string {
  return localDateStringFromIso(new Date().toISOString());
}

/** Last millisecond of the due date's calendar day (local). */
export function dueDateEndOfDayMs(dateStr: string): number {
  return parseLocalDate(dateStr).getTime() + 86400000 - 1;
}

/** Due dates are end-of-day — overdue only after that day ends. */
export function isDueDateOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return dueDateEndOfDayMs(dateStr) < Date.now();
}

/**
 * Due date (YYYY-MM-DD) must be on or after the creation calendar day.
 * Same-day is allowed (due by end of that day, which is after creation time).
 */
export function validateDueDateAgainstCreated(
  dueDate: string,
  createdAtIso: string,
): string | null {
  if (!dueDate?.trim()) return null;
  const minDate = localDateStringFromIso(createdAtIso);
  if (dueDate < minDate) {
    return `Due date cannot be before ${formatDate(minDate)} (when this quote was created).`;
  }
  return null;
}

/** Earliest selectable due date for a new quote (created now). */
export function minDueDateForNewTicket(): string {
  return todayLocalDateString();
}
