import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  paymentEvidenceResubmitCookieName,
  PAYMENT_EVIDENCE_RESUBMIT_COOKIE_MAX_AGE,
  PAYMENT_EVIDENCE_RESUBMIT_COOKIE_PATH,
} from "@/lib/constants/payment-evidence-resubmit-cookie";
import {
  fetchPaymentEvidenceResubmitTicket,
  paymentEvidenceResubmitAlreadySubmitted,
  paymentEvidenceResubmitAwaitingUpload,
} from "@/lib/utils/public-payment-evidence-resubmit";
import { verifyResubmitOtp } from "@/lib/utils/public-resubmit-otp";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "evidence-verify-otp");
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
  const ticket = await fetchPaymentEvidenceResubmitTicket(admin, token);
  if (!ticket) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  if (paymentEvidenceResubmitAlreadySubmitted(ticket)) {
    return NextResponse.json(
      { error: "Payment proof was already submitted.", code: "ALREADY_SUBMITTED" },
      { status: 409 },
    );
  }

  if (!paymentEvidenceResubmitAwaitingUpload(ticket)) {
    return NextResponse.json({ error: "This upload link is not active." }, { status: 404 });
  }

  if (
    !verifyResubmitOtp(
      code,
      ticket.payment_evidence_otp_hash,
      ticket.payment_evidence_otp_expires_at,
      "payment_evidence",
    )
  ) {
    return NextResponse.json({ error: "Invalid or expired code. Check your message and try again." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, status: "upload" });
  res.cookies.set(paymentEvidenceResubmitCookieName(token), "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PAYMENT_EVIDENCE_RESUBMIT_COOKIE_MAX_AGE,
    path: PAYMENT_EVIDENCE_RESUBMIT_COOKIE_PATH,
  });
  return res;
}
