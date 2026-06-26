import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

/** GET /api/leads/sales-users
 *  Returns all active sales users for the Route-to-Sales modal.
 *  Accessible to any authenticated user (SDRs need this, not just admins).
 */
export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("user_profiles_with_role")
    .select("id, full_name")
    .eq("role_name", "sales")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}
