import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireTicketDetailPageAccess } from "@/lib/auth/require-page-access";
import { canAccessTicket, canMutateTicket } from "@/lib/utils/ticket-access";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import {
  validateTicketAttachmentFile,
  resolveTicketAttachmentMime,
  uploadTicketAttachment,
  deleteTicketAttachment,
  createTicketAttachmentSignedUrl,
} from "@/lib/utils/ticket-line-files";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function salesPermitStoragePath(ticketId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ticketId}/sales-permit/${randomUUID()}-${safeName}`;
}

// ─── GET — redirect to 60-second signed URL ───────────────────────────────────

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireTicketDetailPageAccess(userId, roleName);
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });

  const { data: ticket } = await admin
    .from("job_tickets")
    .select("id, created_by_id, ticket_status, routed_by_id, sales_permit_storage_path, sales_permit_file_name")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  if (!canAccessTicket(ticket, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (!ticket.sales_permit_storage_path) {
    return NextResponse.json({ error: "No sales permit file on this ticket.", code: "NOT_FOUND" }, { status: 404 });
  }

  const signedUrl = await createTicketAttachmentSignedUrl(admin, ticket.sales_permit_storage_path, 60);
  if (!signedUrl) {
    return NextResponse.json({ error: "Could not generate download URL." }, { status: 500 });
  }

  return NextResponse.redirect(signedUrl);
}

// ─── POST — upload or replace the sales permit file ──────────────────────────

export async function POST(request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireTicketDetailPageAccess(userId, roleName);
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });

  const { data: ticket } = await admin
    .from("job_tickets")
    .select("id, created_by_id, sales_permit_storage_path")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  if (!canMutateTicket(ticket, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const validationError = validateTicketAttachmentFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError, code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const mimeType = resolveTicketAttachmentMime(file);
  const storagePath = salesPermitStoragePath(ticketId, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  // Delete previous file if one exists
  if (ticket.sales_permit_storage_path) {
    await deleteTicketAttachment(admin, ticket.sales_permit_storage_path);
  }

  const uploadResult = await uploadTicketAttachment(admin, storagePath, buffer, mimeType);
  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.error, code: "UPLOAD_ERROR" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      sales_permit_storage_path: storagePath,
      sales_permit_file_name: file.name,
      sales_permit_mime_type: mimeType,
      updated_at: now,
    })
    .eq("id", ticketId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, file_name: file.name, mime_type: mimeType });
}

// ─── DELETE — remove the sales permit file ───────────────────────────────────

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireTicketDetailPageAccess(userId, roleName);
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });

  const { data: ticket } = await admin
    .from("job_tickets")
    .select("id, created_by_id, sales_permit_storage_path")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  if (!canMutateTicket(ticket, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (!ticket.sales_permit_storage_path) {
    return NextResponse.json({ ok: true }); // already gone — idempotent
  }

  await deleteTicketAttachment(admin, ticket.sales_permit_storage_path);

  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      sales_permit_storage_path: null,
      sales_permit_file_name: null,
      sales_permit_mime_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
