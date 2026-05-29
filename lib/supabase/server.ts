import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Route Handler / Server Component Supabase client with cookie read + refresh. */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll from a Server Component — safe to ignore when proxy refreshes sessions
          }
        },
      },
    },
  );

  return { supabase, cookieStore };
}
