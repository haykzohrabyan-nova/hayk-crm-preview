import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteSku } from "@/lib/utils/ticket-math";
import { deleteTicketAttachment } from "@/lib/utils/ticket-line-files";

export interface LineItemVariantInput {
  id?: string;
  name: string;
  quantity: number;
  sort_order?: number;
}

export interface LineItemInput {
  id?: string;
  sort_order?: number;
  product_type: string;
  description?: string;
  material?: string;
  lamination?: string;
  color_mode?: string;
  sides?: string;
  roll_direction?: string;
  width?: number;
  height?: number;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  design_required?: boolean;
  die_cut?: boolean;
  spot_uv?: boolean;
  foil?: boolean;
  perforation?: boolean;
  comment?: string;
  variants?: LineItemVariantInput[];
}

export interface TicketFileMeta {
  id: string;
  file_name: string;
  mime_type: string;
  byte_size: number | null;
}

export interface TicketLineVariantRow {
  id: string;
  line_item_id: string;
  ticket_id: string;
  sort_order: number;
  name: string;
  quantity: number;
  file?: TicketFileMeta | null;
}

export interface TicketLineItemRow {
  id: string;
  ticket_id: string;
  sort_order: number;
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
  unit_price: number | null;
  line_total: number | null;
  design_required: boolean;
  die_cut: boolean;
  spot_uv: boolean;
  foil: boolean;
  perforation: boolean;
  comment: string | null;
  variants: TicketLineVariantRow[];
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolVal(v: unknown, fallback = false): boolean {
  return v === true || v === "true";
}

export function validateLineItemsPayload(
  lines: LineItemInput[],
): { ok: true } | { ok: false; error: string } {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const variants = line.variants ?? [];
    for (let j = 0; j < variants.length; j++) {
      const v = variants[j];
      if (!String(v.name ?? "").trim()) {
        return { ok: false, error: `Line ${i + 1}, additional SKU ${j + 1}: name is required.` };
      }
      const qty = Number(v.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return { ok: false, error: `Line ${i + 1}, additional SKU ${j + 1}: quantity must be greater than 0.` };
      }
    }
  }
  return { ok: true };
}

