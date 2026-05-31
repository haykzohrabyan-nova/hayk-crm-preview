import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { resolveTicketId } from "@/lib/utils/reference-codes";

type Params = { params: Promise<{ id: string; refundId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "accountant" && roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id: rawId, refundId } = await params;
  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const { data: refund, error } = await admin
    .from("ticket_payment_refunds")
    .select("id, ticket_id, evidence_path")
    .eq("id", refundId)
    .eq("ticket_id", ticketId)
    .maybeSingle();

  if (error || !refund?.evidence_path) {
    return NextResponse.json({ error: "No refund evidence on file." }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("refund-evidence")
    .createSignedUrl(refund.evidence_path, 60);

  if (signErr || !signed?.signedUrl) {
    console.error("[refund-evidence] signed URL failed:", signErr);
    return NextResponse.json({ error: "Could not open refund evidence." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
