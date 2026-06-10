import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { invalidateActionGrantsCache } from "@/lib/auth/action-grants-cache";

/**
 * DELETE /api/admin/roles/[id]/action-grants/[permissionId]
 * Revokes a single action permission from a role.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; permissionId: string }> },
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: role_id, permissionId: permission_id } = await params;
  const admin = createAdminClient();

  const { data: role } = await admin
    .from("roles")
    .select("is_system")
    .eq("id", role_id)
    .single();

  if (role?.is_system) {
    return NextResponse.json(
      { error: "System role action grants cannot be modified.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("role_action_grants")
    .delete()
    .eq("role_id", role_id)
    .eq("permission_id", permission_id);

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  invalidateActionGrantsCache();
  return NextResponse.json({ success: true });
}
