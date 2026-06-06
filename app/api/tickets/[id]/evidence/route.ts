import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import { canAccessTicket } from "@/lib/utils/ticket-access";
import { staffReplacePaymentEvidence } from "@/lib/utils/staff-replace-payment-evidence";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET /api/tickets/[id]/evidence — signed URL redirect (accountant/admin)
// POST /api/tickets/[id]/evidence — staff replace payment proof file

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

export async function POST(request: NextRequest, { params }: Params) {
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
    .select(
      "id, public_token, linked_lead_id, customer_id, created_by_id, ticket_status, routed_by_id, payment_evidence_url, payment_evidence_amount, payment_method_used, payment_evidence_resubmit_requested_at, payment_evidence_submitted_at, payment_evidence_reviewed_at",
    )
    .eq("id", ticketId)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Order not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (!canAccessTicket(ticket, userId!, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const awaitingReview =
    !!ticket.payment_evidence_submitted_at && !ticket.payment_evidence_reviewed_at;
  if (!awaitingReview && !ticket.payment_evidence_url) {
    return NextResponse.json(
      { error: "This order has no payment proof awaiting review.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const result = await staffReplacePaymentEvidence(admin, ticket, file, userId!);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: "UPLOAD_ERROR" }, { status: result.status });
  }

  return NextResponse.json({ ok: true, file_name: file.name });
}
