/**
 * Fires a POST to ORDER_WEBHOOK_URL whenever a ticket becomes an order.
 * Covers all creation paths: quote→order conversion (payment, admin, Stripe,
 * customer confirm) and direct order creation via POST /api/tickets.
 *
 * Fetches the full ticket + line items from DB so the payload is always
 * complete regardless of which code path triggered the conversion.
 *
 * Every attempt (success or failure) is logged to the `webhook_deliveries`
 * table so the admin webhook panel can show delivery status and allow resends.
 *
 * The HTTP POST to the external webhook is fire-and-forget — the DB fetch is
 * awaited but the network call + result logging never block the response.
 *
 * External API contract (workflow-rho-one.vercel.app):
 *   POST ORDER_WEBHOOK_URL
 *   Headers: x-webhook-secret: ORDER_WEBHOOK_SECRET, Content-Type: application/json
 *   Success: { success: true, order_id, order_number }
 *   Errors:  401 missing/invalid secret · 403 webhook disabled · 422 missing fields · 500
 *
 * Payload shape (multi-item format):
 *   - Top-level customer + order metadata fields (always present)
 *   - items[]: one entry per line item with its own product details + skus array
 *   - Legacy flat product fields from the first line item retained for backward compat
 *
 * product_type: sent as null — no Roll/Sheet/Flat/Folded classification exists in the DB.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { TICKET_ATTACHMENTS_BUCKET } from "@/lib/utils/ticket-line-files";

type AdminClient = ReturnType<typeof createAdminClient>;

/** 7 days — long enough for delayed/retried webhook delivery; external system should download immediately on receipt. */
const ARTWORK_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

