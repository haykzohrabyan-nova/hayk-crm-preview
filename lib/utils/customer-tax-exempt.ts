import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TICKET_ATTACHMENTS_BUCKET,
  deleteTicketAttachment,
  uploadTicketAttachment,
} from "@/lib/utils/ticket-line-files";

export interface CustomerTaxExemptLastFields {
  tax_exempt_last_permit_number?: string | null;
  tax_exempt_last_storage_path?: string | null;
  tax_exempt_last_file_name?: string | null;
  tax_exempt_last_mime_type?: string | null;
  tax_exempt_last_reviewed_at?: string | null;
}

export function customerHasTaxExemptOnFile(customer: CustomerTaxExemptLastFields): boolean {
  return !!customer.tax_exempt_last_storage_path;
}

export function customerTaxExemptStoragePath(customerId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `customers/${customerId}/tax-exempt/${randomUUID()}-${safeName}`;
}

export function ticketSalesPermitStoragePath(ticketId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ticketId}/sales-permit/${randomUUID()}-${safeName}`;
}

/** Copy bytes from one storage path to another in ticket-attachments bucket. */
export async function copyTicketAttachment(
  admin: SupabaseClient,
  fromPath: string,
  toPath: string,
  mimeType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin.storage.from(TICKET_ATTACHMENTS_BUCKET).download(fromPath);
  if (error || !data) {
    console.error("[customer-tax-exempt] download for copy failed:", error);
    return { ok: false, error: "Could not read source file." };
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return uploadTicketAttachment(admin, toPath, buffer, mimeType);
}

/** After accountant approves a ticket, sync permit file + metadata to customer last-known. */
export async function syncCustomerTaxExemptFromApprovedTicket(
  admin: SupabaseClient,
  customerId: string,
  ticket: {
    id: string;
    sales_permit_storage_path: string;
    sales_permit_file_name: string | null;
    sales_permit_mime_type: string | null;
    sales_permit_number: string | null;
    sales_permit_reviewed_at: string;
    sales_permit_reviewed_by_id: string;
  },
): Promise<void> {
  const fileName = ticket.sales_permit_file_name ?? "permit";
  const mime = ticket.sales_permit_mime_type ?? "application/pdf";
  const destPath = customerTaxExemptStoragePath(customerId, fileName);

  const { data: customer } = await admin
    .from("customers")
    .select("tax_exempt_last_storage_path")
    .eq("id", customerId)
    .maybeSingle();

  if (customer?.tax_exempt_last_storage_path && customer.tax_exempt_last_storage_path !== destPath) {
    await deleteTicketAttachment(admin, customer.tax_exempt_last_storage_path);
  }

  const copyResult = await copyTicketAttachment(
    admin,
    ticket.sales_permit_storage_path,
    destPath,
    mime,
  );
  if (!copyResult.ok) {
    console.error("[customer-tax-exempt] sync copy failed:", copyResult.error);
    return;
  }

  await admin
    .from("customers")
    .update({
      tax_exempt_last_permit_number: ticket.sales_permit_number,
      tax_exempt_last_storage_path: destPath,
      tax_exempt_last_file_name: ticket.sales_permit_file_name,
      tax_exempt_last_mime_type: mime,
      tax_exempt_last_reviewed_at: ticket.sales_permit_reviewed_at,
      tax_exempt_last_reviewed_by_id: ticket.sales_permit_reviewed_by_id,
      tax_exempt_last_source_ticket_id: ticket.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);
}

/** Refresh customer last file metadata from a new upload (clears customer-level review until next ticket approve). */
export async function refreshCustomerTaxExemptFileFromTicket(
  admin: SupabaseClient,
  customerId: string,
  ticket: {
    sales_permit_storage_path: string;
    sales_permit_file_name: string | null;
    sales_permit_mime_type: string | null;
    sales_permit_number: string | null;
  },
): Promise<void> {
  const fileName = ticket.sales_permit_file_name ?? "permit";
  const mime = ticket.sales_permit_mime_type ?? "application/pdf";
  const destPath = customerTaxExemptStoragePath(customerId, fileName);

  const { data: customer } = await admin
    .from("customers")
    .select("tax_exempt_last_storage_path")
    .eq("id", customerId)
    .maybeSingle();

  if (customer?.tax_exempt_last_storage_path && customer.tax_exempt_last_storage_path !== destPath) {
    await deleteTicketAttachment(admin, customer.tax_exempt_last_storage_path);
  }

  const copyResult = await copyTicketAttachment(
    admin,
    ticket.sales_permit_storage_path,
    destPath,
    mime,
  );
  if (!copyResult.ok) {
    console.error("[customer-tax-exempt] refresh copy failed:", copyResult.error);
    return;
  }

  await admin
    .from("customers")
    .update({
      tax_exempt_last_permit_number: ticket.sales_permit_number,
      tax_exempt_last_storage_path: destPath,
      tax_exempt_last_file_name: ticket.sales_permit_file_name,
      tax_exempt_last_mime_type: mime,
      tax_exempt_last_reviewed_at: null,
      tax_exempt_last_reviewed_by_id: null,
      tax_exempt_last_source_ticket_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);
}

/** Copy customer last permit onto a ticket (reuse on new quote). */
export async function copyCustomerTaxExemptToTicket(
  admin: SupabaseClient,
  customerId: string,
  ticketId: string,
): Promise<
  | { ok: true; file_name: string; mime_type: string; permit_number: string | null }
  | { ok: false; error: string }
> {
  const { data: customer, error: custErr } = await admin
    .from("customers")
    .select(
      "tax_exempt_last_storage_path, tax_exempt_last_file_name, tax_exempt_last_mime_type, tax_exempt_last_permit_number",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (custErr || !customer?.tax_exempt_last_storage_path) {
    return { ok: false, error: "No tax-exempt permit on file for this customer." };
  }

  const fileName = customer.tax_exempt_last_file_name ?? "permit";
  const mime = customer.tax_exempt_last_mime_type ?? "application/pdf";
  const destPath = ticketSalesPermitStoragePath(ticketId, fileName);

  const { data: ticket } = await admin
    .from("job_tickets")
    .select("sales_permit_storage_path")
    .eq("id", ticketId)
    .maybeSingle();

  if (ticket?.sales_permit_storage_path) {
    await deleteTicketAttachment(admin, ticket.sales_permit_storage_path);
  }

  const copyResult = await copyTicketAttachment(
    admin,
    customer.tax_exempt_last_storage_path,
    destPath,
    mime,
  );
  if (!copyResult.ok) {
    return { ok: false, error: copyResult.error };
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("job_tickets")
    .update({
      tax_exempt: true,
      sales_permit_number: customer.tax_exempt_last_permit_number,
      sales_permit_storage_path: destPath,
      sales_permit_file_name: fileName,
      sales_permit_mime_type: mime,
      sales_permit_submitted_at: now,
      sales_permit_reviewed_at: null,
      sales_permit_reviewed_by_id: null,
      sales_permit_reused_from_customer: true,
      updated_at: now,
    })
    .eq("id", ticketId);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  return {
    ok: true,
    file_name: fileName,
    mime_type: mime,
    permit_number: customer.tax_exempt_last_permit_number,
  };
}
