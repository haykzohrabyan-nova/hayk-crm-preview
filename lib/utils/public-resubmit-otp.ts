import { createHash, randomInt, timingSafeEqual } from "crypto";

const OTP_TTL_MS = 15 * 60 * 1000;

export type ResubmitOtpPurpose = "permit" | "payment_evidence";

function otpSecret(): string {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!secret) throw new Error("OTP secret not configured.");
  return secret;
}

function otpHashNamespace(purpose: ResubmitOtpPurpose): string {
  return purpose === "permit" ? "permit-resubmit" : "payment-evidence-resubmit";
}

export function generateResubmitOtp(
  purpose: ResubmitOtpPurpose = "permit",
): { code: string; hash: string; expiresAt: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const hash = hashResubmitOtp(code, purpose);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  return { code, hash, expiresAt };
}

export function hashResubmitOtp(code: string, purpose: ResubmitOtpPurpose = "permit"): string {
  return createHash("sha256")
    .update(`${otpSecret()}:${otpHashNamespace(purpose)}:${code}`)
    .digest("hex");
}

export function verifyResubmitOtp(
  code: string,
  storedHash: string | null | undefined,
  expiresAt: string | null | undefined,
  purpose: ResubmitOtpPurpose = "permit",
): boolean {
  if (!storedHash || !expiresAt) return false;
  if (Date.now() > new Date(expiresAt).getTime()) return false;
  const normalized = code.replace(/\D/g, "").padStart(6, "0").slice(-6);
  if (normalized.length !== 6) return false;
  const computed = Buffer.from(hashResubmitOtp(normalized, purpose), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}
