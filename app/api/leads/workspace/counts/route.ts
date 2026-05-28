import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { parseAdminFilterUserId } from "@/lib/utils/admin-user-filter";
import { fetchLeadsWorkspaceTabCounts } from "@/lib/utils/leads-workspace-query";

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const adminFilterUserId = parseAdminFilterUserId(request.nextUrl.searchParams, roleName);
  const admin = createAdminClient();

  try {
    const counts = await fetchLeadsWorkspaceTabCounts(
      admin,
      userId!,
      roleName,
      adminFilterUserId,
    );
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
