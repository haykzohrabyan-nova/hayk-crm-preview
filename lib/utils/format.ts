import { dueDateEndOfDayMs } from "@/lib/utils/due-date";

/** Shared display helpers — use these instead of copying fmt/relativeTime into components. */

/** Round to cents — use for all money totals in API responses. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

/**
 * Like formatCurrency but returns null instead of "—" when the value is
 * non-finite (unknown / not-a-number). Used in timeline/history sections
 * to decide whether to render a money field at all.
 */
export function formatCurrencyOrNull(n: unknown): string | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return formatCurrency(v);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Numeric US date for compact tables (e.g. "6/29/2026"). */
export function formatDateNumeric(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

/** Local time (e.g. "2:30 PM") when the timestamp is today; otherwise numeric date. */
export function formatTimeTodayOrDateNumeric(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return formatDateNumeric(iso);
}

/** Parse YYYY-MM-DD as local midnight (not UTC). */
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

/** Calendar due date is today (local timezone). */
export function isDueToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const due = parseLocalDate(dateStr);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

export function isDueSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const diffDays = (parseLocalDate(dateStr).getTime() - Date.now()) / 86400000;
  return diffDays <= 2 && diffDays >= 0;
}

/** Due date is end-of-day local — not overdue until that calendar day ends. */
export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return dueDateEndOfDayMs(dateStr) < Date.now();
}

export interface ContactLike {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
}

/** Company name if set, otherwise first + last name. */
export function displayContactName(
  customer: ContactLike | null | undefined,
  opts?: { preferPerson?: boolean },
): string {
  if (!customer) return "—";
  if (!opts?.preferPerson && customer.company) return customer.company;
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  return name || customer.company || "—";
}

/**
 * Long-form date for documents and print routes (e.g. "June 19, 2026").
 * Use formatDate for short form ("Jun 19, 2026") or formatDateTime for date + time.
 */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Compact currency for dashboard KPI cards (e.g. $1.2K, $3.5M). */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Calendar-day relative label for join/created dates — uses day granularity
 * ("Today", "Yesterday", "5d ago") rather than the minute/hour granularity
 * of relativeTime(). Use for displaying when a user account was created.
 */
export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
