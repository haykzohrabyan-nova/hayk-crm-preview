import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  permitResubmitCookieName,
  PERMIT_RESUBMIT_COOKIE_PATH,
} from "@/lib/constants/permit-resubmit-cookie";
import {
  fetchPermitResubmitTicket,
  permitResubmitAlreadySubmitted,
  permitResubmitAwaitingUpload,
} from "@/lib/utils/public-permit-resubmit";
import {
  validateTicketAttachmentFile,
  resolveTicketAttachmentMime,
  uploadTicketAttachment,
  deleteTicketAttachment,
} from "@/lib/utils/ticket-line-files";
import { refreshCustomerTaxExemptFileFromTicket } from "@/lib/utils/customer-tax-exempt";
import { notifyPublicQuoteUpdatedByTicketId } from "@/lib/integrations/notify-public-quote-updated";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";

type Params = { params: Promise<{ token: string }> };

function salesPermitStoragePath(ticketId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ticketId}/sales-permit/${randomUUID()}-${safeName}`;
}

export async function POST(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "permit-upload");
  if (rateLimited) return rateLimited;

  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const cookieStore = await cookies();
  if (cookieStore.get(permitResubmitCookieName(token))?.value !== "1") {
    return NextResponse.json({ error: "Please verify your code first.", code: "OTP_REQUIRED" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ticket = await fetchPermitResubmitTicket(admin, token);
  if (!ticket) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  if (permitResubmitAlreadySubmitted(ticket)) {
    return NextResponse.json(
      { error: "Documentation was already submitted.", code: "ALREADY_SUBMITTED" },
      { status: 409 },
    );
  }

  if (!permitResubmitAwaitingUpload(ticket)) {
    return NextResponse.json({ error: "This upload link is not active." }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const permitNumber = String(formData?.get("permitNumber") ?? "").replace(/\D/g, "");

  if (!permitNumber) {
    return NextResponse.json({ error: "Sales permit number is required (numbers only)." }, { status: 400 });
  }
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Permit file is required." }, { status: 400 });
  }

  const validationError = validateTicketAttachmentFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const mimeType = resolveTicketAttachmentMime(file);
  const storagePath = salesPermitStoragePath(ticket.id, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ticket.sales_permit_storage_path) {
    await deleteTicketAttachment(admin, ticket.sales_permit_storage_path);
  }

  const uploadResult = await uploadTicketAttachment(admin, storagePath, buffer, mimeType);
  if (!uploadResult.ok) {
    return NextResponse.json({ error: uploadResult.error }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      sales_permit_storage_path: storagePath,
      sales_permit_file_name: file.name,
      sales_permit_mime_type: mimeType,
      sales_permit_number: permitNumber,
      sales_permit_submitted_at: now,
      sales_permit_reviewed_at: null,
      sales_permit_reviewed_by_id: null,
      sales_permit_reused_from_customer: false,
      sales_permit_resubmit_requested_at: null,
      sales_permit_resubmit_requested_by_id: null,
      sales_permit_resubmit_reason: null,
      sales_permit_resubmit_received_at: now,
      sales_permit_otp_hash: null,
      sales_permit_otp_expires_at: null,
      updated_at: now,
    })
    .eq("id", ticket.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (ticket.customer_id) {
    await refreshCustomerTaxExemptFileFromTicket(admin, ticket.customer_id, {
      sales_permit_storage_path: storagePath,
      sales_permit_file_name: file.name,
      sales_permit_mime_type: mimeType,
      sales_permit_number: permitNumber,
    });
  }

  await admin.from("activities").insert({
    type: "ticket_tax_exempt_resubmit_received",
    lead_id: ticket.linked_lead_id ?? null,
    customer_id: ticket.customer_id ?? null,
    ticket_id: ticket.id,
    by_user_id: null,
    payload: { file_name: file.name, via: "public_permit" },
    created_at: now,
  });

  notifyPublicQuoteUpdatedByTicketId(admin, ticket.id);

  const res = NextResponse.json({ ok: true, status: "thank_you" });
  res.cookies.set(permitResubmitCookieName(token), "", { maxAge: 0, path: PERMIT_RESUBMIT_COOKIE_PATH });
  return res;
}
