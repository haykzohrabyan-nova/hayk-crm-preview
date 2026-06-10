import type { SessionSuccess } from "@/lib/auth/require-session";

/**
 * Returns true if the session has the given action permission key.
 *
 * Usage (server Route Handler):
 *   const session = await requireSession();
 *   if (session.errorResponse) return session.errorResponse;
 *   if (!hasPermission(session, "leads.claim")) return 403;
 *
 * NOTE: During RBAC Slice 0 these grants are loaded but NOT yet enforced —
 * existing roleName checks remain authoritative. Enforcement switches on in Slice 1+.
 */
export function hasPermission(
  session: Pick<SessionSuccess, "actionGrants">,
  key: string,
): boolean {
  return session.actionGrants.includes(key);
}

/**
 * Returns true if the session has ALL of the given keys.
 */
export function hasAllPermissions(
  session: Pick<SessionSuccess, "actionGrants">,
  keys: string[],
): boolean {
  return keys.every((k) => session.actionGrants.includes(k));
}

/**
 * Returns true if the session has ANY of the given keys.
 */
export function hasAnyPermission(
  session: Pick<SessionSuccess, "actionGrants">,
  keys: string[],
): boolean {
  return keys.some((k) => session.actionGrants.includes(k));
}
