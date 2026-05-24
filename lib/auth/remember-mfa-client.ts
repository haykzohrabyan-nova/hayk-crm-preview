import { REMEMBER_MFA_STORAGE_KEY } from "@/lib/auth/mfa-trust";

export function setRememberMfaPreference(remember: boolean) {
  if (typeof window === "undefined") return;
  if (remember) {
    sessionStorage.setItem(REMEMBER_MFA_STORAGE_KEY, "1");
  } else {
    sessionStorage.removeItem(REMEMBER_MFA_STORAGE_KEY);
  }
}

export function consumeRememberMfaPreference(): boolean {
  if (typeof window === "undefined") return false;
  const value = sessionStorage.getItem(REMEMBER_MFA_STORAGE_KEY) === "1";
  sessionStorage.removeItem(REMEMBER_MFA_STORAGE_KEY);
  return value;
}

/** After successful TOTP verify — trust this browser for 30 days if user opted in at login. */
export async function maybeCreateMfaTrustAfterVerify(): Promise<void> {
  if (!consumeRememberMfaPreference()) return;
  try {
    await fetch("/api/auth/mfa-trust", { method: "POST" });
  } catch {
    // Non-blocking — user still proceeds without trust
  }
}

/** Clear trusted device on sign out. */
export async function revokeMfaTrustOnSignOut(): Promise<void> {
  try {
    await fetch("/api/auth/mfa-trust", { method: "DELETE" });
  } catch {
    // best-effort
  }
}
