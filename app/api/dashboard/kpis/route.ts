import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  sumCashCollectedInPeriod,
  sumPipelineQuoteValue,
  sumProductionReleasedValue,
} from "@/lib/utils/dashboard-metrics";
import { buildTeamMemberMetrics } from "@/lib/utils/team-dashboard-metrics";
import { buildAdminLeadBreakdown } from "@/lib/utils/admin-lead-breakdown";
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

  if (roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
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
    leadBreakdown,
    inboxLeads,
    routedLeads,
    pipelineValue,
    cashCollected,
    released,
    teamMemberMetrics,
  ] = await Promise.all([
    buildAdminLeadBreakdown(admin, periodStartIso, periodEndIso),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("is_inbox", true),

    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "Routed to Sales"),

    sumPipelineQuoteValue(admin),

    sumCashCollectedInPeriod(admin, periodStartIso, periodEndIso),

    sumProductionReleasedValue(admin, periodStartIso, periodEndIso),

    buildTeamMemberMetrics(admin, periodStartIso, periodEndIso),
  ]);

  return NextResponse.json({
    values_hidden: false,
    role: "admin",
    range: {
      preset: range.preset,
      label: range.label,
      start_iso: range.startIso,
      end_iso: range.endIso,
    },
    total_leads: leadBreakdown.total_leads,
    open_leads: leadBreakdown.open_leads,
    claimed_leads: leadBreakdown.claimed_leads,
    pipeline_leads: leadBreakdown.pipeline_leads,
    quoted_leads: leadBreakdown.quoted_leads,
    ordered_leads: leadBreakdown.ordered_leads,
    rejected_leads: leadBreakdown.rejected_leads,
    cancelled_leads: leadBreakdown.cancelled_leads,
    refunded_leads: leadBreakdown.refunded_leads,
    inbox_leads_period: leadBreakdown.inbox_leads,
    inbox_leads: inboxLeads.count ?? 0,
    routed_leads: routedLeads.count ?? 0,
    won_leads: released.count,
    cash_collected: cashCollected.total,
    pipeline_value: pipelineValue,
    team_member_metrics: teamMemberMetrics,
  });
}
