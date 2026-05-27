import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { fetchProductionOrders } from "@/lib/utils/fetch-production-data";

export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const orders = await fetchProductionOrders(admin);
    return NextResponse.json({ orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
