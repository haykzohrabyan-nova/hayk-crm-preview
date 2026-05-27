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
): T {
  if (roleName === "admin" || roleName === "accountant") return query;
  if (roleName === "sales" && userId) {
    return query.or(`created_by_id.eq.${userId},ticket_status.eq.routed`) as T;
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
): T {
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
): Promise<number> {
  return countExact(admin, "job_tickets", (q) =>
    configure(scopeCompletedTicketsQuery(q, roleName, userId)),
  );
}

/** Orders-page exclusion: evidence submitted but payment not confirmed. */
export const ORDERS_VISIBLE_PAYMENT_FILTER =
  "payment_evidence_submitted_at.is.null,payment_evidence_url.is.null,payment_paid_at.not.is.null";

/** Tab/count badge exclusion (legacy — url set but not paid). */
export const ORDERS_COUNT_PAYMENT_FILTER =
  "payment_evidence_url.is.null,payment_paid_at.not.is.null";

/** Build a scoped job_tickets count query. */
export function scopedTicketCount(
  admin: AdminClient,
  roleName: string | null,
  userId: string | null,
  configure: (q: CountQuery) => CountQuery,
): Promise<number> {
  return countExact(admin, "job_tickets", (q) =>
    configure(scopeJobTicketsQuery(q, roleName, userId)),
  );
}
