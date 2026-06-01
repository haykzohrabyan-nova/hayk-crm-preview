import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { fetchPendingPaymentOrders } from "@/lib/utils/fetch-payments-data";

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
    const orders = await fetchPendingPaymentOrders(admin);
    return NextResponse.json({ orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
