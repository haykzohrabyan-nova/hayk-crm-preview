import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

function getPeriodStart(period: string): Date {
  const now = new Date();
  if (period === "week") {
    // Monday of current week
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }
  if (period === "quarter") {
    const quarter = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), quarter * 3, 1);
  }
  // month (default)
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const period = request.nextUrl.searchParams.get("period") ?? "month";
  const periodStart = getPeriodStart(period).toISOString();

  const admin = createAdminClient();

  // ── SDR ──────────────────────────────────────────────────────────────────
  if (roleName === "sdr") {
    const [inbox, myLeads, periodLeads] = await Promise.all([
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_inbox", true),
      admin
        .from("leads")
        .select("id, status")
        .eq("sdr_id", userId),
      admin
        .from("leads")
        .select("id, status")
        .eq("sdr_id", userId)
        .gte("updated_at", periodStart),
    ]);

    const all = myLeads.data ?? [];
    const period_ = periodLeads.data ?? [];

    return NextResponse.json({
      role: "sdr",
      inbox_count: inbox.count ?? 0,
      handled: period_.length,
      routed: period_.filter((l) => l.status === "Routed to Sales").length,
      on_hold: all.filter((l) => l.status === "On Hold").length,
      rejected: period_.filter((l) => l.status === "Rejected").length,
    });
  }

  // ── Sales ─────────────────────────────────────────────────────────────────
  if (roleName === "sales") {
    const [unclaimed, myLeads, wonLeads] = await Promise.all([
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "Routed to Sales")
        .is("sales_owner_id", null),
      admin
        .from("leads")
        .select("id, status, sales_status, quote_total")
        .eq("sales_owner_id", userId),
      admin
        .from("leads")
        .select("id, quote_total")
        .eq("sales_owner_id", userId)
        .eq("sales_status", "Won")
        .gte("updated_at", periodStart),
    ]);

    const all = myLeads.data ?? [];
    const won = wonLeads.data ?? [];

    const activeDeals = all.filter(
      (l) =>
        l.status === "Routed to Sales" &&
        (l.sales_status === "Ongoing" || l.sales_status === "Quote Sent")
    );
    const wonValue = won.reduce((s, l) => s + (l.quote_total ?? 0), 0);
    const pipelineValue = activeDeals.reduce((s, l) => s + (l.quote_total ?? 0), 0);

    return NextResponse.json({
      role: "sales",
      new_in_pipeline: unclaimed.count ?? 0,
      active_deals: activeDeals.length,
      on_hold: all.filter((l) => l.sales_status === "On Hold").length,
      won: won.length,
      won_value: wonValue,
      pipeline_value: pipelineValue,
    });
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  const [totalLeads, inboxLeads, routedLeads, wonLeads, pipelineLeads] =
    await Promise.all([
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", periodStart),
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_inbox", true),
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "Routed to Sales"),
      admin
        .from("leads")
        .select("id, quote_total")
        .eq("sales_status", "Won")
        .gte("updated_at", periodStart),
      admin
        .from("leads")
        .select("quote_total")
        .eq("status", "Routed to Sales"),
    ]);

  const won = wonLeads.data ?? [];
  const pipeline = pipelineLeads.data ?? [];

  return NextResponse.json({
    role: "admin",
    total_leads: totalLeads.count ?? 0,
    inbox_leads: inboxLeads.count ?? 0,
    routed_leads: routedLeads.count ?? 0,
    won_leads: won.length,
    total_revenue: won.reduce((s, l) => s + (l.quote_total ?? 0), 0),
    pipeline_value: pipeline.reduce((s, l) => s + (l.quote_total ?? 0), 0),
  });
}
