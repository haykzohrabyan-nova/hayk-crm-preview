import { createAdminClient } from "@/lib/supabase/admin";

/** Loads all action permission keys granted to a role from the DB. */
export async function resolveActionGrants(
  userId: string,
  roleName: string,
): Promise<string[]> {
  const admin = createAdminClient();

  if (roleName === "admin") {
    const { data } = await admin.from("permissions").select("key");
    return (data ?? []).map((p) => p.key as string);
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role_id")
    .eq("id", userId)
    .single();

  if (!profile?.role_id) return [];

  const { data } = await admin
    .from("role_action_grants")
    .select("permissions!inner(key)")
    .eq("role_id", profile.role_id);

  return (data ?? []).map(
    (row) => (row.permissions as unknown as { key: string }).key,
  );
}
