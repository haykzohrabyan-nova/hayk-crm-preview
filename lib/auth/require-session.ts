import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function requireSession(): Promise<
  | { userId: string; roleName: string; errorResponse: null }
  | { userId: null; roleName: null; errorResponse: NextResponse }
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
      roleName: null,
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

  const roleName =
    (profile?.roles as unknown as { name: string } | null)?.name ?? "";

  return { userId: user.id, roleName, errorResponse: null };
}
