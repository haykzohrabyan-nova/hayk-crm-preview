import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const allowed = ["name", "facility", "sort_order", "is_active"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (patch.name && !(patch.name as string).trim()) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }
  if (patch.name) patch.name = (patch.name as string).trim();

  const { data, error } = await admin
    .from("material_groups")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A group with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ group: data });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

  // Check if the group has materials — require them to be deleted first
  const { count } = await admin
    .from("materials")
    .select("id", { count: "exact", head: true })
    .eq("group_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `This group has ${count} material(s). Delete or reassign them before deleting the group.` },
      { status: 409 }
    );
  }

  const { error } = await admin.from("material_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
