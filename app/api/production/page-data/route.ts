import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import {
  fetchProductionOrders,
  fetchProductionTabCounts,
} from "@/lib/utils/fetch-production-data";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";
import { parseProductionListFilters } from "@/lib/utils/ticket-list-filters";

/** GET /api/production/page-data — legacy; prefer GET /api/orders/page-data?tab=in_production */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requirePageAccess(userId!, roleName, "/orders");
  if (pageDeny) return pageDeny;

  const filters = parseProductionListFilters(request.nextUrl.searchParams);
  const pagination = parseListPaginationParams(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const [{ rows, total }, counts] = await Promise.all([
      fetchProductionOrders(admin, roleName, userId!, filters, pagination),
      fetchProductionTabCounts(admin, roleName, userId!, filters),
    ]);
    return NextResponse.json({
      orders: rows,
      counts,
      pagination: toPaginatedMeta({ ...pagination, total, rowCount: rows.length }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load production data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
