import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/security/get-client-ip";
import { enforceRateLimit } from "@/lib/security/rate-limit";

/** Rate limit unauthenticated public quote endpoints by client IP. */
export function enforcePublicQuoteRateLimit(
  request: NextRequest,
  action: string,
): ReturnType<typeof enforceRateLimit> {
  const ip = getClientIp(request);
  return enforceRateLimit(`public-quote:${action}:${ip}`, 120, 60_000);
}

/** Rate limit auth endpoints by client IP. */
export function enforceAuthRateLimit(
  request: NextRequest,
  action: string,
): ReturnType<typeof enforceRateLimit> {
  const ip = getClientIp(request);
  return enforceRateLimit(`auth:${action}:${ip}`, 20, 60_000);
}
