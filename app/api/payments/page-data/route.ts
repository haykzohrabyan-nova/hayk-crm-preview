import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import {
  fetchPaymentsPageData,
  type PaymentsPageTab,
} from "@/lib/utils/fetch-payments-data";
import { parseListPaginationParams, toPaginatedMeta } from "@/lib/utils/pagination";
import {
  attachLinePreviews,
  fetchTicketLinePreviewsBatch,
} from "@/lib/utils/fetch-ticket-line-previews-batch";

const PAYMENTS_TABS: PaymentsPageTab[] = ["pending", "tax_exempt", "approved", "refunded"];

/** GET /api/payments/page-data — active tab list (paginated) + all tab counts in one auth pass. */
export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (!isPaymentStaffRole(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  const pageDeny = await requirePageAccess(userId!, roleName, "/payments");
  if (pageDeny) return pageDeny;

  const { searchParams } = request.nextUrl;
  const tabParam = searchParams.get("tab") ?? "pending";
  const tab: PaymentsPageTab = PAYMENTS_TABS.includes(tabParam as PaymentsPageTab)
    ? (tabParam as PaymentsPageTab)
    : "pending";
  const pagination = parseListPaginationParams(searchParams);
  const search = searchParams.get("search")?.trim() ?? "";

  const admin = createAdminClient();

  try {
    const pageData = await fetchPaymentsPageData(admin, tab, { search, pagination });
    const activeRows =
      tab === "pending"
        ? pageData.orders
        : tab === "tax_exempt"
          ? pageData.taxExemptOrders
          : tab === "approved"
            ? pageData.approvedOrders
            : pageData.refundedOrders;

    const previews = await fetchTicketLinePreviewsBatch(admin, activeRows);
    const withPreviews = attachLinePreviews(activeRows, previews);

    const enriched =
      tab === "pending"
        ? { ...pageData, orders: withPreviews }
        : tab === "tax_exempt"
          ? { ...pageData, taxExemptOrders: withPreviews }
          : tab === "approved"
            ? { ...pageData, approvedOrders: withPreviews }
            : { ...pageData, refundedOrders: withPreviews };

    const rowCount = withPreviews.length;

    return NextResponse.json({
      ...enriched,
      pagination: toPaginatedMeta({
        ...pagination,
        total: pageData.total,
        rowCount,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load payments data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
