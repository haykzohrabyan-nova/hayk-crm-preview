import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";

export interface LeadWebhookLogRow {
  id: string;
  status: "accepted" | "failed";
  http_status: number;
  error_message: string | null;
  raw_payload: Record<string, unknown> | null;
  lead_id: string | null;
  customer_id: string | null;
  received_at: string;
  // Joined
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  source: string | null;
}

export interface LeadWebhookPageData {
  rows: LeadWebhookLogRow[];
  counts: {
    total: number;
    accepted: number;
    failed: number;
  };
  webhook_configured: boolean;
  payloads_stored: number;
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
}

export type LeadWebhookFilterTab = "all" | "accepted" | "failed";

const DEFAULT_LIMIT = 25;

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const deny = await requirePageAccess(userId!, roleName, "/admin");
  if (deny) return deny;

  const params = request.nextUrl.searchParams;
  const tab = (params.get("tab") ?? "all") as LeadWebhookFilterTab;
  const search = params.get("search")?.trim() ?? "";
  const dateFrom = params.get("date_from")?.trim() || undefined;
  const dateTo = params.get("date_to")?.trim() || undefined;
  const limit = Math.min(Math.max(parseInt(params.get("limit") ?? String(DEFAULT_LIMIT)), 1), 100);
  const offset = Math.max(parseInt(params.get("offset") ?? "0"), 0);

  const admin = createAdminClient();

  let query = admin
    .from("webhook_lead_log")
    .select(
      "id, status, http_status, error_message, raw_payload, lead_id, customer_id, received_at, customers(first_name, last_name, phone, email), leads(source)"
    )
    .order("received_at", { ascending: false });

  if (tab !== "all") {
    query = (query as typeof query).eq("status", tab);
  }
  if (dateFrom) {
    query = (query as typeof query).gte("received_at", dateFrom);
  }
  if (dateTo) {
    query = (query as typeof query).lte("received_at", dateTo);
  }

  const { data: rawRows, error: rowsErr } = await query;

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  if (!rawRows || rawRows.length === 0) {
    const { count: payloadsStored } = await admin
      .from("webhook_lead_log")
      .select("id", { count: "exact", head: true })
      .not("raw_payload", "is", null);

    return NextResponse.json({
      rows: [],
      counts: { total: 0, accepted: 0, failed: 0 },
      webhook_configured: !!process.env.LEAD_WEBHOOK_SECRET,
      payloads_stored: payloadsStored ?? 0,
      pagination: { total: 0, offset, limit },
    } satisfies LeadWebhookPageData);
  }

  // Build typed rows + counts.
  let acceptedCount = 0;
  let failedCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows: LeadWebhookLogRow[] = rawRows.map((r: any) => {
    if (r.status === "accepted") acceptedCount++;
    else failedCount++;

    const customer = r.customers ?? null;
    const lead = r.leads ?? null;
    const fullName = customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null
      : null;

    return {
      id: r.id,
      status: r.status,
      http_status: r.http_status,
      error_message: r.error_message,
      raw_payload: r.raw_payload,
      lead_id: r.lead_id,
      customer_id: r.customer_id,
      received_at: r.received_at,
      contact_name: fullName,
      contact_phone: customer?.phone ?? null,
      contact_email: customer?.email ?? null,
      source: lead?.source ?? (r.raw_payload?.source as string | null) ?? null,
    };
  });

  // Apply search filter (by contact name, phone, or email).
  const searchLower = search.toLowerCase();
  const filtered = search
    ? allRows.filter((r) =>
        (r.contact_name?.toLowerCase().includes(searchLower)) ||
        (r.contact_phone?.includes(search)) ||
        (r.contact_email?.toLowerCase().includes(searchLower))
      )
    : allRows;

  const page = filtered.slice(offset, offset + limit);

  // Count stored payloads (for the "Clear Payloads" button hint).
  const { count: payloadsStored } = await admin
    .from("webhook_lead_log")
    .select("id", { count: "exact", head: true })
    .not("raw_payload", "is", null);

  return NextResponse.json({
    rows: page,
    counts: {
      total: allRows.length,
      accepted: acceptedCount,
      failed: failedCount,
    },
    webhook_configured: !!process.env.LEAD_WEBHOOK_SECRET,
    payloads_stored: payloadsStored ?? 0,
    pagination: { total: filtered.length, offset, limit },
  } satisfies LeadWebhookPageData);
}
