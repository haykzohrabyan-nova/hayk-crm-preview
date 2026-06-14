import { randomUUID } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { digitsOnly as _digitsOnly } from "@/lib/utils/phone";
import { nextOrderNumber, formatOrderReference } from "@/lib/utils/reference-codes";
import { normalizeWebsite } from "@/lib/utils/website";

/** Strip non-digits and remove leading US country code (1) from 11-digit numbers. */
function digitsOnly(value: string): string {
  const d = _digitsOnly(value);
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

type AdminClient = ReturnType<typeof createAdminClient>;

export const BULK_ORDER_IMPORT_MAX_ROWS = 200;

const VALID_TICKET_STATUSES = new Set(["order", "in_production", "completed", "cancelled"]);
const VALID_PAYMENT_STATUSES = new Set(["unpaid", "partial", "paid"]);

// Human-friendly payment method labels accepted on import
const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: "Cash",
  check: "Check",
  card: "Card",
  zelle: "Zelle",
  wire: "Transfer",
  transfer: "Transfer",
  offline: "Offline",
  other: "Other",
};

export interface BulkOrderLineItemInput {
  product_type?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
}

export interface BulkOrderImportRowInput {
  // Customer identification
  customer_phone?: unknown;
  customer_first_name?: unknown;
  customer_last_name?: unknown;
  customer_company?: unknown;
  // Order fields
  title?: unknown;
  ticket_status?: unknown;
  payment_status?: unknown;
  payment_method?: unknown;
  total?: unknown;
  subtotal?: unknown;
  discount_amount?: unknown;
  tax_amount?: unknown;
  order_date?: unknown;
  due_date?: unknown;
  notes?: unknown;
  reference_code?: unknown;
  // Line items
  line_items?: unknown;
  // Import metadata
  external_id?: unknown;
}

export interface BulkOrderImportOptions {
  createMissingCustomers: boolean;
  importedByNote: string | null;
}

export interface BulkOrderImportRowPreview {
  // Customer info
  customer_phone: string;
  customer_name: string | null;
  customer_id: string | null;          // null = will be created
  customer_action: "found" | "create" | "none";
  // Order info
  title: string | null;
  ticket_status: string;
  payment_status: string;
  payment_method: string | null;
  total: number | null;
  line_item_count: number;
  order_date: string | null;
  external_id: string | null;
}

export type BulkOrderImportRowStatus = "valid" | "error" | "skipped";

export interface BulkOrderImportRowResult {
  row_index: number;
  status: BulkOrderImportRowStatus;
  errors: string[];
  warnings: string[];
  preview: BulkOrderImportRowPreview | null;
  ticket_id?: string;
}

export interface BulkOrderImportSummary {
  total_rows: number;
  valid_count: number;
  error_count: number;
  skipped_count: number;
  created_count: number;
  rows: BulkOrderImportRowResult[];
  batch_id?: string;
}

