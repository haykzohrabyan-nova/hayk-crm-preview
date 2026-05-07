import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Verifies the calling user is authenticated and has the 'admin' role.
 * Returns { userId, error } — if error is set, return it immediately.
 */
export async function requireAdmin(): Promise<
  | { userId: string; errorResponse: null }
  | { userId: null; errorResponse: NextResponse }
> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { error: "Not authenticated.", code: "UNAUTHENTICATED" },
        { status: 401 }
      ),
    };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("roles(name)")
    .eq("id", user.id)
    .single();

  const roleName = (profile?.roles as unknown as { name: string } | null)?.name;
  if (roleName !== "admin") {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { error: "Admin access required.", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }

  return { userId: user.id, errorResponse: null };
}
