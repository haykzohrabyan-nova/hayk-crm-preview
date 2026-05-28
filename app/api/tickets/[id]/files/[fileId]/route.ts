import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import { canAccessTicket, canMutateTicket } from "@/lib/utils/ticket-access";
import {
  createTicketAttachmentSignedUrl,
  deleteTicketAttachment,
} from "@/lib/utils/ticket-line-files";

type Params = { params: Promise<{ id: string; fileId: string }> };

// GET /api/tickets/[id]/files/[fileId] — signed URL redirect (staff with ticket access)
export async function GET(_request: NextRequest, { params }: Params) {
  const { id: rawId, fileId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

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

  const { data: fileRow, error: fileErr } = await admin
    .from("ticket_files")
    .select("storage_path")
    .eq("id", fileId)
    .eq("ticket_id", ticketId)
    .single();

  if (fileErr || !fileRow?.storage_path) {
    return NextResponse.json({ error: "File not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const signedUrl = await createTicketAttachmentSignedUrl(admin, String(fileRow.storage_path));
  if (!signedUrl) {
    return NextResponse.json({ error: "Could not generate file URL.", code: "STORAGE_ERROR" }, { status: 500 });
  }

  return NextResponse.redirect(signedUrl);
}

// DELETE /api/tickets/[id]/files/[fileId]
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id: rawId, fileId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: ticket, error: ticketErr } = await admin
    .from("job_tickets")
    .select("id, created_by_id")
    .eq("id", ticketId)
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (!canMutateTicket(ticket, userId!, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const { data: fileRow, error: fileErr } = await admin
    .from("ticket_files")
    .select("storage_path")
    .eq("id", fileId)
    .eq("ticket_id", ticketId)
    .single();

  if (fileErr || !fileRow) {
    return NextResponse.json({ error: "File not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (fileRow.storage_path) {
    await deleteTicketAttachment(admin, String(fileRow.storage_path));
  }

  const { error: delErr } = await admin.from("ticket_files").delete().eq("id", fileId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
