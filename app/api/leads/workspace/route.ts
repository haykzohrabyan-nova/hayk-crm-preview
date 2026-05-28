import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  fetchLeadsWorkspace,
  fetchLeadsWorkspaceTabCounts,
  parseLeadsWorkspaceQuery,
} from "@/lib/utils/leads-workspace-query";

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const query = parseLeadsWorkspaceQuery(request.nextUrl.searchParams);
    const { rows } = await fetchLeadsWorkspace(admin, query, userId!, roleName);
    return NextResponse.json({ leads: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
