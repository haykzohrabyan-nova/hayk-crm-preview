import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess, requireTicketDetailPageAccess } from "@/lib/auth/require-page-access";
import { isPaymentStaffRole } from "@/lib/auth/role-checks";
import { canAccessTicket, canMutateTicket } from "@/lib/utils/ticket-access";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import {
  validateTicketAttachmentFile,
  resolveTicketAttachmentMime,
  uploadTicketAttachment,
  deleteTicketAttachment,
  createTicketAttachmentSignedUrl,
} from "@/lib/utils/ticket-line-files";
import { notifyPublicQuoteUpdatedByTicketId } from "@/lib/integrations/notify-public-quote-updated";
import { refreshCustomerTaxExemptFileFromTicket } from "@/lib/utils/customer-tax-exempt";

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

  if (!isPaymentStaffRole(roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

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

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });

  const { data: ticket } = await admin
    .from("job_tickets")
    .select(
      "id, linked_lead_id, created_by_id, customer_id, ticket_status, routed_by_id, sales_permit_storage_path, sales_permit_number, sales_permit_resubmit_requested_at",
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });

  if (isPaymentStaffRole(roleName)) {
    const pageDeny = await requirePageAccess(userId, roleName, "/payments");
    if (pageDeny) return pageDeny;
    if (!canAccessTicket(ticket, userId, roleName)) {
      return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
    }
  } else {
    const pageDeny = await requireTicketDetailPageAccess(userId, roleName);
    if (pageDeny) return pageDeny;
    if (!canMutateTicket(ticket, userId, roleName)) {
      return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
    }
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const rawPermitNumber = formData?.get("sales_permit_number");
  const permitNumberFromForm =
    rawPermitNumber != null ? String(rawPermitNumber).trim() : null;
  const staffReplace = isPaymentStaffRole(roleName);

  if (staffReplace && !permitNumberFromForm) {
    return NextResponse.json(
      { error: "Sales Permit # is required.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const nextPermitNumber = permitNumberFromForm ?? ticket.sales_permit_number;

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
  const hadResubmitRequest = !!ticket.sales_permit_resubmit_requested_at;
  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      sales_permit_storage_path: storagePath,
      sales_permit_file_name: file.name,
      sales_permit_mime_type: mimeType,
      ...(permitNumberFromForm ? { sales_permit_number: permitNumberFromForm } : {}),
      sales_permit_submitted_at: now,
      sales_permit_reviewed_at: null,
      sales_permit_reviewed_by_id: null,
      sales_permit_reused_from_customer: false,
      ...(hadResubmitRequest
        ? {
            sales_permit_resubmit_requested_at: null,
            sales_permit_resubmit_requested_by_id: null,
            sales_permit_resubmit_reason: null,
            sales_permit_resubmit_received_at: now,
            sales_permit_resubmit_token: null,
            sales_permit_otp_hash: null,
            sales_permit_otp_expires_at: null,
          }
        : {}),
      updated_at: now,
    })
    .eq("id", ticketId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  await admin.from("activities").insert({
    type: "ticket_tax_exempt_permit_replaced",
    lead_id: ticket.linked_lead_id ?? null,
    customer_id: ticket.customer_id ?? null,
    ticket_id: ticketId,
    by_user_id: userId,
    payload: {
      file_name: file.name,
      permit_number: nextPermitNumber,
      previous_permit_number: ticket.sales_permit_number,
      via: "staff",
      had_previous_file: !!ticket.sales_permit_storage_path,
      cleared_resubmit: hadResubmitRequest,
    },
    created_at: now,
  });

  if (ticket.customer_id) {
    await refreshCustomerTaxExemptFileFromTicket(admin, ticket.customer_id, {
      sales_permit_storage_path: storagePath,
      sales_permit_file_name: file.name,
      sales_permit_mime_type: mimeType,
      sales_permit_number: nextPermitNumber,
    });
  }

  notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

  return NextResponse.json({
    ok: true,
    file_name: file.name,
    mime_type: mimeType,
    sales_permit_number: nextPermitNumber,
  });
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
    .select("id, created_by_id, customer_id, sales_permit_storage_path, sales_permit_number")
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
      sales_permit_submitted_at: null,
      sales_permit_reviewed_at: null,
      sales_permit_reviewed_by_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

  return NextResponse.json({ ok: true });
}
