export const PAYMENT_EVIDENCE_RESUBMIT_COOKIE_PREFIX = "bazaar_payment_evidence_verified_";
export const PAYMENT_EVIDENCE_RESUBMIT_COOKIE_MAX_AGE = 30 * 60;
/** Must be `/` so the cookie is sent to `/api/public/evidence/...`. */
export const PAYMENT_EVIDENCE_RESUBMIT_COOKIE_PATH = "/";

export function paymentEvidenceResubmitCookieName(token: string): string {
  return `${PAYMENT_EVIDENCE_RESUBMIT_COOKIE_PREFIX}${token}`;
}