export interface ParsedBulkOrderImportFile {
  options: BulkOrderImportOptions;
  rows: BulkOrderImportRowInput[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trimStr(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function parseDate(value: unknown): string | null {
  const s = trimStr(value);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─── Parse ────────────────────────────────────────────────────────────────────

export function parseBulkOrderImportFile(
  raw: unknown,
): { ok: true; file: ParsedBulkOrderImportFile } | { ok: false; error: string } {
  const root = asRecord(raw);
  if (!root) return { ok: false, error: "JSON must be an object with an orders array." };
  if (!Array.isArray(root.orders)) return { ok: false, error: 'Missing "orders" array.' };
  if (root.orders.length === 0) return { ok: false, error: "orders array is empty — add at least one order." };
  if (root.orders.length > BULK_ORDER_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `Too many rows (${root.orders.length}). Maximum is ${BULK_ORDER_IMPORT_MAX_ROWS} per file.`,
    };
  }
  if (root.version != null && typeof root.version !== "number") {
    return { ok: false, error: '"version" must be a number when provided.' };
  }

  return {
    ok: true,
    file: {
      options: {
        createMissingCustomers: root.create_missing_customers === true,
        importedByNote: trimStr(root.imported_by_note) || null,
      },
      rows: root.orders as BulkOrderImportRowInput[],
    },
  };
}

// ─── Template ─────────────────────────────────────────────────────────────────

export function buildOrderImportTemplate(): Record<string, unknown> {
  return {
    version: 1,
    _documentation: {
      purpose: "Bulk import historical orders into BazaarPrinting CRM.",
      audience: "AI assistants or scripts converting data from spreadsheets or other systems.",
      output_format:
        "Single JSON object with an orders array. Keys starting with _ are documentation only — ignored on import.",
      instructions: [
        "Return valid JSON only — no markdown fences, no commentary outside the JSON.",
        "Put one object per order in the orders array (max 200).",
        "Every order MUST include: customer_phone, ticket_status, and at least one line_item.",
        "customer_phone must have at least 10 digits — used to match an existing customer.",
        "If the customer is not found: set create_missing_customers to true and include customer_first_name.",
        "ticket_status: order | in_production | completed | cancelled",
        "payment_status: unpaid | partial | paid (default: unpaid)",
        "payment_method: cash | check | card | zelle | wire | offline (optional)",
        "total: numeric (optional — can be derived from line items if unit_price is set)",
        "order_date: ISO date string, e.g. 2025-11-15 (optional — defaults to today)",
        "line_items: array — each item needs product_type and quantity.",
        "Replace the example order with all real rows.",
      ],
      order_fields: {
        required: {
          customer_phone: "string — min 10 digits, used to match existing customer",
          ticket_status: "string — order | in_production | completed | cancelled",
          line_items: "array — min 1 item (see line_item_fields)",
        },
        optional: {
          customer_first_name: "string — required if customer not found and create_missing_customers is true",
          customer_last_name: "string",
          customer_company: "string",
          title: "string — order title / description",
          reference_code: "string — your internal order ID (must be unique if provided)",
          payment_status: "string — unpaid | partial | paid (default: unpaid)",
          payment_method: "string — cash | check | card | zelle | wire | offline",
          total: "number — full order total",
          subtotal: "number — subtotal before discount",
          discount_amount: "number — discount applied",
          tax_amount: "number — sales tax in dollars (e.g. 14.25). Sets quote_tax_amount and quote_pre_tax_total in DB.",
          order_date: "string — ISO date, e.g. 2025-11-15 (when the order was placed)",
          due_date: "string — ISO date (optional deadline)",
          notes: "string — internal notes / special requirements",
          external_id: "string — id from your source system (stored in activity log)",
        },
      },
      line_item_fields: {
        required: {
          product_type: "string — e.g. Labels, Boxes, Stickers, Flyers, Banners, Business Cards, Other",
          quantity: "number — units ordered",
        },
        optional: {
          description: "string — e.g. 4x6 vinyl labels, full color",
          unit_price: "number — price per unit",
        },
      },
    },
    imported_by_note: "REPLACE — short note about this batch (e.g. Migrated from old system May 2026)",
    create_missing_customers: false,
    orders: [
      {
        _note: "DELETE this key — example row only. Duplicate this object shape for each real order.",
        customer_phone: "4155551234",
        customer_first_name: "Jane",
        customer_last_name: "Rivera",
        customer_company: "Acme Print Co",
        title: "Labels — Acme Print Co",
        ticket_status: "completed",
        payment_status: "paid",
        payment_method: "zelle",
        total: 850.0,
        order_date: "2025-11-15",
        notes: "Rush order — delivered same day",
        external_id: "your-system-order-id-001",
        line_items: [
          {
            product_type: "Labels",
            description: "4x6 vinyl labels, full color",
            quantity: 10000,
            unit_price: 0.085,
          },
        ],
      },
    ],
  };
}

// ─── Validate a single row ────────────────────────────────────────────────────

export async function validateBulkOrderRow(
  row: BulkOrderImportRowInput,
  rowIndex: number,
  options: BulkOrderImportOptions,
  admin: AdminClient,
): Promise<BulkOrderImportRowResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { row_index: rowIndex, status: "error", errors: ["Row must be a JSON object."], warnings: [], preview: null };
  }

  // ── Customer ──
  const phoneRaw = trimStr(row.customer_phone);
  const phoneDigits = digitsOnly(phoneRaw);
  if (!phoneRaw) errors.push("customer_phone is required.");
  else if (!phoneDigits || phoneDigits.length < 10) errors.push("customer_phone must contain at least 10 digits.");

  let customerId: string | null = null;
  let customerName: string | null = null;
  let customerAction: "found" | "create" | "none" = "none";

  if (phoneDigits && phoneDigits.length >= 10) {
    const { data: existingCustomer } = await admin
      .from("customers")
      .select("id, first_name, last_name, company")
      .eq("phone", phoneDigits)
      .limit(1)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      customerName = [existingCustomer.first_name, existingCustomer.last_name].filter(Boolean).join(" ") ||
        existingCustomer.company ||
        null;
      customerAction = "found";
    } else {
      const firstName = trimStr(row.customer_first_name);
      if (options.createMissingCustomers) {
        if (!firstName) {
          errors.push("Customer not found for this phone. Provide customer_first_name to create a new customer.");
        } else {
          customerName = [firstName, trimStr(row.customer_last_name)].filter(Boolean).join(" ");
          customerAction = "create";
          warnings.push(`No existing customer for ${phoneDigits} — will create "${customerName}" on import.`);
        }
      } else {
        errors.push(
          `No customer found with phone ${phoneDigits}. Enable create_missing_customers or import the customer first.`,
        );
      }
    }
  }

