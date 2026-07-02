// Hayk 2026-06-30 — local test safety guard.
// When TEST_SMS_RECIPIENT / TEST_EMAIL_RECIPIENT are set (local dev only),
// ALL outbound SMS + email is redirected to Hayk's personal contact info,
// regardless of the lead's real phone/email. Prevents accidental sends to
// real customers while testing.

export function testGuardPhone(originalTo: string): string {
  const forced = process.env.TEST_SMS_RECIPIENT?.trim();
  if (forced && forced.length > 0) {
    console.log(
      `[TEST GUARD] Redirecting SMS/WhatsApp: real=${originalTo} → test=${forced}`
    );
    return forced;
  }
  return originalTo;
}

export function testGuardEmail(originalTo: string): string {
  const forced = process.env.TEST_EMAIL_RECIPIENT?.trim();
  if (forced && forced.length > 0) {
    console.log(
      `[TEST GUARD] Redirecting email: real=${originalTo} → test=${forced}`
    );
    return forced;
  }
  return originalTo;
}
