import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentEvidenceResubmitCookieName } from "@/lib/constants/payment-evidence-resubmit-cookie";
import {
  fetchPaymentEvidenceResubmitTicket,
  paymentEvidenceResubmitAlreadySubmitted,
  paymentEvidenceResubmitAwaitingUpload,
  paymentEvidenceResubmitDueAmount,
  paymentEvidenceResubmitSubmittedMethod,
} from "@/lib/utils/public-payment-evidence-resubmit";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";

type Params = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "evidence-status");
  if (rateLimited) return rateLimited;

  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const admin = createAdminClient();
  const ticket = await fetchPaymentEvidenceResubmitTicket(admin, token);
  if (!ticket) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const { data: company } = await admin
    .from("company_settings")
    .select("company_name")
    .eq("id", 1)
    .single();

  if (paymentEvidenceResubmitAlreadySubmitted(ticket)) {
    return NextResponse.json({
      status: "already_submitted",
      reference_code: ticket.reference_code,
      company_name: company?.company_name ?? null,
    });
  }

  if (!paymentEvidenceResubmitAwaitingUpload(ticket)) {
    return NextResponse.json({ error: "This upload link is not active.", code: "NOT_ACTIVE" }, { status: 404 });
  }

  const submittedMethod = paymentEvidenceResubmitSubmittedMethod(ticket);
  if (!submittedMethod) {
    return NextResponse.json(
      {
        error:
          "We could not determine how this order was paid. Please contact the shop for help uploading payment proof.",
        code: "NO_SUBMITTED_METHOD",
      },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const verified = cookieStore.get(paymentEvidenceResubmitCookieName(token))?.value === "1";

  return NextResponse.json({
    status: verified ? "upload" : "otp_required",
    reference_code: ticket.reference_code,
    company_name: company?.company_name ?? null,
    amount_due: paymentEvidenceResubmitDueAmount(ticket),
    submitted_payment_method: submittedMethod,
  });
}
