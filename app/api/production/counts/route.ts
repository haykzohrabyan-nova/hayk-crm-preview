import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { fetchProductionTabCounts } from "@/lib/utils/fetch-production-data";

/** GET /api/production/counts — legacy */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requirePageAccess(userId!, roleName, "/orders");
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();

  try {
    const counts = await fetchProductionTabCounts(admin, roleName, userId!);
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
