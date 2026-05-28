import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  sumCashCollectedInPeriod,
  sumProductionReleasedValue,
} from "@/lib/utils/dashboard-metrics";
import { buildTeamMemberMetrics } from "@/lib/utils/team-dashboard-metrics";
import { resolveSdrDashboardDateRange } from "@/lib/utils/sdr-dashboard-date-range";
import { buildSdrDashboardMetrics } from "@/lib/utils/sdr-dashboard-metrics";
import { buildSalesDashboardMetrics } from "@/lib/utils/sales-dashboard-metrics";
import { getDashboardValuesHidden } from "@/lib/utils/dashboard-privacy";

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const valuesHidden = await getDashboardValuesHidden(admin, userId!);

  // ── SDR ──────────────────────────────────────────────────────────────────
  if (roleName === "sdr") {
    const sdrPreset = request.nextUrl.searchParams.get("sdr_preset") ?? "last_month";
    const dateFrom = request.nextUrl.searchParams.get("date_from");
    const dateTo = request.nextUrl.searchParams.get("date_to");

    const useCustom = sdrPreset === "custom" || Boolean(dateFrom && dateTo);
    const range = resolveSdrDashboardDateRange(
      useCustom ? "custom" : sdrPreset,
      dateFrom,
      dateTo,
    );

    if ("error" in range) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    if (valuesHidden) {
      return NextResponse.json({
        values_hidden: true,
        role: "sdr",
        range: {
          preset: range.preset,
          label: range.label,
          prior_label: range.priorLabel,
          start_iso: range.startIso,
          end_iso: range.endIso,
        },
      });
    }

    const metrics = await buildSdrDashboardMetrics(
      admin,
      userId!,
      { startIso: range.startIso, endIso: range.endIso },
      { startIso: range.priorStartIso, endIso: range.priorEndIso },
    );

    return NextResponse.json({
      values_hidden: false,
      role: "sdr",
      range: {
        preset: range.preset,
        label: range.label,
        prior_label: range.priorLabel,
        start_iso: range.startIso,
        end_iso: range.endIso,
      },
      ...metrics,
    });
  }

  // ── Sales ─────────────────────────────────────────────────────────────────
  if (roleName === "sales") {
    const salesPreset = request.nextUrl.searchParams.get("sales_preset") ?? "today";
    const dateFrom = request.nextUrl.searchParams.get("date_from");
    const dateTo = request.nextUrl.searchParams.get("date_to");

    const useCustom = salesPreset === "custom" || Boolean(dateFrom && dateTo);
    const range = resolveSdrDashboardDateRange(
      useCustom ? "custom" : salesPreset,
      dateFrom,
      dateTo,
    );

    if ("error" in range) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    if (valuesHidden) {
      return NextResponse.json({
        values_hidden: true,
        role: "sales",
        range: {
          preset: range.preset,
          label: range.label,
          prior_label: range.priorLabel,
          start_iso: range.startIso,
          end_iso: range.endIso,
        },
      });
    }

    const metrics = await buildSalesDashboardMetrics(
      admin,
      userId!,
      { startIso: range.startIso, endIso: range.endIso },
      { startIso: range.priorStartIso, endIso: range.priorEndIso },
    );

    return NextResponse.json({
      values_hidden: false,
      role: "sales",
      range: {
        preset: range.preset,
        label: range.label,
        prior_label: range.priorLabel,
        start_iso: range.startIso,
        end_iso: range.endIso,
      },
      ...metrics,
    });
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  const adminPreset = request.nextUrl.searchParams.get("admin_preset") ?? "last_month";
  const dateFrom = request.nextUrl.searchParams.get("date_from");
  const dateTo = request.nextUrl.searchParams.get("date_to");

  const useCustom = adminPreset === "custom" || Boolean(dateFrom && dateTo);
  const range = resolveSdrDashboardDateRange(
    useCustom ? "custom" : adminPreset,
    dateFrom,
    dateTo,
  );

  if ("error" in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  if (valuesHidden) {
    return NextResponse.json({
      values_hidden: true,
      role: "admin",
      range: {
        preset: range.preset,
        label: range.label,
        start_iso: range.startIso,
        end_iso: range.endIso,
      },
    });
  }

  const periodStartIso = range.startIso;
  const periodEndIso = range.endIso;
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
    values_hidden: false,
    role: "admin",
    range: {
      preset: range.preset,
      label: range.label,
      start_iso: range.startIso,
      end_iso: range.endIso,
    },
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
