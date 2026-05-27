import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  fetchCompletedOrders,
  fetchCompletedTabCounts,
} from "@/lib/utils/fetch-completed-data";

/** GET /api/completed/page-data — completed orders list + count in one auth pass. */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [orders, counts] = await Promise.all([
      fetchCompletedOrders(admin, roleName!, userId!),
      fetchCompletedTabCounts(admin, roleName!, userId!),
    ]);
    return NextResponse.json({ orders, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load completed data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