  // ── Ticket status ──
  const ticketStatus = trimStr(row.ticket_status).toLowerCase();
  if (!ticketStatus) errors.push("ticket_status is required (order | in_production | completed | cancelled).");
  else if (!VALID_TICKET_STATUSES.has(ticketStatus))
    errors.push(`ticket_status "${ticketStatus}" is invalid — use: order, in_production, completed, cancelled.`);

  // ── Payment status ──
  const paymentStatusRaw = trimStr(row.payment_status).toLowerCase() || "unpaid";
  if (!VALID_PAYMENT_STATUSES.has(paymentStatusRaw))
    errors.push(`payment_status "${paymentStatusRaw}" is invalid — use: unpaid, partial, paid.`);

  // ── Payment method ──
  const paymentMethodRaw = trimStr(row.payment_method).toLowerCase();
  let paymentMethod: string | null = null;
  if (paymentMethodRaw) {
    paymentMethod = PAYMENT_METHOD_MAP[paymentMethodRaw] ?? null;
    if (!paymentMethod) {
      warnings.push(`payment_method "${paymentMethodRaw}" not recognised — use: cash, check, card, zelle, wire, offline.`);
    }
  }

  // ── Total ──
  const total = parseNumber(row.total);

  // ── Dates ──
  const orderDate = parseDate(row.order_date);
  if (row.order_date && !orderDate) warnings.push(`order_date "${String(row.order_date)}" is not a valid date — ignored.`);

  const dueDateRaw = parseDate(row.due_date);
  if (row.due_date && !dueDateRaw) warnings.push(`due_date "${String(row.due_date)}" is not a valid date — ignored.`);

  // ── Reference code uniqueness (light check — DB unique index will catch dupes on commit) ──
  const referenceCode = trimStr(row.reference_code) || null;

  // ── Line items ──
  const lineItemsRaw = row.line_items;
  if (!Array.isArray(lineItemsRaw) || lineItemsRaw.length === 0) {
    errors.push("line_items is required — add at least one item.");
  } else {
    let itemIndex = 0;
    for (const item of lineItemsRaw) {
      itemIndex++;
      const itemRec = asRecord(item);
      if (!itemRec) {
        errors.push(`line_items[${itemIndex}]: must be an object.`);
        continue;
      }
      const productType = trimStr(itemRec.product_type);
      if (!productType) errors.push(`line_items[${itemIndex}]: product_type is required.`);
      const qty = parseNumber(itemRec.quantity);
      if (qty == null || qty <= 0) errors.push(`line_items[${itemIndex}]: quantity must be a positive number.`);
    }
  }

  const lineItemCount = Array.isArray(lineItemsRaw) ? lineItemsRaw.length : 0;
  const title = trimStr(row.title) || null;
  const external_id = trimStr(row.external_id) || null;

