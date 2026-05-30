import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  attachmentContentDisposition,
  fetchTicketAttachmentBytes,
} from "@/lib/utils/ticket-line-files";
import { buildPublicQuoteFileContentSecurityPolicy } from "@/lib/security/content-security-policy";
import { enforcePublicQuoteRateLimit } from "@/lib/security/enforce-route-rate-limit";

type Params = { params: Promise<{ token: string; fileId: string }> };

// GET /api/public/quotes/[token]/files/[fileId] — stream file for preview (inline) or ?download=1
export async function GET(request: NextRequest, { params }: Params) {
  const rateLimited = enforcePublicQuoteRateLimit(request, "files");
  if (rateLimited) return rateLimited;

  const { token, fileId } = await params;

  if (!token?.trim() || !fileId?.trim()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: ticket, error: ticketErr } = await admin
    .from("job_tickets")
    .select("id")
    .eq("public_token", token)
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  const { data: fileRow, error: fileErr } = await admin
    .from("ticket_files")
    .select("storage_path, file_name, mime_type")
    .eq("id", fileId)
    .eq("ticket_id", ticket.id)
    .single();

  if (fileErr || !fileRow?.storage_path) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const fetched = await fetchTicketAttachmentBytes(admin, String(fileRow.storage_path));
  if (!fetched) {
    return NextResponse.json({ error: "Could not load file." }, { status: 500 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const mime = String(fileRow.mime_type || fetched.contentType || "application/octet-stream");
  const fileName = String(fileRow.file_name || "attachment");

  return new NextResponse(Buffer.from(fetched.data), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": attachmentContentDisposition(fileName, download),
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": buildPublicQuoteFileContentSecurityPolicy(),
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
