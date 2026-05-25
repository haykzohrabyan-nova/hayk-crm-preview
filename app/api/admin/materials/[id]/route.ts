import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json();

  const allowed = ["name", "group_id", "sort_order", "is_active", "facility", "default_unit"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (patch.name && !(patch.name as string).trim()) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }
  if (patch.name) patch.name = (patch.name as string).trim();

  // If group_id is changing, sync category name
  if ("group_id" in patch && patch.group_id) {
    const { data: grp } = await admin
      .from("material_groups")
      .select("name")
      .eq("id", patch.group_id)
      .single();
    if (grp) patch.category = grp.name;
  }

  const { data, error } = await admin
    .from("materials")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ material: data });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: mat } = await admin
    .from("materials")
    .select("name")
    .eq("id", id)
    .single();

  if (!mat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Safety check: referenced in any quote_skus JSONB?
  const { data: tickets } = await admin
    .from("job_tickets")
    .select("id")
    .filter("quote_skus", "cs", JSON.stringify([{ material: mat.name }]))
    .limit(1);

  if (tickets && tickets.length > 0) {
    return NextResponse.json(
      { error: `Cannot delete — "${mat.name}" is used in existing quotes or orders. Deactivate it instead.` },
      { status: 409 }
    );
  }

  const { error } = await admin.from("materials").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
