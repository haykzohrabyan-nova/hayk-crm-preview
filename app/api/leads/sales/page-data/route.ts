import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import {
  fetchRoutedToSalesAtByLeadIds,
} from "@/lib/utils/lead-routed-to-sales-query";
import { fetchSalesInProgressAtByLeadIds } from "@/lib/utils/lead-in-progress-query";
import { isSalesAdminFilterTab } from "@/lib/utils/lead-sales-scoped-tab";
import {
  fetchLeadsSalesTabCounts,
  fetchLeadsWorkspace,
  parseLeadsWorkspaceQuery,
  type LeadsWorkspaceQuery,
} from "@/lib/utils/leads-workspace-query";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";

/** GET /api/leads/sales/page-data — paginated sales pipeline list + tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/sales");
  if (pageDeny) return pageDeny;

  const params = request.nextUrl.searchParams;
  const tab = params.get("tab") ?? "pipeline";
  const pagination = parseListPaginationParams(params);
  const base = parseLeadsWorkspaceQuery(params);
  const adminFilterUserId =
    roleName === "admin" && isSalesAdminFilterTab(tab) ? base.filterUserId ?? null : null;

  let workspaceQuery: LeadsWorkspaceQuery;
  if (tab === "rejected") {
    workspaceQuery = {
      status: "Rejected",
      prevStatus: "Routed to Sales",
      search: base.search,
    };
  } else if (tab === "follow_up") {
    workspaceQuery = {
      status: "Routed to Sales",
      salesTab: "follow_up",
      search: base.search,
    };
  } else if (tab === "hold") {
    workspaceQuery = {
      status: "Routed to Sales",
      salesTab: "hold",
      search: base.search,
    };
  } else if (tab === "claimed" || tab === "in_progress") {
    workspaceQuery = {
      status: "Routed to Sales",
      salesTab: tab,
      search: roleName === "admin" ? base.search : undefined,
      filterUserId: roleName === "admin" ? base.filterUserId : undefined,
    };
  } else {
    workspaceQuery = {
      status: "Routed to Sales",
      salesTab: "pipeline",
      search: base.search,
    };
  }

  const admin = createAdminClient();

  try {
    const [result, counts] = await Promise.all([
      fetchLeadsWorkspace(admin, { ...workspaceQuery, pagination }, userId!, roleName),
      fetchLeadsSalesTabCounts(admin, userId!, roleName, adminFilterUserId),
    ]);

    const leadIds = result.rows
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));
    const [routedAtByLeadId, inProgressAtByLeadId] = await Promise.all([
      fetchRoutedToSalesAtByLeadIds(admin, leadIds),
      tab === "in_progress" ? fetchSalesInProgressAtByLeadIds(admin, leadIds) : Promise.resolve(new Map<string, string>()),
    ]);
    const leads = result.rows.map((row) => ({
      ...row,
      routed_at: row.id ? routedAtByLeadId.get(row.id) ?? null : null,
      in_progress_at: row.id ? inProgressAtByLeadId.get(row.id) ?? null : null,
    }));

    return NextResponse.json({
      leads,
      counts,
      pagination: toPaginatedMeta({
        ...pagination,
        total: result.total,
        rowCount: result.rows.length,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load sales data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
