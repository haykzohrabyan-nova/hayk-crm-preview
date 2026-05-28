/** Admin-only list filter: `?user_id=` on page-data / counts routes. */

export function parseAdminFilterUserId(
  searchParams: URLSearchParams,
  roleName: string | null,
): string | null {
  if (roleName !== "admin") return null;
  const id = searchParams.get("user_id")?.trim();
  return id || null;
}

export function appendAdminFilterUserId(
  params: URLSearchParams,
  roleName: string | null,
  filterUserId: string | null,
): void {
  if (roleName === "admin" && filterUserId) {
    params.set("user_id", filterUserId);
  }
}

/** Leads workspace — admin filter by credited SDR and/or current lock holder. */
export function applyAdminLeadUserFilter<T extends { or: (filter: string) => T; eq: (col: string, val: string) => T }>(
  query: T,
  roleName: string | null,
  filterUserId: string | null,
  mode: "all_tab" | "sdr_id",
): T {
  if (roleName !== "admin" || !filterUserId) return query;
  if (mode === "all_tab") {
    return query.or(`sdr_id.eq.${filterUserId},locked_by_id.eq.${filterUserId}`);
  }
  return query.eq("sdr_id", filterUserId);
}
