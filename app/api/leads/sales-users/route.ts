import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { resolveActiveKeyAccountSalesRep } from "@/lib/utils/resolve-key-account-sales-rep";

/** GET /api/leads/sales-users
 *  Returns all active sales users for the Route-to-Sales modal.
 *  Optional ?customer_id= — includes active Key Account rep for that customer.
 *  Accessible to any authenticated user (SDRs need this, not just admins).
 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const customerId = request.nextUrl.searchParams.get("customer_id");

  const { data, error } = await admin
    .from("user_profiles_with_role")
    .select("id, full_name")
    .eq("role_name", "sales")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  let key_account: { id: string; full_name: string | null } | null = null;
  if (customerId) {
    key_account = await resolveActiveKeyAccountSalesRep(admin, customerId);
  }

  return NextResponse.json({ users: data ?? [], key_account });
}