export function lineItemInputToRowPayload(
  ticketId: string,
  line: LineItemInput,
  sortOrder: number,
): Record<string, unknown> {
  const parts = [line.product_type, line.material, line.lamination !== "None" ? line.lamination : ""].filter(Boolean);
  const description = line.description ?? (parts.length ? parts.join(" – ") : null);

  return {
    id: line.id ?? randomUUID(),
    ticket_id: ticketId,
    sort_order: sortOrder,
    product_type: String(line.product_type ?? "").trim(),
    description,
    material: line.material ?? null,
    lamination: line.lamination ?? null,
    color_mode: line.color_mode ?? null,
    sides: line.sides ?? null,
    roll_direction: line.roll_direction ?? null,
    width: numOrNull(line.width),
    height: numOrNull(line.height),
    quantity: numOrNull(line.quantity),
    unit_price: numOrNull(line.unit_price),
    line_total: numOrNull(line.line_total),
    design_required: boolVal(line.design_required),
    die_cut: boolVal(line.die_cut),
    spot_uv: boolVal(line.spot_uv),
    foil: boolVal(line.foil),
    perforation: boolVal(line.perforation),
    comment: line.comment?.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

/** Line row for PDF/email/public — catalog fields + optional variant labels. */
export type TicketLineVariantDisplayRow = {
  name: string;
  quantity: number;
  file?: TicketFileMeta | null;
};

export type TicketLineDisplayRow = QuoteSku & {
  variants?: TicketLineVariantDisplayRow[];
};

export function lineItemsToDisplayRows(lines: TicketLineItemRow[]): TicketLineDisplayRow[] {
  return lines.map((row) => ({
    ...lineItemsToQuoteSkuRows([row])[0],
    variants: row.variants.map((v) => ({
      name: v.name,
      quantity: v.quantity,
      file: v.file ?? null,
    })),
  }));
}

export function lineItemsToQuoteSkuRows(lines: TicketLineItemRow[]): QuoteSku[] {
  return lines.map((row) => ({
    product_type: row.product_type,
    description: row.description ?? undefined,
    material: row.material ?? undefined,
    lamination: row.lamination ?? undefined,
    color_mode: row.color_mode ?? undefined,
    sides: row.sides ?? undefined,
    roll_direction: row.roll_direction ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    quantity: row.quantity ?? undefined,
    unit_price: row.unit_price ?? undefined,
    line_total: row.line_total ?? undefined,
    design_required: row.design_required,
    die_cut: row.die_cut,
    spot_uv: row.spot_uv,
    foil: row.foil,
    perforation: row.perforation,
    comment: row.comment ?? undefined,
  }));
}

export function lineItemInputsToQuoteSkuRows(lines: LineItemInput[]): QuoteSku[] {
  return lines.map((line) => {
    const parts = [line.product_type, line.material, line.lamination !== "None" ? line.lamination : ""].filter(Boolean);
    return {
      product_type: line.product_type,
      description: line.description ?? (parts.length ? parts.join(" – ") : undefined),
      material: line.material,
      lamination: line.lamination,
      color_mode: line.color_mode,
      sides: line.sides,
      roll_direction: line.roll_direction,
      width: line.width,
      height: line.height,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
      design_required: line.design_required,
      die_cut: line.die_cut,
      spot_uv: line.spot_uv,
      foil: line.foil,
      perforation: line.perforation,
      comment: line.comment,
    };
  });
}

/** Map API/form line_items payload to LineItemInput[]. */
export function parseLineItemsFromBody(raw: unknown): LineItemInput[] {
  if (!Array.isArray(raw)) return [];
  return raw as LineItemInput[];
}

/** Hydrate form state from API `line_items` bundle rows. */
export function bundleToLineItemInputs(lines: TicketLineItemRow[]): LineItemInput[] {
  return lines.map((row) => ({
    id: row.id,
    sort_order: row.sort_order,
    product_type: row.product_type,
    description: row.description ?? undefined,
    material: row.material ?? undefined,
    lamination: row.lamination ?? undefined,
    color_mode: row.color_mode ?? undefined,
    sides: row.sides ?? undefined,
    roll_direction: row.roll_direction ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    quantity: row.quantity ?? undefined,
    unit_price: row.unit_price ?? undefined,
    line_total: row.line_total ?? undefined,
    design_required: row.design_required,
    die_cut: row.die_cut,
    spot_uv: row.spot_uv,
    foil: row.foil,
    perforation: row.perforation,
    comment: row.comment ?? undefined,
    variants: row.variants.map((v) => ({
      id: v.id,
      name: v.name,
      quantity: v.quantity,
      sort_order: v.sort_order,
    })),
  }));
}

export async function countTicketLineItems(
  admin: SupabaseClient,
  ticketId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("ticket_line_items")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId);
  if (error) return 0;
  return count ?? 0;
}

export function ticketHasFilledLineItem(lines: LineItemInput[]): boolean {
  return lines.some(
    (l) =>
      l.product_type?.trim() &&
      (l.quantity ?? 0) > 0 &&
      (l.unit_price ?? 0) > 0,
  );
}

type DbLine = Record<string, unknown>;
type DbVariant = Record<string, unknown>;
type DbFile = Record<string, unknown>;

function mapFileMeta(row: DbFile | undefined): TicketFileMeta | null {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    file_name: String(row.file_name ?? ""),
    mime_type: String(row.mime_type ?? ""),
    byte_size: row.byte_size != null ? Number(row.byte_size) : null,
  };
}

