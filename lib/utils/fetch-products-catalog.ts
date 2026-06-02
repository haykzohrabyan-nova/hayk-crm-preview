import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Product types with linked materials (quote/order line-item forms). */
export async function fetchProductsCatalog(admin: AdminClient) {
  const { data: types, error: tErr } = await admin
    .from("product_types")
    .select("id, name, default_print_type, sort_order, facility")
    .eq("is_active", true)
    .order("sort_order");

  if (tErr) throw tErr;

  const { data: links, error: lErr } = await admin
    .from("product_material_links")
    .select("product_type_id, material_id");

  if (lErr) throw lErr;

  const { data: groups, error: gErr } = await admin
    .from("material_groups")
    .select("id, name, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  if (gErr) throw gErr;

  const { data: mats, error: mErr } = await admin
    .from("materials")
    .select("id, group_id, name, sort_order, category")
    .eq("is_active", true)
    .order("sort_order");

  if (mErr) throw mErr;

  const matById = Object.fromEntries((mats ?? []).map((m) => [m.id, m]));
  const groupById = Object.fromEntries((groups ?? []).map((g) => [g.id, g]));

  return (types ?? []).map((pt) => {
    const linkedMatIds = (links ?? [])
      .filter((l) => l.product_type_id === pt.id)
      .map((l) => l.material_id);

    const linkedMats = linkedMatIds.map((id) => matById[id]).filter(Boolean);

    const groupedMaterials: Record<
      string,
      { group: { id: string; name: string }; materials: typeof linkedMats }
    > = {};

    for (const m of linkedMats) {
      const gId = m.group_id ?? "__other";
      const gName = m.group_id
        ? (groupById[m.group_id]?.name ?? m.category ?? "Other")
        : (m.category ?? "Other");
      if (!groupedMaterials[gId]) {
        groupedMaterials[gId] = { group: { id: gId, name: gName }, materials: [] };
      }
      groupedMaterials[gId].materials.push(m);
    }

    return {
      ...pt,
      material_groups: Object.values(groupedMaterials).sort(
        (a, b) =>
          (groupById[a.group.id]?.sort_order ?? 0) - (groupById[b.group.id]?.sort_order ?? 0),
      ),
    };
  });
}
