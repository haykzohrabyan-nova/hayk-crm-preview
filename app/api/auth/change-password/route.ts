import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceAuthRateLimit } from "@/lib/security/enforce-route-rate-limit";

export async function POST(request: NextRequest) {
  const rateLimited = enforceAuthRateLimit(request, "change-password");
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const { new_password } = body as { new_password?: string };

  if (!new_password || new_password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters.", code: "INVALID_PASSWORD" },
      { status: 400 }
    );
  }

  // Build a response so we can forward cookies
  let res = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          res = NextResponse.json({ ok: true });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Not authenticated.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  // Update password within the current session so the AAL2 session stays alive.
  // Using the session-aware client here (vs admin updateUserById) prevents Supabase
  // from invalidating the refresh token, which would force the user back to /login.
  const { error: updateError } = await supabase.auth.updateUser({
    password: new_password,
  });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message, code: "UPDATE_FAILED" },
      { status: 500 }
    );
  }

  // Clear the must_change_password flag (admin client required for service-role write)
  const adminClient = createAdminClient();

  const { error: profileError } = await adminClient
    .from("user_profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message, code: "PROFILE_UPDATE_FAILED" },
      { status: 500 }
    );
  }

  return res;
}
