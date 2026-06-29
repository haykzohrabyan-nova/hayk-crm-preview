/**
 * Fires a POST to ORDER_WEBHOOK_URL whenever a ticket becomes an order.
 * Covers all creation paths: quote→order conversion (payment, admin, Stripe,
 * customer confirm) and direct order creation via POST /api/tickets.
 *
 * Every attempt (success or failure) is logged to the `webhook_deliveries` table.
 *
 * Payload contract (workflow target API — exact field set):
 * {
 *   customer_name, customer_contact, order_number, priority, due_date,
 *   owner, designer, design_task, description,
 *   items: [{ title, product, materials, finished_size, die, sides,
 *     roll_direction, color_mode, lamination, spot_uv, foil, need_a_design,
 *     die_cut, application, perforation,
 *     skus: [{ sku_name, quantity, artwork_url }] }]
 * }
 *
 * All string fields send "" when empty (never null). Booleans always explicit.
 * Owner = sales rep on linked lead, else quote creator. Designer = first assigned
 * line designer. design_task = line comments joined.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSalesRepId } from "@/lib/utils/reports-attribution";
import { TICKET_ATTACHMENTS_BUCKET } from "@/lib/utils/ticket-line-files";

type AdminClient = SupabaseClient;

/** 7 days — external system should download artwork immediately on receipt. */
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
  roll_direction: string | null;
  width: number | null;
  height: number | null;
  quantity: number | null;
  spot_uv: boolean;
  foil: boolean;
  perforation: boolean;
  die_cut: boolean;
  design_required: boolean;
  comment: string | null;
  designer: string | null;
  sort_order: number;
  ticket_line_variants: Array<{ id: string; name: string; quantity: number }>;
}

type WebhookSku = { sku_name: string; quantity: number; artwork_url: string };

type WebhookItem = {
  title: string;
  product: string;
  materials: string;
  finished_size: string;
  die: string;
  sides: string;
  roll_direction: string;
  color_mode: string;
  lamination: string;
  spot_uv: boolean;
  foil: boolean;
  need_a_design: boolean;
  die_cut: boolean;
  application: boolean;
  perforation: boolean;
  skus: WebhookSku[];
};

type WebhookPayload = {
  customer_name: string;
  customer_contact: string;
  order_number: string;
  priority: string;
  due_date: string;
  owner: string;
  designer: string;
  design_task: string;
  description: string;
  items: WebhookItem[];
};

function webhookString(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}

function mapColorMode(value: string | null): string {
  if (!value) return "";
  const map: Record<string, string> = {
    cmyk:             "CMYK",
    pantone:          "Pantones",
    full_color_white: "CMYK+White",
    black_only:       "Black Only",
  };
  return map[value.toLowerCase()] ?? value;
}

function mapSides(value: string | null): string {
  if (!value) return "";
  const map: Record<string, string> = {
    single_sided:   "Single-sided",
    double_sided:   "Double-sided",
    "1 side":       "Single-sided",
    "2 sides":      "Double-sided",
    "single-sided": "Single-sided",
    "double-sided": "Double-sided",
  };
  return map[value.toLowerCase()] ?? value;
}

function mapRollDirection(value: string | null): string {
  if (!value) return "";
  const map: Record<string, string> = {
    top_off_first:    "1-Top",
    bottom_off_first: "2-Bottom",
    right_off_first:  "3-Right",
    left_off_first:   "4-Left",
    "1-top":    "1-Top",
    "2-bottom": "2-Bottom",
    "3-right":  "3-Right",
    "4-left":   "4-Left",
  };
  return map[value.toLowerCase()] ?? value;
}

function assignedDesignerName(designer: string | null | undefined): string | null {
  if (!designer || designer === "Unassigned") return null;
  return designer;
}

function buildFinishedSize(line: LineItem): string {
  if (line.width == null || line.height == null) return "";
  return `${line.width} x ${line.height} in`;
}

function buildDueDateForWebhook(dueDate: string | null | undefined): string {
  if (!dueDate) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  return d < today ? "" : dueDate;
}

function normalizePriority(priority: string | null | undefined): string {
  if (!priority) return "normal";
  return priority.toLowerCase();
}

const EMPTY_SKU: WebhookSku = { sku_name: "", quantity: 0, artwork_url: "" };

/** Build the skus array for a single line item — always at least one entry. */
async function buildLineSkus(
  line: LineItem,
  fileByVariant: Map<string, string>,
  fileByLine: Map<string, string>,
  admin: AdminClient,
): Promise<WebhookSku[]> {
  const variants = line.ticket_line_variants ?? [];
  const result: WebhookSku[] = [];

  async function skuRow(name: string, quantity: number, storagePath: string | null): Promise<WebhookSku> {
    const artworkUrl = storagePath ? await signedArtworkUrl(admin, storagePath) : null;
    return {
      sku_name: webhookString(name),
      quantity: Number.isFinite(quantity) ? quantity : 0,
      artwork_url: artworkUrl ?? "",
    };
  }

  if (variants.length > 0) {
    for (const v of variants) {
      const storagePath = fileByVariant.get(v.id) ?? fileByLine.get(line.id) ?? null;
      result.push(await skuRow(v.name, Number(v.quantity), storagePath));
    }
  } else if (line.quantity != null) {
    const storagePath = fileByLine.get(line.id) ?? null;
    result.push(
      await skuRow(
        line.description ?? line.product_type ?? "",
        Number(line.quantity),
        storagePath,
      ),
    );
  }

  return result.length > 0 ? result : [{ ...EMPTY_SKU }];
}

