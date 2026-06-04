import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  permitResubmitCookieName,
  PERMIT_RESUBMIT_COOKIE_MAX_AGE,
  PERMIT_RESUBMIT_COOKIE_PATH,
} from "@/lib/constants/permit-resubmit-cookie";
import {
  fetchPermitResubmitTicket,
  permitResubmitAlreadySubmitted,
  permitResubmitAwaitingUpload,
} from "@/lib/utils/public-permit-resubmit";
import { verifyResubmitOtp } from "@/lib/utils/public-resubmit-otp";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "permit-verify-otp");
  if (rateLimited) return rateLimited;

  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const code = String(body.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "Verification code is required." }, { status: 400 });

  const admin = createAdminClient();
  const ticket = await fetchPermitResubmitTicket(admin, token);
  if (!ticket) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  if (permitResubmitAlreadySubmitted(ticket)) {
    return NextResponse.json(
      { error: "Documentation was already submitted.", code: "ALREADY_SUBMITTED" },
      { status: 409 },
    );
  }

  if (!permitResubmitAwaitingUpload(ticket)) {
    return NextResponse.json({ error: "This upload link is not active." }, { status: 404 });
  }

  if (!verifyResubmitOtp(code, ticket.sales_permit_otp_hash, ticket.sales_permit_otp_expires_at)) {
    return NextResponse.json({ error: "Invalid or expired code. Check your message and try again." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, status: "upload" });
  res.cookies.set(permitResubmitCookieName(token), "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PERMIT_RESUBMIT_COOKIE_MAX_AGE,
    path: PERMIT_RESUBMIT_COOKIE_PATH,
  });
  return res;
}
