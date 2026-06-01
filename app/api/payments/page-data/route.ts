import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { fetchPaymentsPageData } from "@/lib/utils/fetch-payments-data";

/** GET /api/payments/page-data — pending + approved payment evidence lists and tab counts. */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (!isPaymentStaffRole(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  const pageDeny = await requirePageAccess(userId!, roleName, "/payments");
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();

  try {
    const pageData = await fetchPaymentsPageData(admin);
    return NextResponse.json(pageData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load payments data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
