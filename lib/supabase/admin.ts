import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — use only in Route Handlers (server-side).
 * Never import this in client components or expose SUPABASE_SECRET_KEY to the browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
