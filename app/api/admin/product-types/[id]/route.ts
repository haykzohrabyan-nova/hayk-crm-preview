import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { clearTicketFormBootstrapServerCache } from "@/lib/utils/ticket-form-bootstrap-server-cache";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));

  const allowed = ["name", "default_print_type", "sort_order", "is_active", "notes", "facility"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (patch.name && !(patch.name as string).trim()) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }
  if (patch.name) patch.name = (patch.name as string).trim();

  const { data, error } = await admin
    .from("product_types")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A product type with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  clearTicketFormBootstrapServerCache();
  return NextResponse.json({ product_type: data });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: pt } = await admin
    .from("product_types")
    .select("name")
    .eq("id", id)
    .single();

  if (!pt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: lineRef } = await admin
    .from("ticket_line_items")
    .select("id")
    .eq("product_type", pt.name)
    .limit(1);

  if (lineRef && lineRef.length > 0) {
    return NextResponse.json(
      { error: `Cannot delete — "${pt.name}" is used in existing quotes or orders. Deactivate it instead.` },
      { status: 409 }
    );
  }

  const { error } = await admin.from("product_types").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  clearTicketFormBootstrapServerCache();
  return NextResponse.json({ ok: true });
}
