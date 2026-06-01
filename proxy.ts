import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/lib/auth/safe-return-path";
import { isAdminOnlyPagePath } from "@/lib/auth/admin-only-pages";
import { resolveDefaultHomePath } from "@/lib/auth/resolve-default-home";
import { isMfaRequired } from "@/lib/auth/mfa-required";
import { hasValidMfaTrust } from "@/lib/auth/mfa-trust";

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
    // Fail closed — never bypass auth due to a missing env var.
    return new NextResponse("Service unavailable: auth is not configured.", { status: 503 });
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

  // Public customer-facing pages — no auth required
  const isPublic = pathname.startsWith("/q/") || pathname === "/policy";

  // Not logged in → redirect to login
  if (!user && !isAuthFlow && !isPublic && !isStatic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const ct = continueTargetFromRequest(request);
    if (ct) url.searchParams.set("next", ct);
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_active, must_change_password, mfa_required, role_id, roles(name)")
      .eq("id", user.id)
      .single();

    const mfaRequired = isMfaRequired(profile);

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const current = aal?.currentLevel;
    const next = aal?.nextLevel;

    const mfaTrusted =
      mfaRequired && user ? await hasValidMfaTrust(request, user.id) : false;

    if (mfaRequired && !mfaTrusted) {
      // No MFA enrolled → force setup
      if (current === "aal1" && next === "aal1" && !pathname.startsWith("/setup-2fa") && !isPublic) {
        const url = request.nextUrl.clone();
        url.pathname = "/setup-2fa";
        url.search = "";
        const ct = continueTargetFromRequest(request);
        if (ct) url.searchParams.set("next", ct);
        return NextResponse.redirect(url);
      }

      // MFA enrolled but not verified this session → verify
      if (current === "aal1" && next === "aal2" && !pathname.startsWith("/verify-2fa") && !isPublic) {
        const url = request.nextUrl.clone();
        url.pathname = "/verify-2fa";
        url.search = "";
        const ct = continueTargetFromRequest(request);
        if (ct) url.searchParams.set("next", ct);
        return NextResponse.redirect(url);
      }
    } else if (
      (pathname.startsWith("/setup-2fa") || pathname.startsWith("/verify-2fa")) &&
      !isPublic
    ) {
      const dest = await resolveDefaultHomePath(supabase);
      return NextResponse.redirect(new URL(dest, request.nextUrl.origin));
    }

    const sessionReady = current === "aal2" || !mfaRequired || mfaTrusted;

    // App-ready session: kick auth-flow pages back to app
    if (sessionReady && isAuthFlow && !pathname.startsWith("/change-password")) {
      const explicit = safeReturnPath(request.nextUrl.searchParams.get("next"));
      const dest = explicit ?? (await resolveDefaultHomePath(supabase));
      return NextResponse.redirect(new URL(dest, request.nextUrl.origin));
    }

    // Legacy /production routes — merged into /orders (tab + detail)
    if (sessionReady && pathname === "/production") {
      const url = request.nextUrl.clone();
      url.pathname = "/orders";
      url.searchParams.set("tab", "in_production");
      return NextResponse.redirect(url);
    }
    if (sessionReady && pathname.startsWith("/production/")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.replace(/^\/production\//, "/orders/");
      url.search = "";
      return NextResponse.redirect(url);
    }

    // App pages: profile, password gate, RBAC
    if (sessionReady && !isStatic && !isAuthFlow && !isPublic) {
      // Deactivated user → sign out and redirect
      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "?error=deactivated";
        return NextResponse.redirect(url);
      }

      // Must change password → force to /change-password
      if (profile?.must_change_password && !pathname.startsWith("/change-password") && !isPublic) {
        const url = request.nextUrl.clone();
        url.pathname = "/change-password";
        url.search = "";
        return NextResponse.redirect(url);
      }

      const roleName = (profile?.roles as unknown as { name: string } | null)?.name;

      // /settings is admin-only; all users use /profile for personal account info.
      if (pathname.startsWith("/settings") && roleName !== "admin") {
        return NextResponse.redirect(new URL("/profile", request.nextUrl.origin));
      }

      // Admin Panel, Reports, Activity Log — admin-only regardless of legacy role_permissions rows.
      if (roleName !== "admin" && isAdminOnlyPagePath(pathname)) {
        const dest = await resolveDefaultHomePath(supabase);
        return NextResponse.redirect(new URL(dest, request.nextUrl.origin));
      }

      // Role-based route access (skip admin role — they get everything)
      const universalRoutes = ["/profile", "/dashboard"];
      if (roleName && roleName !== "admin" && !universalRoutes.some((r) => pathname.startsWith(r))) {
        const { data: permissions } = await supabase
          .from("role_permissions")
          .select("pages!inner(route)")
          .eq("role_id", profile!.role_id);

        const allowedRoutes = (permissions ?? []).map(
          (p) => (p.pages as unknown as { route: string }).route
        );

        const hasAccess = allowedRoutes.some(
          (route) => pathname === route || pathname.startsWith(route + "/")
        );

        if (!hasAccess) {
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