  const preview: BulkOrderImportRowPreview | null =
    errors.length === 0 || (errors.length === 0 && phoneDigits)
      ? {
          customer_phone: phoneDigits ?? phoneRaw,
          customer_name: customerName,
          customer_id: customerId,
          customer_action: customerAction,
          title,
          ticket_status: ticketStatus,
          payment_status: paymentStatusRaw,
          payment_method: paymentMethod,
          total,
          line_item_count: lineItemCount,
          order_date: orderDate,
          external_id,
        }
      : phoneDigits
        ? {
            customer_phone: phoneDigits,
            customer_name: customerName,
            customer_id: customerId,
            customer_action: customerAction,
            title,
            ticket_status: ticketStatus || "order",
            payment_status: paymentStatusRaw,
            payment_method: paymentMethod,
            total,
            line_item_count: lineItemCount,
            order_date: orderDate,
            external_id,
          }
        : null;

  return {
    row_index: rowIndex,
    status: errors.length > 0 ? "error" : "valid",
    errors,
    warnings,
    preview,
  };
}

// ─── Validate all rows ────────────────────────────────────────────────────────

export async function validateBulkOrderImport(
  admin: AdminClient,
  parsed: ParsedBulkOrderImportFile,
): Promise<BulkOrderImportSummary> {
  const rows: BulkOrderImportRowResult[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const result = await validateBulkOrderRow(parsed.rows[i], i + 1, parsed.options, admin);
    rows.push(result);
  }

  return summarizeOrderImportRows(rows);
}

function summarizeOrderImportRows(rows: BulkOrderImportRowResult[]): BulkOrderImportSummary {
  return {
    total_rows: rows.length,
    valid_count: rows.filter((r) => r.status === "valid").length,
    error_count: rows.filter((r) => r.status === "error").length,
    skipped_count: rows.filter((r) => r.status === "skipped").length,
    created_count: 0,
    rows,
  };
}

// ─── Commit ───────────────────────────────────────────────────────────────────

