import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  clearMfaTrustCookie,
  createMfaTrustForUser,
  mfaTrustCookieOptions,
  MFA_TRUST_COOKIE,
  revokeMfaTrustFromRequest,
} from "@/lib/auth/mfa-trust";
import { enforceAuthRateLimit } from "@/lib/security/enforce-route-rate-limit";

// POST /api/auth/mfa-trust — issue 30-day trusted-device cookie after successful 2FA
export async function POST(request: NextRequest) {
  const rateLimited = enforceAuthRateLimit(request, "mfa-trust-post");
  if (rateLimited) return rateLimited;

  const { supabase } = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return NextResponse.json(
      { error: "Complete two-factor verification first." },
      { status: 403 },
    );
  }

  const trust = await createMfaTrustForUser(user.id);
  if (!trust) {
    return NextResponse.json({ error: "Failed to create trusted device." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, expires_in_days: 30 });
  response.cookies.set(
    MFA_TRUST_COOKIE,
    trust.cookieValue,
    mfaTrustCookieOptions(trust.maxAgeSeconds),
  );
  return response;
}

// DELETE /api/auth/mfa-trust — clear trusted device (sign out)
export async function DELETE(request: NextRequest) {
  await revokeMfaTrustFromRequest(request);

  const response = NextResponse.json({ ok: true });
  clearMfaTrustCookie(response);
  return response;
}
