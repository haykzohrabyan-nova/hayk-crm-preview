import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const { data: roles, error } = await admin
    .from("roles")
    .select("*, role_permissions(page_id)")
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Flatten permissions to array of page_ids per role
  const formatted = (roles ?? []).map((r) => ({
    ...r,
    permitted_page_ids: (r.role_permissions ?? []).map((p: { page_id: string }) => p.page_id),
    role_permissions: undefined,
  }));

  return NextResponse.json({ roles: formatted });
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await request.json();
  const { name, display_name } = body;

  if (!name || !display_name) {
    return NextResponse.json(
      { error: "name and display_name are required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // Validate slug format
  if (!/^[a-z0-9_]+$/.test(name)) {
    return NextResponse.json(
      { error: "name must be lowercase letters, numbers, and underscores only.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("roles")
    .insert({ name, display_name, is_system: false })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A role with that name already exists.", code: "DUPLICATE" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ role: { ...data, permitted_page_ids: [] } }, { status: 201 });
}
