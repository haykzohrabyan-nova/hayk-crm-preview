import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fetchAdminOperationsData, fetchOperationsLeadPool } from "@/lib/utils/fetch-admin-operations-data";
import { buildAdminOperationsPerformance } from "@/lib/utils/fetch-admin-operations-performance";
import { countOperationsFilters } from "@/lib/utils/admin-deal-stage";
import {
  OPERATIONS_FILTER_OPTIONS,
  type OperationsFilter,
} from "@/lib/utils/admin-deal-stage";
import {
  resolveDashboardDateRangeFilter,
  type DashboardDateRangeFilterValue,
} from "@/lib/utils/dashboard-date-range-filter";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";

function parseStageFilter(raw: string | null): OperationsFilter {
  if (raw && OPERATIONS_FILTER_OPTIONS.includes(raw as OperationsFilter)) {
    return raw as OperationsFilter;
  }
  return "all_active";
}

function parseDateRange(searchParams: URLSearchParams) {
  const preset = searchParams.get("date_preset") ?? "last_month";
  const value: DashboardDateRangeFilterValue = {
    preset: preset as DashboardDateRangeFilterValue["preset"],
    dateFrom: searchParams.get("date_from")?.trim() ?? "",
    dateTo: searchParams.get("date_to")?.trim() ?? "",
  };
  return resolveDashboardDateRangeFilter(value);
}

/** GET /api/admin/operations/page-data — admin deal pipeline list + filter counts. */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const params = request.nextUrl.searchParams;
  const pagination = parseListPaginationParams(params);
  const stage = parseStageFilter(params.get("stage"));
  const search = params.get("search")?.trim() ?? "";
  const userId = params.get("user_id")?.trim() || null;
  const dateRange = parseDateRange(params);

  if (process.env.NODE_ENV === "development") {
    console.log("[operations/page-data] request", {
      stage,
      search: search || null,
      userId,
      datePreset: params.get("date_preset"),
      dateRange: dateRange
        ? { start: dateRange.startIso, end: dateRange.endIso, label: dateRange.label }
        : null,
      pagination,
    });
  }

  const admin = createAdminClient();

  try {
    if (stage === "performance") {
      const { leads } = await fetchOperationsLeadPool(admin, { dateRange, userId });
      const [performance, counts] = await Promise.all([
        buildAdminOperationsPerformance(admin, leads, { userId }),
        Promise.resolve(countOperationsFilters(leads)),
      ]);

      return NextResponse.json({
        performance,
        counts,
        deals: [],
        pagination: toPaginatedMeta({
          ...pagination,
          total: 0,
          rowCount: 0,
        }),
      });
    }

    const { deals, counts, total } = await fetchAdminOperationsData(
      admin,
      { stage, search, dateRange, userId },
      pagination,
    );

    if (process.env.NODE_ENV === "development") {
      console.log("[operations/page-data] success", {
        stage,
        dealsReturned: deals.length,
        total,
        counts,
      });
    }

    return NextResponse.json({
      deals,
      counts,
      pagination: toPaginatedMeta({
        ...pagination,
        total,
        rowCount: deals.length,
      }),
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to load operations data.";
    console.error("[operations/page-data] error", err);
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
