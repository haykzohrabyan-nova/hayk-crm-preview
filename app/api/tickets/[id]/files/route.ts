import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import { canMutateTicket } from "@/lib/utils/ticket-access";
import {
  deleteTicketAttachment,
  ticketAttachmentStoragePath,
  uploadTicketAttachment,
  resolveTicketAttachmentMime,
  validateTicketAttachmentFile,
} from "@/lib/utils/ticket-line-files";

type Params = { params: Promise<{ id: string }> };

// POST /api/tickets/[id]/files — multipart: variant_id, file
export async function POST(request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const variantId = String(formData.get("variant_id") ?? "").trim();
  const file = formData.get("file") as File | null;

  if (!variantId) {
    return NextResponse.json({ error: "variant_id is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "File is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const fileErr = validateTicketAttachmentFile(file);
  if (fileErr) {
    return NextResponse.json({ error: fileErr, code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { data: variant, error: varErr } = await admin
    .from("ticket_line_variants")
    .select("id, line_item_id, ticket_id")
    .eq("id", variantId)
    .eq("ticket_id", ticketId)
    .single();

  if (varErr || !variant) {
    return NextResponse.json({ error: "Variant not found on this ticket.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: existingFile } = await admin
    .from("ticket_files")
    .select("id, storage_path")
    .eq("variant_id", variantId)
    .maybeSingle();

  const storagePath = ticketAttachmentStoragePath(ticketId, variantId, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = resolveTicketAttachmentMime(file);
  const uploadResult = await uploadTicketAttachment(admin, storagePath, buffer, mimeType);
  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.error, code: "UPLOAD_ERROR" }, { status: 500 });
  }

  const now = new Date().toISOString();

  if (existingFile?.storage_path && existingFile.storage_path !== storagePath) {
    await deleteTicketAttachment(admin, String(existingFile.storage_path));
  }

  const fileRow = {
    ticket_id: ticketId,
    line_item_id: variant.line_item_id,
    variant_id: variantId,
    storage_path: storagePath,
    file_name: file.name,
    mime_type: mimeType,
    byte_size: file.size,
    uploaded_by_id: userId,
    created_at: now,
  };

  const { data: saved, error: saveErr } = await admin
    .from("ticket_files")
    .upsert(fileRow, { onConflict: "variant_id" })
    .select("id, file_name, mime_type, byte_size")
    .single();

  if (saveErr) {
    await deleteTicketAttachment(admin, storagePath);
    return NextResponse.json({ error: saveErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ file: saved }, { status: 201 });
}
