import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

function getPeriodStart(period: string): Date {
  const now = new Date();
  if (period === "week") {
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
    const [inbox, myLeads, periodLeads, allPeriodCount] = await Promise.all([
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
        .select("id, status, quote_total")
        .eq("sdr_id", userId)
        .gte("updated_at", periodStart),
      // Total workspace leads in period across all SDRs — used for share %
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("is_inbox", false)
        .gte("updated_at", periodStart),
    ]);

    const all = myLeads.data ?? [];
    const period_ = periodLeads.data ?? [];
    const totalInPeriod = allPeriodCount.count ?? 0;

    const quote_value = period_.reduce((s, l) => s + (l.quote_total ?? 0), 0);
    const share_pct = totalInPeriod > 0
      ? Math.round((period_.length / totalInPeriod) * 100)
      : 0;

    return NextResponse.json({
      role: "sdr",
      inbox_count: inbox.count ?? 0,
      handled: period_.length,
      routed: period_.filter((l) => l.status === "Routed to Sales").length,
      on_hold: all.filter((l) => l.status === "On Hold").length,
      rejected: period_.filter((l) => l.status === "Rejected").length,
      quote_value,
      share_pct,
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
  const [
    totalLeads,
    inboxLeads,
    routedLeads,
    wonLeads,
    pipelineLeads,
    sdrLeadsRaw,
    rejectedLeadsRaw,
    sourceLeadsRaw,
  ] = await Promise.all([
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
    // SDR performance: all workspace leads with an sdr_id in the period
    admin
      .from("leads")
      .select("sdr_id, status, quote_total")
      .eq("is_inbox", false)
      .not("sdr_id", "is", null)
      .gte("updated_at", periodStart),
    // Rejection reasons: all rejected workspace leads (all-time for trend value)
    admin
      .from("leads")
      .select("rejection_reason")
      .eq("is_inbox", false)
      .eq("status", "Rejected")
      .not("rejection_reason", "is", null),
    // Source breakdown: all workspace leads (all-time)
    admin
      .from("leads")
      .select("source")
      .eq("is_inbox", false)
      .not("source", "is", null),
  ]);

  const won = wonLeads.data ?? [];
  const pipeline = pipelineLeads.data ?? [];
  const sdrLeads = sdrLeadsRaw.data ?? [];
  const rejectedLeads = rejectedLeadsRaw.data ?? [];
  const sourceLeads = sourceLeadsRaw.data ?? [];

  // ── Build SDR performance table ──────────────────────────────────────────
  const sdrMap: Record<string, {
    handled: number;
    routed: number;
    rejected: number;
    quote_value: number;
  }> = {};

  for (const l of sdrLeads) {
    const sid = l.sdr_id as string;
    if (!sdrMap[sid]) sdrMap[sid] = { handled: 0, routed: 0, rejected: 0, quote_value: 0 };
    sdrMap[sid].handled++;
    if (l.status === "Routed to Sales") sdrMap[sid].routed++;
    if (l.status === "Rejected")        sdrMap[sid].rejected++;
    sdrMap[sid].quote_value += (l.quote_total as number) ?? 0;
  }

  const sdrIds = Object.keys(sdrMap);
  const { data: sdrProfiles } = sdrIds.length > 0
    ? await admin.from("user_profiles").select("id, full_name").in("id", sdrIds)
    : { data: [] as { id: string; full_name: string | null }[] };

  const totalHandled = sdrLeads.length;
  const sdr_performance = (sdrProfiles ?? [])
    .map((p) => ({
      id: p.id,
      full_name: p.full_name ?? "Unknown",
      handled:     sdrMap[p.id]?.handled     ?? 0,
      routed:      sdrMap[p.id]?.routed      ?? 0,
      rejected:    sdrMap[p.id]?.rejected    ?? 0,
      quote_value: sdrMap[p.id]?.quote_value ?? 0,
      share_pct: totalHandled > 0
        ? Math.round(((sdrMap[p.id]?.handled ?? 0) / totalHandled) * 100)
        : 0,
    }))
    .sort((a, b) => b.handled - a.handled);

  // ── Build rejection reasons breakdown ────────────────────────────────────
  const rejMap: Record<string, number> = {};
  for (const l of rejectedLeads) {
    const r = l.rejection_reason as string;
    rejMap[r] = (rejMap[r] ?? 0) + 1;
  }
  const rejection_reasons = Object.entries(rejMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── Build source breakdown ────────────────────────────────────────────────
  const srcMap: Record<string, number> = {};
  for (const l of sourceLeads) {
    const s = l.source as string;
    srcMap[s] = (srcMap[s] ?? 0) + 1;
  }
  const source_breakdown = Object.entries(srcMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    role: "admin",
    total_leads:       totalLeads.count ?? 0,
    inbox_leads:       inboxLeads.count ?? 0,
    routed_leads:      routedLeads.count ?? 0,
    won_leads:         won.length,
    total_revenue:     won.reduce((s, l) => s + ((l.quote_total as number) ?? 0), 0),
    pipeline_value:    pipeline.reduce((s, l) => s + ((l.quote_total as number) ?? 0), 0),
    sdr_performance,
    rejection_reasons,
    source_breakdown,
  });
}
