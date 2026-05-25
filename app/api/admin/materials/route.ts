import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { data: groups, error: gErr } = await admin
    .from("material_groups")
    .select("id, name, facility, sort_order, is_active")
    .order("sort_order");

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const { data: mats, error: mErr } = await admin
    .from("materials")
    .select("id, group_id, name, category, facility, sort_order, is_active, default_unit")
    .order("sort_order");

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const matsByGroup: Record<string, typeof mats> = {};
  for (const m of mats ?? []) {
    const key = m.group_id ?? "__ungrouped";
    if (!matsByGroup[key]) matsByGroup[key] = [];
    matsByGroup[key]!.push(m);
  }

  const result = (groups ?? []).map((g) => ({
    ...g,
    materials: matsByGroup[g.id] ?? [],
  }));

  const ungrouped = matsByGroup["__ungrouped"];
  if (ungrouped?.length) {
    result.push({
      id: "__ungrouped",
      name: "Ungrouped",
      facility: null,
      sort_order: 9999,
      is_active: true,
      materials: ungrouped,
    });
  }

  return NextResponse.json({ groups: result });
}

export async function POST(request: Request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const body = await request.json();
  const { id, name, group_id, sort_order, facility } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Derive a slug ID if not supplied
  const matId = id?.trim() ||
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Resolve category name from group_id
  let category: string | null = null;
  if (group_id) {
    const { data: grp } = await admin
      .from("material_groups")
      .select("name")
      .eq("id", group_id)
      .single();
    category = grp?.name ?? null;
  }

  const { data, error } = await admin
    .from("materials")
    .insert({
      id: matId,
      name: name.trim(),
      group_id: group_id ?? null,
      category: category ?? "Other",
      facility: facility ?? "all",
      sort_order: sort_order ?? 0,
      default_unit: "sheets",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A material with this ID or name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ material: data }, { status: 201 });
}
