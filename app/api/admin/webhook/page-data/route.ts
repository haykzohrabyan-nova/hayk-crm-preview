import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";

export interface WebhookDelivery {
  id: string;
  attempt: number;
  status: "success" | "failed";
  http_status: number | null;
  response_body: string | null;
  error_message: string | null;
  via: string | null;
  sent_at: string;
}

export interface WebhookOrderRow {
  id: string;
  reference_code: string | null;
  title: string | null;
  contact_name: string | null;
  contact_company: string | null;
  contact_email: string | null;
  quote_final_total: number | null;
  ticket_status: string;
  order_created_at: string;
  /** Latest delivery attempt for this order (null = never sent). */
  latest_delivery: WebhookDelivery | null;
  /** Total number of delivery attempts. */
  delivery_count: number;
}

export interface WebhookPageData {
  orders: WebhookOrderRow[];
  counts: {
    total: number;
    success: number;
    failed: number;
    not_sent: number;
  };
  webhook_configured: boolean;
}

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const deny = await requirePageAccess(userId!, roleName, "/admin");
  if (deny) return deny;

  const admin = createAdminClient();

  // All order-stage tickets, most recent first.
  const { data: tickets, error: ticketsErr } = await admin
    .from("job_tickets")
    .select("id, reference_code, title, contact_name, contact_company, contact_email, quote_final_total, ticket_status, created_at")
    .eq("ticket_kind", "order")
    .in("ticket_status", ["order", "in_production", "completed", "cancelled"])
    .order("created_at", { ascending: false });

  if (ticketsErr) {
    return NextResponse.json({ error: ticketsErr.message }, { status: 500 });
  }

  if (!tickets || tickets.length === 0) {
    return NextResponse.json({
      orders: [],
      counts: { total: 0, success: 0, failed: 0, not_sent: 0 },
      webhook_configured: !!process.env.ORDER_WEBHOOK_URL,
    } satisfies WebhookPageData);
  }

  const ticketIds = tickets.map((t) => t.id);

  // All deliveries for these tickets in one query.
  const { data: deliveries } = await admin
    .from("webhook_deliveries")
    .select("id, ticket_id, attempt, status, http_status, response_body, error_message, via, sent_at")
    .in("ticket_id", ticketIds)
    .order("sent_at", { ascending: false });

  // Group deliveries by ticket_id.
  const deliveriesByTicket = new Map<string, WebhookDelivery[]>();
  for (const d of deliveries ?? []) {
    const list = deliveriesByTicket.get(d.ticket_id) ?? [];
    list.push({
      id:            d.id,
      attempt:       d.attempt,
      status:        d.status as "success" | "failed",
      http_status:   d.http_status,
      response_body: d.response_body,
      error_message: d.error_message,
      via:           d.via,
      sent_at:       d.sent_at,
    });
    deliveriesByTicket.set(d.ticket_id, list);
  }

  let successCount = 0;
  let failedCount = 0;
  let notSentCount = 0;

  const orders: WebhookOrderRow[] = tickets.map((t) => {
    const dels = deliveriesByTicket.get(t.id) ?? [];
    // deliveries already sorted newest-first
    const latest = dels[0] ?? null;

    if (!latest) {
      notSentCount++;
    } else if (latest.status === "success") {
      successCount++;
    } else {
      failedCount++;
    }

    return {
      id:                t.id,
      reference_code:    t.reference_code,
      title:             t.title,
      contact_name:      t.contact_name,
      contact_company:   t.contact_company,
      contact_email:     t.contact_email,
      quote_final_total: t.quote_final_total != null ? Number(t.quote_final_total) : null,
      ticket_status:     t.ticket_status,
      order_created_at:  t.created_at,
      latest_delivery:   latest,
      delivery_count:    dels.length,
    };
  });

  return NextResponse.json({
    orders,
    counts: {
      total:    orders.length,
      success:  successCount,
      failed:   failedCount,
      not_sent: notSentCount,
    },
    webhook_configured: !!process.env.ORDER_WEBHOOK_URL,
  } satisfies WebhookPageData);
}
