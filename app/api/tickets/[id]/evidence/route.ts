import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import { canAccessTicket } from "@/lib/utils/ticket-access";

type Params = { params: Promise<{ id: string }> };

// GET /api/tickets/[id]/evidence
// Generates a short-lived signed URL for the payment evidence file and redirects.

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;

  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (!isPaymentStaffRole(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Order not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: ticket, error } = await admin
    .from("job_tickets")
    .select("payment_evidence_url, created_by_id, ticket_status, routed_by_id")
    .eq("id", ticketId)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Order not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (!canAccessTicket(ticket, userId!, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  if (!ticket.payment_evidence_url) {
    return NextResponse.json({ error: "No payment evidence on file.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("payment-evidence")
    .createSignedUrl(ticket.payment_evidence_url, 60);

  if (signErr || !signed?.signedUrl) {
    console.error("[evidence] signed URL generation failed:", signErr);
    return NextResponse.json({ error: "Could not generate file URL.", code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
