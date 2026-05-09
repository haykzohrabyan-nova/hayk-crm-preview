import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/lib/auth/safe-return-path";
import { resolveDefaultHomePath } from "@/lib/auth/resolve-default-home";

function continueTargetFromRequest(request: NextRequest): string | null {
  const explicit = safeReturnPath(request.nextUrl.searchParams.get("next"));
  if (explicit) return explicit;
  const { pathname, search } = request.nextUrl;
  const authPrefixes = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/setup-2fa",
    "/verify-2fa",
    "/change-password",
  ];
  if (authPrefixes.some((p) => pathname.startsWith(p))) return null;
  return safeReturnPath(pathname + search);
}

export async function proxy(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isAuthFlow =
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/setup-2fa") ||
    pathname.startsWith("/verify-2fa") ||
    pathname.startsWith("/change-password");

  const isStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".");

  // Not logged in → redirect to login
  if (!user && !isAuthFlow && !isStatic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const ct = continueTargetFromRequest(request);
    if (ct) url.searchParams.set("next", ct);
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const current = aal?.currentLevel;
    const next = aal?.nextLevel;

    // No MFA enrolled → force setup
    if (current === "aal1" && next === "aal1" && !pathname.startsWith("/setup-2fa")) {
      const url = request.nextUrl.clone();
      url.pathname = "/setup-2fa";
      url.search = "";
      const ct = continueTargetFromRequest(request);
      if (ct) url.searchParams.set("next", ct);
      return NextResponse.redirect(url);
    }

    // MFA enrolled but not verified this session → verify
    if (current === "aal1" && next === "aal2" && !pathname.startsWith("/verify-2fa")) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify-2fa";
      url.search = "";
      const ct = continueTargetFromRequest(request);
      if (ct) url.searchParams.set("next", ct);
      return NextResponse.redirect(url);
    }

    // Fully verified (aal2): kick auth-flow pages back to app
    if (current === "aal2" && isAuthFlow && !pathname.startsWith("/change-password")) {
      const explicit = safeReturnPath(request.nextUrl.searchParams.get("next"));
      const dest = explicit ?? (await resolveDefaultHomePath(supabase));
      return NextResponse.redirect(new URL(dest, request.nextUrl.origin));
    }

    // Only run DB checks for app pages (not static, not auth flow)
    if (current === "aal2" && !isStatic && !isAuthFlow) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_active, must_change_password, role_id, roles(name)")
        .eq("id", user.id)
        .single();

      // Deactivated user → sign out and redirect
      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "?error=deactivated";
        return NextResponse.redirect(url);
      }

      // Must change password → force to /change-password
      if (profile?.must_change_password && !pathname.startsWith("/change-password")) {
        const url = request.nextUrl.clone();
        url.pathname = "/change-password";
        url.search = "";
        return NextResponse.redirect(url);
      }

      // Role-based route access (skip admin role — they get everything)
      // Some routes are available to all authenticated users regardless of role.
      const universalRoutes = ["/profile", "/dashboard"];
      const roleName = (profile?.roles as unknown as { name: string } | null)?.name;
      if (roleName && roleName !== "admin" && !universalRoutes.some((r) => pathname.startsWith(r))) {
        const { data: permission } = await supabase
          .from("role_permissions")
          .select("role_id, pages!inner(route)")
          .eq("role_id", profile!.role_id)
          .eq("pages.route", pathname)
          .maybeSingle();

        if (!permission) {
          // User does not have access to this route → redirect to their home
          const dest = await resolveDefaultHomePath(supabase);
          return NextResponse.redirect(new URL(dest, request.nextUrl.origin));
        }
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
