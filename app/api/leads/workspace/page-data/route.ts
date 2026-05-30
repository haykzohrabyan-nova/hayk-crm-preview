import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import {
  fetchLeadsWorkspace,
  fetchLeadsWorkspaceTabCounts,
  parseLeadsWorkspaceQuery,
} from "@/lib/utils/leads-workspace-query";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";

/** GET /api/leads/workspace/page-data — paginated workspace list + all tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/leads");
  if (pageDeny) return pageDeny;

  const searchParams = request.nextUrl.searchParams;
  const query = parseLeadsWorkspaceQuery(searchParams);
  const pagination = parseListPaginationParams(searchParams);
  const admin = createAdminClient();

  try {
    const filterUserId = roleName === "admin" ? query.filterUserId ?? null : null;
    const [result, counts] = await Promise.all([
      fetchLeadsWorkspace(admin, { ...query, pagination }, userId!, roleName),
      fetchLeadsWorkspaceTabCounts(admin, userId!, roleName, filterUserId),
    ]);
    return NextResponse.json({
      leads: result.rows,
      counts,
      routedSubCounts: result.routedSubCounts,
      pagination: toPaginatedMeta({
        ...pagination,
        total: result.total,
        rowCount: result.rows.length,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load leads data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
