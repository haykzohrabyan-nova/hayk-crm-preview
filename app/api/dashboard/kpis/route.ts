import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { getDashboardPeriodBounds } from "@/lib/utils/get-period-start";
import {
  sumCashCollectedInPeriod,
  sumProductionReleasedValue,
} from "@/lib/utils/dashboard-metrics";
import { buildTeamMemberMetrics } from "@/lib/utils/team-dashboard-metrics";

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const period = request.nextUrl.searchParams.get("period") ?? "month";
  if (!["week", "month", "quarter"].includes(period)) {
    return NextResponse.json({ error: "Invalid period." }, { status: 400 });
  }

  const { periodStartIso, periodEndIso } = getDashboardPeriodBounds(period);
  const admin = createAdminClient();

  // ── SDR ──────────────────────────────────────────────────────────────────
  if (roleName === "sdr") {
    const SDR_ACTION_TYPES = [
      "lead_claimed",
      "lead_routed_to_sales",
      "lead_rejected",
      "lead_held",
    ];

    const [inbox, onHold, myActivities, allSdrActivities, sourcedCash] = await Promise.all([
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_inbox", false)
        .in("status", ["Pending", "Validated"])
        .is("locked_by_id", null),

      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_inbox", false)
        .eq("sdr_id", userId)
        .eq("status", "On Hold"),

      admin
        .from("activities")
        .select("lead_id, type")
        .eq("by_user_id", userId)
        .in("type", SDR_ACTION_TYPES)
        .gte("created_at", periodStartIso)
        .lte("created_at", periodEndIso)
        .not("lead_id", "is", null),

      admin
        .from("activities")
        .select("lead_id")
        .in("type", SDR_ACTION_TYPES)
        .gte("created_at", periodStartIso)
        .lte("created_at", periodEndIso)
        .not("lead_id", "is", null),

      sumCashCollectedInPeriod(admin, periodStartIso, periodEndIso, {
        userId,
        role: "sdr",
      }),
    ]);

    const myActs = myActivities.data ?? [];
    const allActs = allSdrActivities.data ?? [];

    const handledLeadIds = [...new Set(myActs.map((a) => a.lead_id as string))];
    const routedCount = new Set(
      myActs.filter((a) => a.type === "lead_routed_to_sales").map((a) => a.lead_id as string),
    ).size;
    const rejectedCount = new Set(
      myActs.filter((a) => a.type === "lead_rejected").map((a) => a.lead_id as string),
    ).size;
    const allHandledCount = new Set(allActs.map((a) => a.lead_id as string)).size;

    let quote_value = 0;
    if (handledLeadIds.length > 0) {
      const { data: handledLeads } = await admin
        .from("leads")
        .select("quote_total")
        .in("id", handledLeadIds);
      quote_value = (handledLeads ?? []).reduce(
        (s, l) => s + ((l.quote_total as number) ?? 0),
        0,
      );
    }

    const share_pct =
      allHandledCount > 0
        ? Math.round((handledLeadIds.length / allHandledCount) * 100)
        : 0;

    return NextResponse.json({
      role: "sdr",
      inbox_count: inbox.count ?? 0,
      handled: handledLeadIds.length,
      routed: routedCount,
      on_hold: onHold.count ?? 0,
      rejected: rejectedCount,
      quote_value,
      sourced_cash: sourcedCash.total,
      share_pct,
    });
  }

  // ── Sales ─────────────────────────────────────────────────────────────────
  if (roleName === "sales") {
    const [unclaimed, myLeads, released, pipelineTickets, cashCollected] =
      await Promise.all([
        admin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("status", "Routed to Sales")
          .is("sales_owner_id", null),

        admin
          .from("leads")
          .select("id, status, sales_status")
          .eq("sales_owner_id", userId),

        sumProductionReleasedValue(admin, periodStartIso, periodEndIso, userId),

        admin
          .from("job_tickets")
          .select("quote_final_total")
          .eq("created_by_id", userId)
          .in("ticket_status", ["draft", "sent"]),

        sumCashCollectedInPeriod(admin, periodStartIso, periodEndIso, {
          userId,
          role: "sales",
        }),
      ]);

    const all = myLeads.data ?? [];

    const activeDeals = all.filter(
      (l) => l.sales_status === "Ongoing" || l.sales_status === "Quote Sent",
    );

    const pipelineValue = (pipelineTickets.data ?? []).reduce(
      (s, t) => s + (t.quote_final_total ?? 0),
      0,
    );

    return NextResponse.json({
      role: "sales",
      new_in_pipeline: unclaimed.count ?? 0,
      active_deals: activeDeals.length,
      on_hold: all.filter((l) => l.sales_status === "On Hold").length,
      won: released.count,
      won_value: released.value,
      cash_collected: cashCollected.total,
      pipeline_value: pipelineValue,
    });
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  const [
    totalLeads,
    openLeads,
    claimedLeads,
    inboxLeads,
    routedLeads,
    pipelineLeads,
    pipelineLeads2,
    quotedLeads,
    orderedLeads,
    cashCollected,
    released,
    teamMemberMetrics,
  ] = await Promise.all([
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", periodStartIso)
      .lte("created_at", periodEndIso),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_inbox", false)
      .in("status", ["Pending", "Validated"])
      .is("locked_by_id", null),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_inbox", false)
      .in("status", ["Pending", "Validated"])
      .not("locked_by_id", "is", null),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_inbox", true),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "Routed to Sales"),

    admin
      .from("job_tickets")
      .select("quote_final_total")
      .in("ticket_status", ["draft", "sent"]),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "Routed to Sales")
      .eq("sales_status", "Ongoing")
      .gte("created_at", periodStartIso)
      .lte("created_at", periodEndIso),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("sales_status", "Quote Sent")
      .gte("created_at", periodStartIso)
      .lte("created_at", periodEndIso),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("sales_status", "Won")
      .gte("created_at", periodStartIso)
      .lte("created_at", periodEndIso),

    sumCashCollectedInPeriod(admin, periodStartIso, periodEndIso),

    sumProductionReleasedValue(admin, periodStartIso, periodEndIso),

    buildTeamMemberMetrics(admin, periodStartIso, periodEndIso),
  ]);

  const pipeline = pipelineLeads.data ?? [];
  const pipeline_leads_count = pipelineLeads2.count ?? 0;
  const quoted_leads_count = quotedLeads.count ?? 0;
  const ordered_leads_count = orderedLeads.count ?? 0;

  return NextResponse.json({
    role: "admin",
    total_leads: totalLeads.count ?? 0,
    open_leads: openLeads.count ?? 0,
    claimed_leads: claimedLeads.count ?? 0,
    pipeline_leads: pipeline_leads_count,
    quoted_leads: quoted_leads_count,
    ordered_leads: ordered_leads_count,
    inbox_leads: inboxLeads.count ?? 0,
    routed_leads: routedLeads.count ?? 0,
    won_leads: released.count,
    cash_collected: cashCollected.total,
    pipeline_value: pipeline.reduce((s, t) => s + ((t.quote_final_total as number) ?? 0), 0),
    team_member_metrics: teamMemberMetrics,
  });
}
