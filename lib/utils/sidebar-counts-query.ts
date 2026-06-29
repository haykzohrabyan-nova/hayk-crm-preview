import type { createAdminClient } from "@/lib/supabase/admin";
import {
  countExact,
  scopedCompletedTicketCount,
  scopedTicketCount,
} from "@/lib/utils/db-counts";
import { excludeRefundedTickets } from "@/lib/utils/exclude-refunded-tickets";

type AdminClient = ReturnType<typeof createAdminClient>;

export type SidebarCountsOptions = {
  roleName: string;
  userId: string;
  /** When set, only compute badges for these nav routes (e.g. `/quotes`, `/orders`). */
  visibleRoutes?: Set<string>;
};

function shouldCount(route: string, visibleRoutes?: Set<string>) {
  return !visibleRoutes || visibleRoutes.has(route);
}

export async function fetchSidebarCounts(
  admin: AdminClient,
  { roleName, userId, visibleRoutes }: SidebarCountsOptions,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const isSdr = roleName === "sdr" || roleName === "admin";

  await Promise.all([
    isSdr && shouldCount("/leads", visibleRoutes)
      ? countExact(admin, "leads", (q) => {
          let query = q
            .eq("is_inbox", false)
            .in("status", ["Pending", "Validated"])
            .or("sales_status.is.null,sales_status.neq.Won");
          // SDR-only: only count unclaimed leads in the pool (matches the "All" tab behaviour for SDR)
          if (roleName === "sdr") {
            query = query.is("locked_by_id", null);
          }
          return query;
        }).then((n) => {
          counts["/leads"] = n;
        })
      : Promise.resolve(),

    shouldCount("/sales", visibleRoutes)
      ? roleName === "sales"
        ? Promise.all([
            countExact(admin, "leads", (q) =>
              q
                .eq("is_inbox", false)
                .eq("status", "Routed to Sales")
                .is("sales_owner_id", null),
            ),
            countExact(admin, "leads", (q) =>
              q
                .eq("is_inbox", false)
                .eq("status", "Routed to Sales")
                .eq("sales_owner_id", userId)
                .in("sales_status", ["Claimed", "In Progress", "Quote Sent"]),
            ),
          ]).then(([unclaimed, myActive]) => {
            counts["/sales"] = unclaimed + myActive;
          })
        : roleName === "admin"
          ? countExact(admin, "leads", (q) =>
              q
                .eq("is_inbox", false)
                .eq("status", "Routed to Sales")
                .in("sales_status", ["Claimed", "In Progress", "Quote Sent"]),
            ).then((n) => {
              counts["/sales"] = n;
            })
          : Promise.resolve()
      : Promise.resolve(),

    shouldCount("/quotes", visibleRoutes)
      ? (async () => {
          const [drafts, sent, approved] = await Promise.all([
            scopedTicketCount(admin, roleName, userId, (q) =>
              q.eq("ticket_kind", "quote").eq("ticket_status", "draft"),
            ),
            scopedTicketCount(admin, roleName, userId, (q) =>
              q.eq("ticket_kind", "quote").eq("ticket_status", "sent"),
            ),
            scopedTicketCount(admin, roleName, userId, (q) =>
              q.eq("ticket_kind", "quote").eq("ticket_status", "approved"),
            ),
          ]);

          let quoteCount = drafts + sent + approved;

          if (roleName === "sales" || roleName === "admin") {
            const routedCount = await countExact(admin, "job_tickets", (q) =>
              q.eq("ticket_status", "routed"),
            );
            quoteCount += routedCount;
          }

          counts["/quotes"] = quoteCount;
        })()
      : Promise.resolve(),

    shouldCount("/orders", visibleRoutes)
      ? Promise.all([
          scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "order")),
          scopedTicketCount(admin, roleName, userId, (q) =>
            excludeRefundedTickets(q.eq("ticket_status", "in_production")),
          ),
        ]).then(([pendingOrders, inProduction]) => {
          counts["/orders"] = pendingOrders + inProduction;
        })
      : Promise.resolve(),

    (roleName === "accountant" || roleName === "admin") &&
    shouldCount("/payments", visibleRoutes)
      ? countExact(admin, "job_tickets", (q) =>
          excludeRefundedTickets(
            q
              .not("payment_evidence_submitted_at", "is", null)
              .is("payment_evidence_reviewed_at", null)
              .or("payment_evidence_url.not.is.null,stripe_payment_intent_id.not.is.null")
              .in("ticket_status", ["sent", "order", "in_production", "completed"]),
          ),
        ).then((n) => {
          counts["/payments"] = n;
        })
      : Promise.resolve(),

    (roleName === "accountant" || roleName === "admin" || roleName === "sdr") &&
    shouldCount("/completed", visibleRoutes)
      ? (roleName === "admin" || roleName === "accountant"
          ? countExact(admin, "job_tickets", (q) =>
              excludeRefundedTickets(q.eq("ticket_status", "completed")),
            )
          : scopedCompletedTicketCount(admin, roleName, userId, (q) =>
              excludeRefundedTickets(q.eq("ticket_status", "completed")),
            )
        ).then((n) => {
          counts["/completed"] = n;
        })
      : Promise.resolve(),

    shouldCount("/production", visibleRoutes)
      ? countExact(admin, "job_tickets", (q) =>
          excludeRefundedTickets(q.eq("ticket_status", "in_production")),
        ).then(
          (n) => {
            counts["/production"] = n;
          },
        )
      : Promise.resolve(),
  ]);

  return counts;
}
