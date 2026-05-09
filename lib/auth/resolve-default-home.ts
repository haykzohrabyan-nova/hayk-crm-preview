import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveDefaultHomePath(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("user_profiles")
    .select("roles(name)")
    .single();

  // Supabase returns FK joins as single objects; cast via unknown to satisfy TS
  const roleData = data?.roles as unknown as { name: string } | null;
  const roleName = roleData?.name;

  if (roleName === "sdr") return "/leads";
  if (roleName === "sales") return "/sales";
  return "/dashboard";
}
