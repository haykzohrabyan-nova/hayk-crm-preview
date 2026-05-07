import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  // Only show main navigable pages (not admin-sub nav items)
  const { data: pages, error } = await admin
    .from("pages")
    .select("id, route, display_name, icon, section, sort_order")
    .in("section", ["main", "admin", "bottom"])
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ pages: pages ?? [] });
}
