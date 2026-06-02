import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireTicketDetailPageAccess } from "@/lib/auth/require-page-access";
import { canMutateTicket } from "@/lib/utils/ticket-access";
import { resolveTicketId } from "@/lib/utils/reference-codes";
import { copyCustomerTaxExemptToTicket } from "@/lib/utils/customer-tax-exempt";
import { notifyPublicQuoteUpdatedByTicketId } from "@/lib/integrations/notify-public-quote-updated";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** POST — copy customer last tax-exempt permit onto this ticket. */
export async function POST(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireTicketDetailPageAccess(userId, roleName);
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();
  const ticketId = await resolveTicketId(admin, rawId);
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: ticket } = await admin
    .from("job_tickets")
    .select("id, created_by_id, customer_id")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (!canMutateTicket(ticket, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }
  if (!ticket.customer_id) {
    return NextResponse.json(
      { error: "Link a customer before reusing a tax-exempt permit.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const result = await copyCustomerTaxExemptToTicket(admin, ticket.customer_id, ticketId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: "VALIDATION_ERROR" }, { status: 400 });
  }

  notifyPublicQuoteUpdatedByTicketId(admin, ticketId);

  return NextResponse.json({
    ok: true,
    file_name: result.file_name,
    permit_number: result.permit_number,
  });
}
