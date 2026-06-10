import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

/** GET /api/admin/permissions — full permissions catalog grouped by area. */
export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("permissions")
    .select("id, key, display_name, area, description, sort_order")
    .order("area")
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ permissions: data ?? [] });
}
