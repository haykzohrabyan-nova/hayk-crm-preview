import { NextResponse } from "next/server";
import { isMfaRequired } from "@/lib/auth/mfa-required";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  buildSessionCacheKey,
  getCachedSession,
  setCachedSession,
} from "@/lib/auth/session-cache";
import {
  getCachedAllowedPageRoutes,
  setCachedAllowedPageRoutes,
} from "@/lib/auth/allowed-routes-cache";
import {
  hasValidMfaTrustFromCookieValue,
  MFA_TRUST_COOKIE,
} from "@/lib/auth/mfa-trust";

export type RequireSessionOptions = {
  /** When false, allow AAL1 (e.g. session end during sign-out). Default true. */
  requireMfa?: boolean;
};

export type SessionSuccess = {
  userId: string;
  roleName: string;
  roleId: string | null;
  fullName: string | null;
  allowedRoutes: string[];
  errorResponse: null;
};

export type SessionResult =
  | SessionSuccess
  | {
      userId: null;
      roleName: null;
      roleId: null;
      fullName: null;
      allowedRoutes: null;
      errorResponse: NextResponse;
    };

export async function requireSession(
  options?: RequireSessionOptions,
): Promise<SessionResult> {
  const requireMfa = options?.requireMfa !== false;
  const { supabase, cookieStore } = await createServerSupabase();
  const allCookies = cookieStore.getAll();
  const cacheKey = buildSessionCacheKey(allCookies);

  const cached = getCachedSession(cacheKey);
  if (cached) {
    return cached;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      userId: null,
      roleName: null,
      roleId: null,
      fullName: null,
      allowedRoutes: null,
      errorResponse: NextResponse.json(
        { error: "Not authenticated.", code: "UNAUTHENTICATED" },
        { status: 401 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role_id, full_name, mfa_required, roles(name)")
    .eq("id", user.id)
    .single();

  const roleName =
    (profile?.roles as unknown as { name: string } | null)?.name ?? "";
  const roleId = profile?.role_id != null ? String(profile.role_id) : null;
  const fullName = profile?.full_name != null ? String(profile.full_name) : null;

  if (requireMfa && isMfaRequired(profile)) {
    const trustCookie = cookieStore.get(MFA_TRUST_COOKIE)?.value;
    const mfaTrusted = await hasValidMfaTrustFromCookieValue(user.id, trustCookie);

    if (!mfaTrusted) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const current = aal?.currentLevel;
      const next = aal?.nextLevel;

      if (current !== "aal2") {
        const code =
          current === "aal1" && next === "aal1"
            ? "MFA_SETUP_REQUIRED"
            : "MFA_VERIFY_REQUIRED";

        return {
          userId: null,
          roleName: null,
          roleId: null,
          fullName: null,
          allowedRoutes: null,
          errorResponse: NextResponse.json(
            {
              error: "Two-factor authentication required.",
              code,
            },
            { status: 403 },
          ),
        };
      }
    }
  }

  const allowedRoutes = await getCachedAllowedPageRoutes(user.id, roleName);
  setCachedAllowedPageRoutes(user.id, roleName, allowedRoutes);

  const success: SessionSuccess = {
    userId: user.id,
    roleName,
    roleId,
    fullName,
    allowedRoutes,
    errorResponse: null,
  };
  setCachedSession(cacheKey, success);
  return success;
}
