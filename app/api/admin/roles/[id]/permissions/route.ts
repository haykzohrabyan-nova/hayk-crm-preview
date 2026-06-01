import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isAdminOnlyPageRoute } from "@/lib/auth/admin-only-pages";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: role_id } = await params;
  const { page_id } = await request.json().catch(() => ({}));

  if (!page_id) {
    return NextResponse.json({ error: "page_id is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: role } = await admin.from("roles").select("is_system").eq("id", role_id).single();
  if (role?.is_system) {
    return NextResponse.json(
      { error: "System role permissions cannot be modified.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const { data: page } = await admin.from("pages").select("route").eq("id", page_id).single();
  if (page?.route && isAdminOnlyPageRoute(page.route)) {
    return NextResponse.json(
      { error: "Admin-only pages cannot be assigned to other roles.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("role_permissions")
    .upsert({ role_id, page_id }, { onConflict: "role_id,page_id" });

  if (error) return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });

  return NextResponse.json({ success: true });
}
