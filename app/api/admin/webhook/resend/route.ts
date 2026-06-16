import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { sendOrderWebhook } from "@/lib/utils/send-order-webhook";

export async function POST(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const deny = await requirePageAccess(userId!, roleName, "/admin");
  if (deny) return deny;

  if (!process.env.ORDER_WEBHOOK_URL) {
    return NextResponse.json(
      { error: "ORDER_WEBHOOK_URL is not configured.", code: "NOT_CONFIGURED" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const ticketId = body?.ticket_id;

  if (!ticketId || typeof ticketId !== "string") {
    return NextResponse.json(
      { error: "ticket_id is required.", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  // Verify the ticket is an order and exists.
  const { data: ticket, error: ticketErr } = await admin
    .from("job_tickets")
    .select("id, reference_code, ticket_kind, order_source")
    .eq("id", ticketId)
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: "Order not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (ticket.ticket_kind !== "order") {
    return NextResponse.json(
      { error: "Ticket is not an order.", code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  // Legacy imported orders must never be sent to the external webhook.
  if (ticket.order_source === "legacy_import") {
    return NextResponse.json(
      { error: "Legacy imported orders cannot be sent to the webhook.", code: "LEGACY_IMPORT" },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();

  // sendOrderWebhook awaits the DB fetch then fires the HTTP call + logging async.
  await sendOrderWebhook(admin, ticketId, ticket.reference_code, "admin_resend", now);

  return NextResponse.json({ ok: true, ticket_id: ticketId, reference_code: ticket.reference_code });
}
