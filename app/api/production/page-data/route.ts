import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import {
  fetchProductionOrders,
  fetchProductionTabCounts,
} from "@/lib/utils/fetch-production-data";

/** GET /api/production/page-data — orders list + tab counts in one auth pass. */
export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [orders, counts] = await Promise.all([
      fetchProductionOrders(admin),
      fetchProductionTabCounts(admin),
    ]);
    return NextResponse.json({ orders, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load production data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
