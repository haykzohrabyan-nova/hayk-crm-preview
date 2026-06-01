import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import { canAccessTicket } from "@/lib/utils/ticket-access";

type Params = { params: Promise<{ id: string; refundId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (!isPaymentStaffRole(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const { id: rawId, refundId } = await params;
  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: ticket, error: ticketErr } = await admin
    .from("job_tickets")
    .select("id, created_by_id, ticket_status, routed_by_id")
    .eq("id", ticketId)
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (!canAccessTicket(ticket, userId!, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const { data: refund, error } = await admin
    .from("ticket_payment_refunds")
    .select("id, ticket_id, evidence_path")
    .eq("id", refundId)
    .eq("ticket_id", ticketId)
    .maybeSingle();

  if (error || !refund?.evidence_path) {
    return NextResponse.json({ error: "No refund evidence on file.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("refund-evidence")
    .createSignedUrl(refund.evidence_path, 60);

  if (signErr || !signed?.signedUrl) {
    console.error("[refund-evidence] signed URL failed:", signErr);
    return NextResponse.json({ error: "Could not open refund evidence.", code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
