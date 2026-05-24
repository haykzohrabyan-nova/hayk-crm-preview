/**
 * Returns whether the user must complete TOTP setup/verify before app access.
 * Defaults to true when profile is missing or column is null.
 */
export function isMfaRequired(profile: { mfa_required?: boolean | null } | null | undefined): boolean {
  return profile?.mfa_required !== false;
}
