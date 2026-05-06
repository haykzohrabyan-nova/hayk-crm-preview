import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/lib/auth/safe-return-path";
import { resolveDefaultHomePath } from "@/lib/auth/resolve-default-home";

/** Where to send the user after login/MFA (`next` query wins; else non-auth path + search). */
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
  ];
  if (authPrefixes.some((p) => pathname.startsWith(p))) return null;
  return safeReturnPath(pathname + search);
}

export async function proxy(request: NextRequest) {
  // Skip auth entirely when Supabase env vars are not configured (local UI dev).
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
    pathname.startsWith("/verify-2fa");

  const isStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".");

  // Not logged in → redirect to login, preserving deep link
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

    // No MFA enrolled (aal1 → aal1): force setup
    if (current === "aal1" && next === "aal1" && !pathname.startsWith("/setup-2fa")) {
      const url = request.nextUrl.clone();
      url.pathname = "/setup-2fa";
      url.search = "";
      const ct = continueTargetFromRequest(request);
      if (ct) url.searchParams.set("next", ct);
      return NextResponse.redirect(url);
    }

    // MFA enrolled but not yet verified this session (aal1 → aal2): verify
    if (current === "aal1" && next === "aal2" && !pathname.startsWith("/verify-2fa")) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify-2fa";
      url.search = "";
      const ct = continueTargetFromRequest(request);
      if (ct) url.searchParams.set("next", ct);
      return NextResponse.redirect(url);
    }

    // Fully verified (aal2): kick auth-flow pages back to app
    if (current === "aal2" && isAuthFlow) {
      const explicit = safeReturnPath(request.nextUrl.searchParams.get("next"));
      const dest = explicit ?? (await resolveDefaultHomePath(supabase));
      return NextResponse.redirect(new URL(dest, request.nextUrl.origin));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
