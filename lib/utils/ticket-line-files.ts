import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const TICKET_ATTACHMENTS_BUCKET = "ticket-attachments";

export const TICKET_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const TICKET_FILE_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

/** Browsers often leave `file.type` empty for PDFs; infer from extension. */
export function resolveTicketAttachmentMime(file: File): string {
  if (file.type && TICKET_FILE_ALLOWED_MIME.has(file.type)) {
    return file.type;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? file.type;
}

export function validateTicketAttachmentFile(file: File): string | null {
  if (file.size > TICKET_FILE_MAX_BYTES) {
    return "File too large. Maximum size is 10 MB.";
  }
  const mime = resolveTicketAttachmentMime(file);
  if (!TICKET_FILE_ALLOWED_MIME.has(mime)) {
    return "Invalid file type. Accepted: JPEG, PNG, WebP, PDF.";
  }
  return null;
}

function mapStorageUploadError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("bucket") &&
    (lower.includes("not found") || lower.includes("does not exist") || lower.includes("not exist"))
  ) {
    return (
      'File storage is not configured. In Supabase Dashboard → Storage, create a private bucket named "ticket-attachments" ' +
      "(or run migration 090_ticket_attachments_storage_bucket.sql)."
    );
  }
  if (lower.includes("payload too large") || lower.includes("entity too large")) {
    return "File too large. Maximum size is 10 MB.";
  }
  if (lower.includes("mime") || lower.includes("content type")) {
    return "Invalid file type. Accepted: JPEG, PNG, WebP, PDF.";
  }
  return "Failed to upload file. Please try again.";
}

export function ticketAttachmentStoragePath(
  ticketId: string,
  variantId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ticketId}/${variantId}/${randomUUID()}-${safeName}`;
}

export async function uploadTicketAttachment(
  admin: SupabaseClient,
  storagePath: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.storage.from(TICKET_ATTACHMENTS_BUCKET).upload(storagePath, buffer, {
    contentType: mimeType || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    console.error("[ticket-attachments] upload failed:", error);
    return { ok: false, error: mapStorageUploadError(error.message ?? "") };
  }
  return { ok: true };
}

export async function deleteTicketAttachment(
  admin: SupabaseClient,
  storagePath: string,
): Promise<void> {
  await admin.storage.from(TICKET_ATTACHMENTS_BUCKET).remove([storagePath]);
}

export async function createTicketAttachmentSignedUrl(
  admin: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 60,
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(TICKET_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.error("[ticket-attachments] signed URL failed:", error);
    return null;
  }
  return data.signedUrl;
}
