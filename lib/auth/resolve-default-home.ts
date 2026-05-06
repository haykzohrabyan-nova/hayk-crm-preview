import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the default landing path after successful login / MFA verification.
 * Extend this to check user roles when RBAC is added.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveDefaultHomePath(_supabase: SupabaseClient): Promise<string> {
  return "/dashboard";
}
