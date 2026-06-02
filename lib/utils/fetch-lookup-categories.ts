import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type LookupOptionRow = {
  id: string;
  value: string;
  label: string;
  sort_order: number;
};

/** Active lookup values grouped by category (quote forms, detail edit). */
export async function fetchLookupCategories(
  admin: AdminClient,
  categories: string[],
): Promise<Record<string, LookupOptionRow[]>> {
  if (!categories.length) return {};

  const { data, error } = await admin
    .from("lookup_values")
    .select("id, category, value, label, sort_order")
    .in("category", categories)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const result: Record<string, LookupOptionRow[]> = {};
  for (const item of data ?? []) {
    if (!result[item.category]) result[item.category] = [];
    result[item.category].push(item);
  }
  return result;
}