export async function commitBulkOrderImport(
  admin: AdminClient,
  parsed: ParsedBulkOrderImportFile,
  staffUserId: string,
): Promise<BulkOrderImportSummary> {
  const validation = await validateBulkOrderImport(admin, parsed);
  const batchId = randomUUID();
  let created_count = 0;

  for (const rowResult of validation.rows) {
    if (rowResult.status !== "valid" || !rowResult.preview) continue;

    const input = parsed.rows[rowResult.row_index - 1];
    const preview = rowResult.preview;

    // ── Resolve or create customer ──
    let customerId = preview.customer_id;
    if (!customerId && preview.customer_action === "create") {
      const firstName = trimStr(input.customer_first_name);
      const { data: newCustomer, error: cErr } = await admin
        .from("customers")
        .insert({
          first_name: firstName,
          last_name: trimStr(input.customer_last_name) || null,
          phone: preview.customer_phone,
          company: trimStr(input.customer_company) || null,
          website: trimStr(input.customer_company)
            ? trimStr((input as Record<string, unknown>).customer_website as unknown)
              ? normalizeWebsite(String((input as Record<string, unknown>).customer_website))
              : null
            : null,
        })
        .select("id")
        .single();

      if (cErr || !newCustomer) {
        rowResult.status = "error";
        rowResult.errors.push(cErr?.message ?? "Failed to create customer.");
        continue;
      }
      customerId = newCustomer.id;
    }

    if (!customerId) {
      rowResult.status = "error";
      rowResult.errors.push("Could not resolve customer.");
      continue;
    }

    // ── Build ticket status timestamps ──
    const orderDate = preview.order_date ?? new Date().toISOString();
    const extraTimestamps: Record<string, string | null> = {};
    // Note: no completed_at column in schema — completed status is set via ticket_status only
    if (preview.ticket_status === "in_production" || preview.ticket_status === "completed") {
      extraTimestamps.production_released_at = orderDate;
    }
    if (preview.ticket_status === "cancelled") extraTimestamps.cancelled_at = orderDate;

    // ── Payment timestamps ──
    const paymentExtra: Record<string, unknown> = {};
    if (preview.payment_status === "paid") {
      paymentExtra.payment_paid_at = orderDate;
      if (preview.payment_method) paymentExtra.payment_method_used = preview.payment_method;
      if (preview.total != null) paymentExtra.payment_amount_received = preview.total;
    }

    // ── Resolve reference code (auto-assign ORD-YYYY-NNN if not provided) ──
    // Use the year from order_date so a 2025 import gets ORD-2025-NNN, not ORD-2026-NNN.
    let resolvedReferenceCode = trimStr(input.reference_code) || null;
    if (!resolvedReferenceCode) {
      try {
        const refYear = new Date(orderDate).getFullYear();
        const seq = await nextOrderNumber(admin, refYear);
        resolvedReferenceCode = formatOrderReference(refYear, seq);
      } catch {
        // Proceed without reference code if sequence increment fails
      }
    }

    // ── Compute tax / pre-tax fields when tax_amount is provided ──
    const taxAmount = parseNumber(input.tax_amount);
    const subtotalVal = parseNumber(input.subtotal);
    const discountVal = parseNumber(input.discount_amount);
    // quote_pre_tax_total = total before tax (subtotal minus any discount)
    const preTaxTotal =
      taxAmount != null && preview.total != null
        ? Math.round((preview.total - taxAmount) * 100) / 100
        : subtotalVal != null && discountVal != null
          ? Math.round((subtotalVal - discountVal) * 100) / 100
          : subtotalVal ?? null;

    // ── Insert ticket ──
    const { data: ticket, error: tErr } = await admin
      .from("job_tickets")
      .insert({
        ticket_kind: "order",
        ticket_status: preview.ticket_status,
        customer_id: customerId,
        created_by_id: staffUserId,
        contact_phone: preview.customer_phone,
        contact_name: preview.customer_name,
        title: preview.title,
        reference_code: resolvedReferenceCode,
        order_source: "direct",
        payment_status: preview.payment_status as "unpaid" | "partial" | "paid",
        payment_type: preview.payment_method,
        total: preview.total,
        subtotal: subtotalVal,
        discount_amount: discountVal,
        // Rich pricing columns — populated when tax info is available
        quote_pre_tax_total: preTaxTotal,
        quote_tax_amount: taxAmount,
        quote_final_total: preview.total,
        special_requirements: trimStr(input.notes) || null,
        due_date: parseDate(input.due_date) ? parseDate(input.due_date)!.slice(0, 10) : null,
        created_at: orderDate,
        updated_at: orderDate,
        ...extraTimestamps,
        ...paymentExtra,
      })
      .select("id")
      .single();

    if (tErr || !ticket) {
      rowResult.status = "error";
      rowResult.errors.push(tErr?.message ?? "Failed to create order ticket.");
      continue;
    }

    // ── Insert line items ──
    const lineItems = Array.isArray(input.line_items) ? input.line_items : [];
    let sortOrder = 0;
    let lineItemError = false;

    for (const item of lineItems) {
      const itemRec = asRecord(item);
      if (!itemRec) continue;

      const productType = trimStr(itemRec.product_type);
      const quantity = parseNumber(itemRec.quantity) ?? 1;
      const unitPrice = parseNumber(itemRec.unit_price);
      const lineTotal = unitPrice != null ? quantity * unitPrice : null;

      const { error: liErr } = await admin.from("ticket_line_items").insert({
        ticket_id: ticket.id,
        sort_order: sortOrder++,
        product_type: productType,
        description: trimStr(itemRec.description) || null,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        created_at: orderDate,
        updated_at: orderDate,
      });

      if (liErr) {
        rowResult.warnings.push(`Line item "${productType}" failed to save: ${liErr.message}`);
        lineItemError = true;
      }
    }

    if (lineItemError && lineItems.length > 0) {
      rowResult.warnings.push("Some line items may not have saved — verify this order after import.");
    }

    rowResult.ticket_id = ticket.id;
    created_count += 1;

    // ── Activity log ──
    await admin.from("activities").insert({
      customer_id: customerId,
      ticket_id: ticket.id,
      type: "order_ticket_created",
      by_user_id: staffUserId,
      payload: {
        via: "bulk_import",
        batch_id: batchId,
        external_id: preview.external_id,
        imported_by_note: parsed.options.importedByNote,
        ticket_status: preview.ticket_status,
      },
      created_at: orderDate,
    });
  }

  if (created_count > 0) {
    await admin.from("activities").insert({
      type: "orders_bulk_imported",
      by_user_id: staffUserId,
      payload: {
        batch_id: batchId,
        created_count,
        total_rows: validation.total_rows,
        error_count: validation.rows.filter((r) => r.status === "error").length,
        imported_by_note: parsed.options.importedByNote,
      },
      created_at: new Date().toISOString(),
    });
  }

  const summary = summarizeOrderImportRows(validation.rows);
  summary.created_count = created_count;
  summary.batch_id = batchId;
  return summary;
}
