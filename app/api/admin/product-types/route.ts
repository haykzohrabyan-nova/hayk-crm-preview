import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { requireSession } from "@/lib/auth/require-session";

export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const { data: types, error: typesErr } = await admin
    .from("product_types")
    .select("id, name, default_print_type, sort_order, is_active, notes, facility")
    .order("sort_order");

  if (typesErr) return NextResponse.json({ error: typesErr.message }, { status: 500 });

  const { data: links, error: linksErr } = await admin
    .from("product_material_links")
    .select("product_type_id, material_id");

  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 });

  const linkMap: Record<string, string[]> = {};
  for (const link of links ?? []) {
    if (!linkMap[link.product_type_id]) linkMap[link.product_type_id] = [];
    linkMap[link.product_type_id].push(link.material_id);
  }

  const result = (types ?? []).map((pt) => ({
    ...pt,
    material_ids: linkMap[pt.id] ?? [],
  }));

  return NextResponse.json({ product_types: result });
}

export async function POST(request: Request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const body = await request.json();
  const { id, name, default_print_type, sort_order, notes, facility } = body;

  if (!id?.trim()) return NextResponse.json({ error: "ID (slug) is required" }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!["Roll", "Sheet"].includes(default_print_type)) {
    return NextResponse.json({ error: "default_print_type must be Roll or Sheet" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("product_types")
    .insert({
      id: id.trim().toLowerCase().replace(/\s+/g, "-"),
      name: name.trim(),
      default_print_type,
      sort_order: sort_order ?? 0,
      notes: notes ?? null,
      facility: facility ?? "all",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A product type with this name or ID already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product_type: { ...data, material_ids: [] } }, { status: 201 });
}
