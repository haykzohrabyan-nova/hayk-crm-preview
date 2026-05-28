import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
export type CountQuery = ReturnType<ReturnType<AdminClient["from"]>["select"]>;
export type TicketSelectQuery = CountQuery;

/** Lightweight SQL count — avoids fetching rows into Node.js. */
export async function countExact(
  admin: AdminClient,
  table: string,
  configure: (q: CountQuery) => CountQuery,
): Promise<number> {
  const { count, error } = await configure(
    admin.from(table).select("id", { count: "exact", head: true }),
  );
  if (error) throw error;
  return count ?? 0;
}

/** Match GET /api/tickets role scoping for job_tickets list/count queries. */
export function scopeJobTicketsQuery<T extends CountQuery>(
  query: T,
  roleName: string | null,
  userId: string | null,
  adminFilterUserId?: string | null,
): T {
  if (roleName === "admin" && adminFilterUserId) {
    return query.eq("created_by_id", adminFilterUserId) as T;
  }
  if (roleName === "admin" || roleName === "accountant") return query;
  if (roleName === "sales" && userId) {
    return query.or(`created_by_id.eq.${userId},ticket_status.eq.routed`) as T;
  }
  /** SDR: own tickets only — same rule as Quotes list and Completed (not routed_by_id). */
  if (roleName === "sdr" && userId) {
    return query.eq("created_by_id", userId) as T;
  }
  if (userId) {
    return query.or(`created_by_id.eq.${userId},routed_by_id.eq.${userId}`) as T;
  }
  return query;
}

/** Completed list: SDR sees only tickets they created — not orders Sales completed after a routed hand-off. */
export function scopeCompletedTicketsQuery<T extends CountQuery>(
  query: T,
  roleName: string | null,
  userId: string | null,
  adminFilterUserId?: string | null,
): T {
  if (roleName === "admin" && adminFilterUserId) {
    return query.eq("created_by_id", adminFilterUserId) as T;
  }
  if (roleName === "admin" || roleName === "accountant") return query;
  if (userId) {
    return query.eq("created_by_id", userId) as T;
  }
  return query;
}

/** Build a scoped completed-ticket count query. */
export function scopedCompletedTicketCount(
  admin: AdminClient,
  roleName: string | null,
  userId: string | null,
  configure: (q: CountQuery) => CountQuery,
  adminFilterUserId?: string | null,
): Promise<number> {
  return countExact(admin, "job_tickets", (q) =>
    configure(scopeCompletedTicketsQuery(q, roleName, userId, adminFilterUserId)),
  );
}

/** Orders-page exclusion: evidence submitted but not yet reviewed by accountant. */
export const ORDERS_VISIBLE_PAYMENT_FILTER =
  "payment_evidence_submitted_at.is.null,payment_evidence_url.is.null,payment_evidence_reviewed_at.not.is.null";

/** Tab/count badge exclusion (evidence awaiting review). */
export const ORDERS_COUNT_PAYMENT_FILTER =
  "payment_evidence_url.is.null,payment_evidence_reviewed_at.not.is.null";

/** Build a scoped job_tickets count query. */
export function scopedTicketCount(
  admin: AdminClient,
  roleName: string | null,
  userId: string | null,
  configure: (q: CountQuery) => CountQuery,
  adminFilterUserId?: string | null,
): Promise<number> {
  return countExact(admin, "job_tickets", (q) =>
    configure(scopeJobTicketsQuery(q, roleName, userId, adminFilterUserId)),
  );
}
