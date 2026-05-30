import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { fetchCrmCustomers, parseCrmListFilters } from "@/lib/utils/fetch-crm-data";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";

/** GET /api/crm/page-data — paginated CRM customer list (CRM page permission required). */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/crm");
  if (pageDeny) return pageDeny;

  const filters = parseCrmListFilters(request.nextUrl.searchParams);
  const pagination = parseListPaginationParams(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const { rows, total } = await fetchCrmCustomers(admin, filters, pagination);
    return NextResponse.json({
      customers: rows,
      pagination: toPaginatedMeta({
        ...pagination,
        total,
        rowCount: rows.length,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load CRM data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
