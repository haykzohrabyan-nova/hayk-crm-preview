import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  fetchLeadsSalesTabCounts,
  fetchLeadsWorkspace,
  parseLeadsWorkspaceQuery,
  type LeadsWorkspaceQuery,
} from "@/lib/utils/leads-workspace-query";

/** GET /api/leads/sales/page-data — sales pipeline list + tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const params = request.nextUrl.searchParams;
  const tab = params.get("tab") ?? "pipeline";
  const base = parseLeadsWorkspaceQuery(params);

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
  } else {
    workspaceQuery = {
      status: "Routed to Sales",
      salesTab: tab === "hold" ? "hold" : "pipeline",
      search: base.search,
    };
  }

  const admin = createAdminClient();

  try {
    const [result, counts] = await Promise.all([
      fetchLeadsWorkspace(admin, workspaceQuery, userId!, roleName),
      fetchLeadsSalesTabCounts(admin, userId!, roleName),
    ]);
    return NextResponse.json({ leads: result.rows, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load sales data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