function assembleBundle(
  lines: DbLine[],
  variants: DbVariant[],
  files: DbFile[],
): TicketLineItemRow[] {
  const filesByVariant = new Map<string, DbFile>();
  for (const f of files) {
    if (f.variant_id) filesByVariant.set(String(f.variant_id), f);
  }

  const variantsByLine = new Map<string, TicketLineVariantRow[]>();
  for (const v of variants) {
    const lineId = String(v.line_item_id);
    const fileRow = filesByVariant.get(String(v.id));
    const mapped: TicketLineVariantRow = {
      id: String(v.id),
      line_item_id: lineId,
      ticket_id: String(v.ticket_id),
      sort_order: Number(v.sort_order ?? 0),
      name: String(v.name ?? ""),
      quantity: Number(v.quantity ?? 0),
      file: mapFileMeta(fileRow),
    };
    const list = variantsByLine.get(lineId) ?? [];
    list.push(mapped);
    variantsByLine.set(lineId, list);
  }

  for (const [, list] of variantsByLine) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  return lines
    .map((row) => ({
      id: String(row.id),
      ticket_id: String(row.ticket_id),
      sort_order: Number(row.sort_order ?? 0),
      product_type: String(row.product_type ?? ""),
      description: row.description != null ? String(row.description) : null,
      material: row.material != null ? String(row.material) : null,
      lamination: row.lamination != null ? String(row.lamination) : null,
      color_mode: row.color_mode != null ? String(row.color_mode) : null,
      sides: row.sides != null ? String(row.sides) : null,
      roll_direction: row.roll_direction != null ? String(row.roll_direction) : null,
      width: numOrNull(row.width),
      height: numOrNull(row.height),
      quantity: numOrNull(row.quantity),
      unit_price: numOrNull(row.unit_price),
      line_total: numOrNull(row.line_total),
      design_required: boolVal(row.design_required),
      die_cut: boolVal(row.die_cut),
      spot_uv: boolVal(row.spot_uv),
      foil: boolVal(row.foil),
      perforation: boolVal(row.perforation),
      comment: row.comment != null ? String(row.comment) : null,
      variants: variantsByLine.get(String(row.id)) ?? [],
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function fetchTicketLinesBundle(
  admin: SupabaseClient,
  ticketId: string,
): Promise<TicketLineItemRow[]> {
  const [linesRes, variantsRes, filesRes] = await Promise.all([
    admin
      .from("ticket_line_items")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("sort_order", { ascending: true }),
    admin
      .from("ticket_line_variants")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("sort_order", { ascending: true }),
    admin.from("ticket_files").select("id, variant_id, file_name, mime_type, byte_size").eq("ticket_id", ticketId),
  ]);

  if (linesRes.error) {
    console.error("[fetchTicketLinesBundle] lines:", linesRes.error);
    return [];
  }

  return assembleBundle(
    (linesRes.data ?? []) as DbLine[],
    (variantsRes.data ?? []) as DbVariant[],
    (filesRes.data ?? []) as DbFile[],
  );
}

async function deleteOrphanVariantFiles(
  admin: SupabaseClient,
  variantIds: string[],
): Promise<void> {
  if (!variantIds.length) return;

  const { data: fileRows } = await admin
    .from("ticket_files")
    .select("id, storage_path")
    .in("variant_id", variantIds);

  for (const f of fileRows ?? []) {
    if (f.storage_path) {
      await deleteTicketAttachment(admin, String(f.storage_path));
    }
  }
}

/**
 * Upsert lines/variants by stable id; delete orphans (and Storage for removed variants).
 */
export async function syncTicketLines(
  admin: SupabaseClient,
  ticketId: string,
  lines: LineItemInput[],
): Promise<{ ok: true; line_items: TicketLineItemRow[] } | { ok: false; error: string }> {
  const validation = validateLineItemsPayload(lines);
  if (!validation.ok) return validation;

  const now = new Date().toISOString();

  const { data: existingLines } = await admin
    .from("ticket_line_items")
    .select("id")
    .eq("ticket_id", ticketId);
  const { data: existingVariants } = await admin
    .from("ticket_line_variants")
    .select("id")
    .eq("ticket_id", ticketId);

  const payloadLineIds = new Set<string>();
  const payloadVariantIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineId = line.id ?? randomUUID();
    payloadLineIds.add(lineId);

    const linePayload = lineItemInputToRowPayload(ticketId, { ...line, id: lineId }, i);

    const { error: lineErr } = await admin.from("ticket_line_items").upsert(linePayload, { onConflict: "id" });
    if (lineErr) {
      return { ok: false, error: lineErr.message };
    }

    const variants = line.variants ?? [];
    for (let j = 0; j < variants.length; j++) {
      const v = variants[j];
      const variantId = v.id ?? randomUUID();
      payloadVariantIds.add(variantId);

      const { error: varErr } = await admin.from("ticket_line_variants").upsert(
        {
          id: variantId,
          line_item_id: lineId,
          ticket_id: ticketId,
          sort_order: v.sort_order ?? j,
          name: String(v.name).trim(),
          quantity: Number(v.quantity),
          updated_at: now,
        },
        { onConflict: "id" },
      );
      if (varErr) {
        return { ok: false, error: varErr.message };
      }
    }
  }

  const orphanLineIds = (existingLines ?? [])
    .map((r) => String(r.id))
    .filter((id) => !payloadLineIds.has(id));

  const orphanVariantIds = (existingVariants ?? [])
    .map((r) => String(r.id))
    .filter((id) => !payloadVariantIds.has(id));

  if (orphanVariantIds.length) {
    await deleteOrphanVariantFiles(admin, orphanVariantIds);
    await admin.from("ticket_line_variants").delete().in("id", orphanVariantIds);
  }

  if (orphanLineIds.length) {
    await admin.from("ticket_line_items").delete().in("id", orphanLineIds);
  }

  const line_items = await fetchTicketLinesBundle(admin, ticketId);
  return { ok: true, line_items };
}

/** Derive ticket-level design_required / die_cut flags from line rows. */
export function aggregateLineFlags(lines: LineItemInput[]): {
  design_required: boolean;
  die_cut: boolean;
} {
  return {
    design_required: lines.some((l) => boolVal(l.design_required)),
    die_cut: lines.some((l) => boolVal(l.die_cut)),
  };
}
