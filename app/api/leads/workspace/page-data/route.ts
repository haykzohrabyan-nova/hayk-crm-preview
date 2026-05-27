import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  fetchLeadsWorkspace,
  fetchLeadsWorkspaceTabCounts,
  parseLeadsWorkspaceQuery,
} from "@/lib/utils/leads-workspace-query";

/** GET /api/leads/workspace/page-data — workspace list + all tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const query = parseLeadsWorkspaceQuery(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const [leads, counts] = await Promise.all([
      fetchLeadsWorkspace(admin, query, userId!, roleName),
      fetchLeadsWorkspaceTabCounts(admin, userId!, roleName),
    ]);
    return NextResponse.json({ leads, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load leads data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
