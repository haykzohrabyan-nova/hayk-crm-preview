import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

  // Guard: cannot delete system roles
  const { data: role } = await admin.from("roles").select("is_system, name").eq("id", id).single();
  if (!role) return NextResponse.json({ error: "Role not found.", code: "NOT_FOUND" }, { status: 404 });
  if (role.is_system) {
    return NextResponse.json({ error: "System roles cannot be deleted.", code: "FORBIDDEN" }, { status: 403 });
  }

  // Guard: cannot delete if users are assigned
  const { count } = await admin
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `${count} user${count > 1 ? "s" : ""} assigned to this role. Reassign them first.`, code: "ROLE_IN_USE" },
      { status: 409 }
    );
  }

  const { error } = await admin.from("roles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });

  return NextResponse.json({ success: true });
}
