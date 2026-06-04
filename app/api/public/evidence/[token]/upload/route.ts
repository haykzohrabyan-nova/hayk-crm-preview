import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  paymentEvidenceResubmitCookieName,
  PAYMENT_EVIDENCE_RESUBMIT_COOKIE_PATH,
} from "@/lib/constants/payment-evidence-resubmit-cookie";
import {
  fetchPaymentEvidenceResubmitTicket,
  paymentEvidenceResubmitAlreadySubmitted,
  paymentEvidenceResubmitAwaitingUpload,
} from "@/lib/utils/public-payment-evidence-resubmit";
import { recordPaymentEvidenceResubmitUpload } from "@/lib/utils/record-payment-evidence-resubmit-upload";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "evidence-upload");
  if (rateLimited) return rateLimited;

  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const cookieStore = await cookies();
  if (cookieStore.get(paymentEvidenceResubmitCookieName(token))?.value !== "1") {
    return NextResponse.json({ error: "Please verify your code first.", code: "OTP_REQUIRED" }, { status: 401 });
  }

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

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const method = String(formData?.get("method") ?? "").trim();
  const receiptId = String(formData?.get("receiptId") ?? "").trim() || null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Payment proof file is required." }, { status: 400 });
  }

  const result = await recordPaymentEvidenceResubmitUpload(admin, ticket, { method, receiptId, file });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = NextResponse.json({ ok: true, status: "thank_you" });
  res.cookies.set(paymentEvidenceResubmitCookieName(token), "", {
    maxAge: 0,
    path: PAYMENT_EVIDENCE_RESUBMIT_COOKIE_PATH,
  });
  return res;
}
