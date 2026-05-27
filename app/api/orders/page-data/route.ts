import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { fetchOrdersList, fetchOrdersTabCounts } from "@/lib/utils/fetch-orders-data";

/** GET /api/orders/page-data — orders list + tab counts in one auth pass. */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [orders, counts] = await Promise.all([
      fetchOrdersList(admin, roleName, userId!),
      fetchOrdersTabCounts(admin, roleName, userId!),
    ]);
    return NextResponse.json({ orders, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load orders data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
