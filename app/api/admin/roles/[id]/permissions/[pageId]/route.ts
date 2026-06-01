import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: role_id, pageId: page_id } = await params;
  const admin = createAdminClient();

  const { data: role } = await admin.from("roles").select("is_system").eq("id", role_id).single();
  if (role?.is_system) {
    return NextResponse.json(
      { error: "System role permissions cannot be modified.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("role_permissions")
    .delete()
    .eq("role_id", role_id)
    .eq("page_id", page_id);

  if (error) return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });

  return NextResponse.json({ success: true });
}
