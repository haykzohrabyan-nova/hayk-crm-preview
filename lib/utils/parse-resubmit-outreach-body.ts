import type { ResubmitOutreachOverride } from "@/lib/integrations/resubmit-requested-outreach";

/** Channel + destination only — message copy comes from admin SMS/email templates. */
export function parseResubmitOutreachBody(body: Record<string, unknown>): ResubmitOutreachOverride | null {
  const rawChannel = String(body.outreach_channel ?? "email").toLowerCase();
  const channel =
    rawChannel === "sms" || rawChannel === "both" ? rawChannel : "email";

  const email = String(body.outreach_email ?? "").trim();
  const phone = String(body.outreach_phone ?? "").trim();

  if (channel === "email" && !email) return null;
  if (channel === "sms" && !phone) return null;
  if (channel === "both" && (!email || !phone)) return null;

  return { channel, email, phone };
}