async function resolveOrderOwnerName(
  admin: AdminClient,
  ticket: { linked_lead_id: string | null; created_by_id: string | null },
): Promise<string> {
  let lead: { id: string; sales_owner_id: string | null; sdr_id: string | null } | null = null;

  if (ticket.linked_lead_id) {
    const { data } = await admin
      .from("leads")
      .select("id, sales_owner_id, sdr_id")
      .eq("id", ticket.linked_lead_id)
      .maybeSingle();
    lead = data;
  }

  const salesRepId = resolveSalesRepId(
    {
      id: "",
      linked_lead_id: ticket.linked_lead_id,
      created_by_id: ticket.created_by_id,
      routed_by_id: null,
    },
    lead,
  );

  if (!salesRepId) return "";

  const { data: profile } = await admin
    .from("user_profiles")
    .select("full_name")
    .eq("id", salesRepId)
    .maybeSingle();

  return webhookString(profile?.full_name);
}

export async function buildOrderWebhookPayload(
  admin: AdminClient,
  ticketId: string,
  referenceCode: string | null,
): Promise<WebhookPayload | null> {
  const { data: ticket } = await admin
    .from("job_tickets")
    .select(`
      id, reference_code,
      contact_name, contact_email, contact_phone, contact_company,
      linked_lead_id, created_by_id,
      due_date, priority, notes,
      ticket_line_items (
        id, sort_order, product_type, description,
        material, lamination, color_mode, sides, roll_direction,
        width, height, quantity,
        spot_uv, foil, perforation, die_cut, design_required, comment, designer,
        ticket_line_variants ( id, name, quantity )
      )
    `)
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    console.error("[order-webhook] ticket not found", { ticketId });
    return null;
  }

  const { data: ticketFiles } = await admin
    .from("ticket_files")
    .select("line_item_id, variant_id, storage_path")
    .eq("ticket_id", ticketId);

  const fileByVariant = new Map<string, string>();
  const fileByLine = new Map<string, string>();
  for (const f of ticketFiles ?? []) {
    if (f.variant_id) {
      fileByVariant.set(f.variant_id, f.storage_path);
    } else if (f.line_item_id && !fileByLine.has(f.line_item_id)) {
      fileByLine.set(f.line_item_id, f.storage_path);
    }
  }

  const lines: LineItem[] = (ticket.ticket_line_items ?? []).sort(
    (a: LineItem, b: LineItem) => a.sort_order - b.sort_order,
  );

  const items: WebhookItem[] = [];
  for (const line of lines) {
    const lineSkus = await buildLineSkus(line, fileByVariant, fileByLine, admin);
    items.push({
      title:          webhookString(line.description ?? line.product_type),
      product:        webhookString(line.product_type),
      materials:      webhookString(line.material),
      finished_size:  buildFinishedSize(line),
      die:            "",
      sides:          mapSides(line.sides),
      roll_direction: mapRollDirection(line.roll_direction),
      color_mode:     mapColorMode(line.color_mode),
      lamination:     webhookString(line.lamination),
      spot_uv:        line.spot_uv,
      foil:           line.foil,
      need_a_design:  line.design_required,
      die_cut:        line.die_cut,
      application:    false,
      perforation:    line.perforation,
      skus:           lineSkus,
    });
  }

  const topLevelDesigner =
    lines.map((line) => assignedDesignerName(line.designer)).find(Boolean) ?? "";

  const designTask =
    lines
      .map((line) => line.comment?.trim())
      .filter(Boolean)
      .join(" | ") || "";

  const owner = await resolveOrderOwnerName(admin, {
    linked_lead_id: ticket.linked_lead_id ?? null,
    created_by_id: ticket.created_by_id ?? null,
  });

  return {
    customer_name:    webhookString(ticket.contact_company ?? ticket.contact_name),
    customer_contact: webhookString(ticket.contact_email ?? ticket.contact_phone),
    order_number:     webhookString(referenceCode ?? ticket.reference_code),
    priority:         normalizePriority(ticket.priority),
    due_date:         buildDueDateForWebhook(ticket.due_date),
    owner,
    designer:         webhookString(topLevelDesigner),
    design_task:      designTask,
    description:      webhookString(ticket.notes),
    items,
  };
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

  const payload = await buildOrderWebhookPayload(admin, ticketId, referenceCode);
  if (!payload) return;

  const resolvedRef = payload.order_number || referenceCode;

  const { count: priorCount } = await admin
    .from("webhook_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId);
  const attemptNumber = (priorCount ?? 0) + 1;

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
