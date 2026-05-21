/** Shared display helpers — use these instead of copying fmt/relativeTime into components. */

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
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

export function isDueSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const diffDays = (parseLocalDate(dateStr).getTime() - Date.now()) / 86400000;
  return diffDays <= 2 && diffDays >= 0;
}

export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return parseLocalDate(dateStr) < new Date();
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
