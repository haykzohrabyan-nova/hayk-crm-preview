import { createHash, randomBytes } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Cookie name for trusted-device MFA bypass */
export const MFA_TRUST_COOKIE = "bazaar_mfa_trust";

/** Client sessionStorage key — bridges login "Remember me" → post-verify trust creation */
export const REMEMBER_MFA_STORAGE_KEY = "bazaar_remember_mfa";

/** How long a trusted device skips 2FA */
export const MFA_TRUST_DAYS = 30;

export function hashMfaTrustToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateMfaTrustToken(): string {
  return randomBytes(32).toString("base64url");
}

export function parseMfaTrustCookie(
  value: string | undefined | null,
): { deviceId: string; token: string } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const deviceId = value.slice(0, dot);
  const token = value.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(deviceId) || token.length < 16) return null;
  return { deviceId, token };
}

export function mfaTrustCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function clearMfaTrustCookie(response: NextResponse) {
  response.cookies.set(MFA_TRUST_COOKIE, "", {
    ...mfaTrustCookieOptions(0),
    maxAge: 0,
  });
}

/** Validate trust cookie value for the signed-in user. Updates last_used_at on success. */
export async function hasValidMfaTrustFromCookieValue(
  userId: string,
  cookieValue: string | undefined | null,
): Promise<boolean> {
  const parsed = parseMfaTrustCookie(cookieValue);
  if (!parsed) return false;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mfa_trusted_devices")
    .select("id, user_id, token_hash, expires_at")
    .eq("id", parsed.deviceId)
    .maybeSingle();

  if (!row || row.user_id !== userId) return false;
  if (new Date(row.expires_at).getTime() <= Date.now()) return false;
  if (row.token_hash !== hashMfaTrustToken(parsed.token)) return false;

  void admin
    .from("mfa_trusted_devices")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return true;
}

/** Validate trust cookie for the signed-in user. Updates last_used_at on success. */
export async function hasValidMfaTrust(
  request: NextRequest,
  userId: string,
): Promise<boolean> {
  return hasValidMfaTrustFromCookieValue(
    userId,
    request.cookies.get(MFA_TRUST_COOKIE)?.value,
  );
}

/** Create a trusted-device row and return cookie value + maxAge. */
export async function createMfaTrustForUser(userId: string): Promise<{
  cookieValue: string;
  maxAgeSeconds: number;
} | null> {
  const admin = createAdminClient();
  const token = generateMfaTrustToken();
  const expiresAt = new Date(Date.now() + MFA_TRUST_DAYS * 24 * 60 * 60 * 1000);

  const { data: row, error } = await admin
    .from("mfa_trusted_devices")
    .insert({
      user_id: userId,
      token_hash: hashMfaTrustToken(token),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (error || !row) {
    console.error("[mfa-trust] insert failed:", error?.message);
    return null;
  }

  return {
    cookieValue: `${row.id}.${token}`,
    maxAgeSeconds: MFA_TRUST_DAYS * 24 * 60 * 60,
  };
}

/** Revoke the device in the current browser cookie, if any. */
export async function revokeMfaTrustFromRequest(
  request: NextRequest,
): Promise<void> {
  const parsed = parseMfaTrustCookie(request.cookies.get(MFA_TRUST_COOKIE)?.value);
  if (!parsed) return;

  const admin = createAdminClient();
  await admin.from("mfa_trusted_devices").delete().eq("id", parsed.deviceId);
}