async function signedArtworkUrl(admin: AdminClient, storagePath: string): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(TICKET_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, ARTWORK_URL_EXPIRY_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

interface LineItem {
  id: string;
  product_type: string;
  description: string | null;
  material: string | null;
  lamination: string | null;
  color_mode: string | null;
  sides: string | null;
  width: number | null;
  height: number | null;
  quantity: number | null;
  spot_uv: boolean;
  foil: boolean;
  perforation: boolean;
  die_cut: boolean;
  comment: string | null;
  sort_order: number;
  ticket_line_variants: Array<{ id: string; name: string; quantity: number }>;
}

function buildFinishing(line: LineItem): string | null {
  const parts: string[] = [];
  if (line.spot_uv) parts.push("Spot UV");
  if (line.foil) parts.push("Foil");
  if (line.lamination) parts.push(line.lamination);
  if (line.perforation) parts.push("Perforation");
  return parts.length > 0 ? parts.join(" + ") : null;
}

function buildFinishedSize(line: LineItem): string | null {
  if (line.width == null || line.height == null) return null;
  return `${line.width} x ${line.height} in`;
}

/** Map our priority values ("Low" | "Normal" | "High") to lowercase. */
function normalizePriority(priority: string | null | undefined): string {
  if (!priority) return "normal";
  return priority.toLowerCase();
}

type WebhookSku = { sku_name: string; quantity: number; artwork_url?: string };

/** Build the skus array for a single line item. */
async function buildLineSkus(
  line: LineItem,
  fileByVariant: Map<string, string>,
  fileByLine: Map<string, string>,
  admin: AdminClient,
): Promise<WebhookSku[]> {
  const variants = line.ticket_line_variants ?? [];
  const result: WebhookSku[] = [];

  if (variants.length > 0) {
    for (const v of variants) {
      const storagePath = fileByVariant.get(v.id) ?? fileByLine.get(line.id) ?? null;
      const artworkUrl = storagePath ? await signedArtworkUrl(admin, storagePath) : null;
      const sku: WebhookSku = { sku_name: v.name, quantity: Number(v.quantity) };
      if (artworkUrl) sku.artwork_url = artworkUrl;
      result.push(sku);
    }
  } else if (line.quantity != null) {
    const storagePath = fileByLine.get(line.id) ?? null;
    const artworkUrl = storagePath ? await signedArtworkUrl(admin, storagePath) : null;
    const sku: WebhookSku = {
      sku_name: line.description ?? line.product_type ?? "Item",
      quantity: Number(line.quantity),
    };
    if (artworkUrl) sku.artwork_url = artworkUrl;
    result.push(sku);
  }

  return result;
}

export async function sendOrderWebhook(
  admin: AdminClient,
  ticketId: string,
  referenceCode: string | null,
  via: string,
  convertedAt: string,
): Promise<void> {
  const url = process.env.ORDER_WEBHOOK_URL;
  if (!url) return;

  const secret = process.env.ORDER_WEBHOOK_SECRET;

  // Fetch full ticket + line items + variants.
  const { data: ticket } = await admin
    .from("job_tickets")
    .select(`
      id, title, reference_code, ticket_status, order_source,
      contact_name, contact_email, contact_phone, contact_company,
      customer_id, linked_lead_id,
      quote_subtotal, quote_shipping, quote_pre_tax_total,
      quote_tax_amount, quote_final_total,
      ticket_payment_strategy, rush, due_date, priority,
      notes, special_requirements,
      ticket_line_items (
        id, sort_order, product_type, description,
        material, lamination, color_mode, sides,
        width, height, quantity,
        spot_uv, foil, perforation, die_cut, comment,
        ticket_line_variants ( id, name, quantity )
      )
    `)
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    console.error("[order-webhook] ticket not found", { ticketId });
    return;
  }

  // Fetch artwork files for this ticket (one per variant or per line item).
  const { data: ticketFiles } = await admin
    .from("ticket_files")
    .select("id, line_item_id, variant_id, storage_path, file_name")
    .eq("ticket_id", ticketId);

  // Build a lookup: variant_id → storage_path  (and line_item_id → path for line-level files)
  const fileByVariant = new Map<string, string>();
  const fileByLine = new Map<string, string>();
  for (const f of ticketFiles ?? []) {
    if (f.variant_id) {
      fileByVariant.set(f.variant_id, f.storage_path);
    } else if (f.line_item_id) {
      if (!fileByLine.has(f.line_item_id)) {
        fileByLine.set(f.line_item_id, f.storage_path);
      }
    }
  }

  // Determine attempt number (count existing deliveries for this ticket + 1).
  const { count: priorCount } = await admin
    .from("webhook_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId);
  const attemptNumber = (priorCount ?? 0) + 1;

  const resolvedRef = referenceCode ?? ticket.reference_code ?? null;

  const lines: LineItem[] = (ticket.ticket_line_items ?? []).sort(
    (a: LineItem, b: LineItem) => a.sort_order - b.sort_order,
  );
  const firstLine = lines[0] ?? null;

  // Build the multi-item items array — one entry per line item with its own skus.
  type WebhookItem = {
    title: string;
    product: string;
    product_type: string | null;
    finished_size: string | null;
    materials: string | null;
    finishing: string | null;
    sides: string | null;
    color: string | null;
    order_qty: number | null;
    skus: WebhookSku[];
  };

  const items: WebhookItem[] = [];
  for (const line of lines) {
    const lineSkus = await buildLineSkus(line, fileByVariant, fileByLine, admin);
    items.push({
      title:         line.description ?? line.product_type,
      product:       line.product_type,
      product_type:  null,
      finished_size: buildFinishedSize(line),
      materials:     line.material ?? null,
      finishing:     buildFinishing(line),
      sides:         line.sides ?? null,
      color:         line.color_mode ?? null,
      order_qty:     line.quantity != null ? Number(line.quantity) : null,
      skus:          lineSkus,
    });
  }

  // Top-level artwork_url: first available file (for backward compat with single-item receivers).
  let topLevelArtworkUrl: string | null = null;
  if (firstLine) {
    const firstVariant = (firstLine.ticket_line_variants ?? [])[0];
    const firstPath = firstVariant
      ? (fileByVariant.get(firstVariant.id) ?? fileByLine.get(firstLine.id) ?? null)
      : (fileByLine.get(firstLine.id) ?? null);
    if (firstPath) topLevelArtworkUrl = await signedArtworkUrl(admin, firstPath);
  }

  // Flat top-level skus from all items combined (legacy compat).
  const allSkus: WebhookSku[] = items.flatMap((item) => item.skus);

  const payload: Record<string, unknown> = {
    // REQUIRED
    customer_name:    ticket.contact_company ?? ticket.contact_name ?? null,
    customer_contact: ticket.contact_email ?? ticket.contact_phone ?? null,

    // ORDER METADATA
    order_number: resolvedRef,
    title:        ticket.title ?? null,
    priority:     normalizePriority(ticket.priority),
    due_date:     ticket.due_date ?? null,

    // CUSTOMER INFO
    customer_phone: ticket.contact_phone ?? null,

    // NOTES
    description: ticket.notes ?? ticket.special_requirements ?? null,

    // ARTWORK — 7-day signed URL from first line item (for single-item receivers).
    ...(topLevelArtworkUrl ? { artwork_url: topLevelArtworkUrl } : {}),

    // MULTI-ITEM — full line item breakdown (primary format).
    items,

    // LEGACY FLAT FIELDS from the first line item (retained for backward compat).
    product:       firstLine?.product_type ?? null,
    product_type:  null,
    finished_size: firstLine ? buildFinishedSize(firstLine) : null,
    materials:     firstLine?.material ?? null,
    finishing:     firstLine ? buildFinishing(firstLine) : null,
    sides:         firstLine?.sides ?? null,
    color:         firstLine?.color_mode ?? null,
    order_qty:     firstLine?.quantity != null ? Number(firstLine.quantity) : null,

    // LEGACY flat skus (all variants combined).
    ...(allSkus.length > 0 ? { skus: allSkus } : {}),
  };

  // Fire and log the result — never blocks the caller.
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const body = await res.text().catch(() => "");
      await admin.from("webhook_deliveries").insert({
        ticket_id:      ticketId,
        reference_code: resolvedRef,
        attempt:        attemptNumber,
        status:         res.ok ? "success" : "failed",
        http_status:    res.status,
        response_body:  body.slice(0, 1000),
        via,
        sent_at:        new Date().toISOString(),
      });
      if (!res.ok) {
        console.error("[order-webhook] non-OK response:", res.status, body.slice(0, 200), {
          ticketId,
          referenceCode: resolvedRef,
        });
      }
    })
    .catch(async (err) => {
      await admin.from("webhook_deliveries").insert({
        ticket_id:     ticketId,
        reference_code: resolvedRef,
        attempt:       attemptNumber,
        status:        "failed",
        error_message: String(err).slice(0, 1000),
        via,
        sent_at:       new Date().toISOString(),
      });
      console.error("[order-webhook] network error:", err, {
        ticketId,
        referenceCode: resolvedRef,
      });
    });
}
