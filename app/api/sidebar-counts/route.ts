import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const counts: Record<string, number> = {};

  const isSdr = roleName === "sdr" || roleName === "admin";

  // Base ticket query scoped by role.
  // Accountant doesn't own tickets, so skip the created_by_id filter for them.
  const ticketQuery = () => {
    const q = admin.from("job_tickets").select("ticket_kind, ticket_status, created_by_id");
    const skipScope = roleName === "admin" || roleName === "accountant";
    return !skipScope && userId ? q.eq("created_by_id", userId) : q;
  };

  await Promise.all([
    // /leads badge — unclaimed active leads only (Pending or Validated, no owner yet).
    isSdr
      ? admin
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("is_inbox", false)
          .in("status", ["Pending", "Validated"])
          .is("locked_by_id", null)
          .then(({ count }) => { counts["/leads"] = count ?? 0; })
      : Promise.resolve(),

    // /sales badge — Sales Pipeline
    roleName === "sales"
      ? Promise.all([
          admin
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("is_inbox", false)
            .eq("status", "Routed to Sales")
            .is("sales_owner_id", null),
          admin
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("is_inbox", false)
            .eq("status", "Routed to Sales")
            .eq("sales_owner_id", userId)
            .in("sales_status", ["Ongoing", "Quote Sent"]),
        ]).then(([unclaimed, myActive]) => {
          counts["/sales"] = (unclaimed.count ?? 0) + (myActive.count ?? 0);
        })
      : roleName === "admin"
      ? admin
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("is_inbox", false)
          .eq("status", "Routed to Sales")
          .in("sales_status", ["Ongoing", "Quote Sent"])
          .then(({ count }) => { counts["/sales"] = count ?? 0; })
      : Promise.resolve(),

    // /quotes badge — draft, sent, approved (Won) + routed (for sales/admin)
    (async () => {
      const { data } = await ticketQuery()
        .eq("ticket_kind", "quote")
        .in("ticket_status", ["draft", "sent", "approved"]);
      let quoteCount = (data ?? []).length;

      // Sales/admin also see routed tickets
      if (roleName === "sales" || roleName === "admin") {
        const { count: routedCount } = await admin
          .from("job_tickets")
          .select("*", { count: "exact", head: true })
          .eq("ticket_status", "routed");
        quoteCount += routedCount ?? 0;
      }

      counts["/quotes"] = quoteCount;
    })(),

    // /orders badge — active orders not awaiting payment evidence review (/payments)
    ticketQuery()
      .eq("ticket_status", "order")
      .or("payment_evidence_url.is.null,payment_paid_at.not.is.null")
      .then(({ data }) => {
        counts["/orders"] = (data ?? []).length;
      }),

    // /payments badge — orders with evidence submitted but not yet confirmed
    (roleName === "accountant" || roleName === "admin")
      ? admin
          .from("job_tickets")
          .select("id", { count: "exact", head: true })
          .not("payment_evidence_url", "is", null)
          .is("payment_paid_at", null)
          .in("ticket_status", ["order", "in_production"])
          .then(({ count }) => { counts["/payments"] = count ?? 0; })
      : Promise.resolve(),

    // /production badge — orders currently in production
    (roleName === "accountant" || roleName === "admin")
      ? admin
          .from("job_tickets")
          .select("id", { count: "exact", head: true })
          .eq("ticket_status", "in_production")
          .then(({ count }) => { counts["/production"] = count ?? 0; })
      : Promise.resolve(),

    // /completed badge — completed orders (global count for admin/accountant)
    (roleName === "accountant" || roleName === "admin")
      ? admin
          .from("job_tickets")
          .select("id", { count: "exact", head: true })
          .eq("ticket_status", "completed")
          .then(({ count }) => { counts["/completed"] = count ?? 0; })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ counts });
}
