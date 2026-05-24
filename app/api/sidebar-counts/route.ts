import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  countExact,
  scopedTicketCount,
} from "@/lib/utils/db-counts";

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const counts: Record<string, number> = {};

  const isSdr = roleName === "sdr" || roleName === "admin";

  try {
    await Promise.all([
      // /leads badge — unclaimed active leads only (Pending or Validated, no owner yet).
      isSdr
        ? countExact(admin, "leads", (q) =>
            q
              .eq("is_inbox", false)
              .in("status", ["Pending", "Validated"])
              .is("locked_by_id", null),
          ).then((n) => { counts["/leads"] = n; })
        : Promise.resolve(),

      // /sales badge — Sales Pipeline
      roleName === "sales"
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
                .eq("sales_owner_id", userId!)
                .in("sales_status", ["Ongoing", "Quote Sent"]),
            ),
          ]).then(([unclaimed, myActive]) => {
            counts["/sales"] = unclaimed + myActive;
          })
        : roleName === "admin"
        ? countExact(admin, "leads", (q) =>
            q
              .eq("is_inbox", false)
              .eq("status", "Routed to Sales")
              .in("sales_status", ["Ongoing", "Quote Sent"]),
          ).then((n) => { counts["/sales"] = n; })
        : Promise.resolve(),

      // /quotes badge — draft, sent, approved + routed (for sales/admin)
      (async () => {
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
      })(),

      // /orders badge — pending payment + in production (includes evidence-pending orders)
      Promise.all([
        scopedTicketCount(admin, roleName, userId, (q) => q.eq("ticket_status", "order")),
        scopedTicketCount(admin, roleName, userId, (q) =>
          q.eq("ticket_status", "in_production"),
        ),
      ]).then(([pendingOrders, inProduction]) => {
        counts["/orders"] = pendingOrders + inProduction;
      }),

      // /payments badge — orders with evidence submitted but not yet confirmed
      roleName === "accountant" || roleName === "admin"
        ? countExact(admin, "job_tickets", (q) =>
            q
              .not("payment_evidence_url", "is", null)
              .is("payment_paid_at", null)
              .in("ticket_status", ["sent", "order", "in_production", "completed"]),
          ).then((n) => { counts["/payments"] = n; })
        : Promise.resolve(),

      // /completed badge — completed orders (global count for admin/accountant)
      roleName === "accountant" || roleName === "admin"
        ? countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "completed")).then(
            (n) => { counts["/completed"] = n; },
          )
        : Promise.resolve(),
    ]);

    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
