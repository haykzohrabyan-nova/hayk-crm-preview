import { NextRequest, NextResponse } from "next/server";
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
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
}

export type WebhookFilterTab = "all" | "success" | "failed" | "not_sent";

const DEFAULT_LIMIT = 25;

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const deny = await requirePageAccess(userId!, roleName, "/admin");
  if (deny) return deny;

  const params = request.nextUrl.searchParams;
  const tab = (params.get("tab") ?? "all") as WebhookFilterTab;
  const search = params.get("search")?.trim() ?? "";
  const dateFrom = params.get("date_from")?.trim() || undefined;
  const dateTo = params.get("date_to")?.trim() || undefined;
  const limit = Math.min(Math.max(parseInt(params.get("limit") ?? String(DEFAULT_LIMIT)), 1), 100);
  const offset = Math.max(parseInt(params.get("offset") ?? "0"), 0);

  const admin = createAdminClient();

  // Fetch non-legacy order-stage tickets, most recent first.
  // legacy_import orders are excluded — they are historical and must never be sent to the webhook.
  let query = admin
    .from("job_tickets")
    .select("id, reference_code, title, contact_name, contact_company, contact_email, quote_final_total, ticket_status, created_at")
    .eq("ticket_kind", "order")
    .in("ticket_status", ["order", "in_production", "completed", "cancelled"])
    .or("order_source.is.null,order_source.neq.legacy_import")
    .order("created_at", { ascending: false });

  if (search) {
    query = (query as typeof query).ilike("reference_code", `%${search}%`);
  }
  if (dateFrom) {
    query = (query as typeof query).gte("created_at", dateFrom);
  }
  if (dateTo) {
    query = (query as typeof query).lte("created_at", dateTo);
  }

  const { data: tickets, error: ticketsErr } = await query;

  if (ticketsErr) {
    return NextResponse.json({ error: ticketsErr.message }, { status: 500 });
  }

  if (!tickets || tickets.length === 0) {
    return NextResponse.json({
      orders: [],
      counts: { total: 0, success: 0, failed: 0, not_sent: 0 },
      webhook_configured: !!process.env.ORDER_WEBHOOK_URL,
      pagination: { total: 0, offset, limit },
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

  // Build all order rows (unfiltered) for accurate tab counts.
  let successCount = 0;
  let failedCount = 0;
  let notSentCount = 0;

  const allOrders: WebhookOrderRow[] = tickets.map((t) => {
    const dels = deliveriesByTicket.get(t.id) ?? [];
    const latest = dels[0] ?? null;

    if (!latest)                      notSentCount++;
    else if (latest.status === "success") successCount++;
    else                              failedCount++;

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

  // Apply tab filter then paginate.
  const filtered = tab === "all"       ? allOrders
                 : tab === "not_sent"  ? allOrders.filter((o) => !o.latest_delivery)
                 : tab === "success"   ? allOrders.filter((o) => o.latest_delivery?.status === "success")
                 :                      allOrders.filter((o) => o.latest_delivery?.status === "failed");

  const page = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    orders: page,
    counts: {
      total:    allOrders.length,
      success:  successCount,
      failed:   failedCount,
      not_sent: notSentCount,
    },
    webhook_configured: !!process.env.ORDER_WEBHOOK_URL,
    pagination: { total: filtered.length, offset, limit },
  } satisfies WebhookPageData);
}
