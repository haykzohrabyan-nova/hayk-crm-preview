import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { invalidateActionGrantsCache } from "@/lib/auth/action-grants-cache";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/roles/[id]/action-grants
 * Returns all permission IDs currently granted to the role.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: role_id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("role_action_grants")
    .select("permission_id")
    .eq("role_id", role_id);

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({
    permitted_action_ids: (data ?? []).map((r) => r.permission_id),
  });
}

/**
 * POST /api/admin/roles/[id]/action-grants
 * Body: { permission_id: string }
 * Grants a single action permission to a role.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: role_id } = await params;
  const body = await request.json().catch(() => ({}));
  const { permission_id } = body;

  if (!permission_id) {
    return NextResponse.json(
      { error: "permission_id is required.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

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
    .upsert({ role_id, permission_id }, { onConflict: "role_id,permission_id" });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  invalidateActionGrantsCache();
  return NextResponse.json({ success: true });
}
