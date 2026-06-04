export const PERMIT_RESUBMIT_COOKIE_PREFIX = "bazaar_permit_verified_";
export const PERMIT_RESUBMIT_COOKIE_MAX_AGE = 30 * 60;
/** Must be `/` so the cookie is sent to `/api/public/permit/...` (not only `/permit/[token]`). */
export const PERMIT_RESUBMIT_COOKIE_PATH = "/";

export function permitResubmitCookieName(token: string): string {
  return `${PERMIT_RESUBMIT_COOKIE_PREFIX}${token}`;
}
