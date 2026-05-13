import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string; matId: string }> };

// Link a material to a product type
export async function POST(_request: Request, { params }: Ctx) {
  const { id, matId } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("product_material_links")
    .insert({ product_type_id: id, material_id: matId });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true }); // already linked
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// Unlink a material from a product type
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id, matId } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("product_material_links")
    .delete()
    .eq("product_type_id", id)
    .eq("material_id", matId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
