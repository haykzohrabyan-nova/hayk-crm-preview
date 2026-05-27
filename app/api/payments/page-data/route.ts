import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { fetchPendingPaymentOrders } from "@/lib/utils/fetch-payments-data";

/** GET /api/payments/page-data — pending payment review list (single tab page). */
export async function GET() {
  const { roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "accountant" && roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();

  try {
    const orders = await fetchPendingPaymentOrders(admin);
    return NextResponse.json({ orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load payments data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
