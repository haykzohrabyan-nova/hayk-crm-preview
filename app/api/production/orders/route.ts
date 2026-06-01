import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { fetchProductionOrders } from "@/lib/utils/fetch-production-data";

/** GET /api/production/orders — legacy; prefer GET /api/orders/page-data */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requirePageAccess(userId!, roleName, "/orders");
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();

  try {
    const { rows } = await fetchProductionOrders(admin, roleName, userId!);
    return NextResponse.json({ orders: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
