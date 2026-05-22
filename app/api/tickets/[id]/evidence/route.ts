import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { resolveTicketId } from "@/lib/utils/reference-codes";

// GET /api/tickets/[id]/evidence
// Generates a short-lived signed URL for the payment evidence file and redirects.
// Restricted to accountant and admin roles.

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;

  const { roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "accountant" && roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: ticket, error } = await admin
    .from("job_tickets")
    .select("payment_evidence_url")
    .eq("id", ticketId)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (!ticket.payment_evidence_url) {
    return NextResponse.json({ error: "No payment evidence on file." }, { status: 404 });
  }

  // Generate a 60-second signed URL — expires quickly so it can't be shared
  const { data: signed, error: signErr } = await admin.storage
    .from("payment-evidence")
    .createSignedUrl(ticket.payment_evidence_url, 60);

  if (signErr || !signed?.signedUrl) {
    console.error("[evidence] signed URL generation failed:", signErr);
    return NextResponse.json({ error: "Could not generate file URL." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
