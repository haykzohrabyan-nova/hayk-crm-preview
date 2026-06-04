import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { permitResubmitCookieName } from "@/lib/constants/permit-resubmit-cookie";
import {
  fetchPermitResubmitTicket,
  permitResubmitAlreadySubmitted,
  permitResubmitAwaitingUpload,
} from "@/lib/utils/public-permit-resubmit";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";

type Params = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "permit-status");
  if (rateLimited) return rateLimited;

  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const admin = createAdminClient();
  const ticket = await fetchPermitResubmitTicket(admin, token);
  if (!ticket) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const { data: company } = await admin
    .from("company_settings")
    .select("company_name")
    .eq("id", 1)
    .single();

  if (permitResubmitAlreadySubmitted(ticket)) {
    return NextResponse.json({
      status: "already_submitted",
      reference_code: ticket.reference_code,
      company_name: company?.company_name ?? null,
    });
  }

  if (!permitResubmitAwaitingUpload(ticket)) {
    return NextResponse.json({ error: "This upload link is not active.", code: "NOT_ACTIVE" }, { status: 404 });
  }

  const cookieStore = await cookies();
  const verified = cookieStore.get(permitResubmitCookieName(token))?.value === "1";

  return NextResponse.json({
    status: verified ? "upload" : "otp_required",
    reference_code: ticket.reference_code,
    company_name: company?.company_name ?? null,
  });
}
