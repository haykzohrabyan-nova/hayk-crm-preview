import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteSku } from "@/lib/utils/ticket-math";
import { formatCurrency, skuLineTotal } from "@/lib/utils/ticket-math";
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
  /** Set when file is attached at line level (`variant_id` null in DB). */
  file?: TicketFileMeta | null;
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
  /** Line-level attachment (`variant_id` null) — may coexist with additional SKUs after first SKU is removed. */
  lineFile?: TicketFileMeta | null;
};

export function lineItemsToDisplayRows(lines: TicketLineItemRow[]): TicketLineDisplayRow[] {
  return lines.map((row) => ({
    ...lineItemsToQuoteSkuRows([row])[0],
    lineFile: row.file ?? null,
    variants: row.variants.map((v) => ({
      name: v.name,
      quantity: v.quantity,
      file: v.file ?? null,
    })),
  }));
}

/** Props for DetailLineItemCard from a display row (list quick preview, read-only forms). */
export function lineDisplayRowToCardProps(row: TicketLineDisplayRow): {
  name: string;
  specs: string[];
  price: number;
  variantLabels: { name: string; quantity: number }[];
} {
  const name = [
    row.product_type,
    row.material,
    row.lamination && row.lamination !== "None" ? row.lamination : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const specs: string[] = [];
  if (row.color_mode) specs.push(row.color_mode);
  if (row.sides) specs.push(row.sides);
  if (row.roll_direction) specs.push(row.roll_direction);
  if (row.width && row.height) specs.push(`${row.width}" × ${row.height}"`);
  if (row.quantity) specs.push(`Qty: ${row.quantity}`);
  if (row.unit_price) specs.push(`${formatCurrency(row.unit_price)} ea`);
  if (row.comment) specs.push(row.comment);

  const variants = row.variants ?? [];
  const variantLabels = variants.map((v) => ({ name: v.name, quantity: v.quantity }));

  return {
    name: name || row.description || row.product_type || "Line item",
    specs,
    price: skuLineTotal(row),
    variantLabels,
  };
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
  const filesByLine = new Map<string, DbFile>();
  for (const f of files) {
    if (f.variant_id) filesByVariant.set(String(f.variant_id), f);
    else if (f.line_item_id) filesByLine.set(String(f.line_item_id), f);
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
      file: mapFileMeta(filesByLine.get(String(row.id))),
      variants: variantsByLine.get(String(row.id)) ?? [],
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

const LINE_ITEM_PREVIEW_COLUMNS =
  "id, ticket_id, sort_order, product_type, description, material, lamination, color_mode, sides, roll_direction, width, height, quantity, unit_price, line_total, design_required, die_cut, spot_uv, foil, perforation, comment";

const LINE_VARIANT_PREVIEW_COLUMNS =
  "id, line_item_id, ticket_id, sort_order, name, quantity";

async function fetchTicketLinesBundleInternal(
  admin: SupabaseClient,
  ticketId: string,
  lineSelect: string,
  variantSelect: string,
): Promise<TicketLineItemRow[]> {
  const [linesRes, variantsRes, filesRes] = await Promise.all([
    admin
      .from("ticket_line_items")
      .select(lineSelect)
      .eq("ticket_id", ticketId)
      .order("sort_order", { ascending: true }),
    admin
      .from("ticket_line_variants")
      .select(variantSelect)
      .eq("ticket_id", ticketId)
      .order("sort_order", { ascending: true }),
    admin
      .from("ticket_files")
      .select("id, line_item_id, variant_id, file_name, mime_type, byte_size")
      .eq("ticket_id", ticketId),
  ]);

  if (linesRes.error) {
    console.error("[fetchTicketLinesBundle] lines:", linesRes.error);
    return [];
  }

  return assembleBundle(
    (linesRes.data ?? []) as unknown as DbLine[],
    (variantsRes.data ?? []) as unknown as DbVariant[],
    (filesRes.data ?? []) as DbFile[],
  );
}

/** List quick-preview — slim columns, same shape as full bundle. */
export async function fetchTicketLinesBundleForPreview(
  admin: SupabaseClient,
  ticketId: string,
): Promise<TicketLineItemRow[]> {
  return fetchTicketLinesBundleInternal(
    admin,
    ticketId,
    LINE_ITEM_PREVIEW_COLUMNS,
    LINE_VARIANT_PREVIEW_COLUMNS,
  );
}

/** Batch line previews for list page-data — 3 queries total for all ticket IDs on the page. */
export async function fetchTicketLinePreviewBundlesBatch(
  admin: SupabaseClient,
  ticketIds: string[],
): Promise<Map<string, TicketLineItemRow[]>> {
  const uniqueIds = [...new Set(ticketIds.filter(Boolean))];
  const result = new Map<string, TicketLineItemRow[]>();
  if (uniqueIds.length === 0) return result;

  const [linesRes, variantsRes, filesRes] = await Promise.all([
    admin
      .from("ticket_line_items")
      .select(LINE_ITEM_PREVIEW_COLUMNS)
      .in("ticket_id", uniqueIds)
      .order("sort_order", { ascending: true }),
    admin
      .from("ticket_line_variants")
      .select(LINE_VARIANT_PREVIEW_COLUMNS)
      .in("ticket_id", uniqueIds)
      .order("sort_order", { ascending: true }),
    admin
      .from("ticket_files")
      .select("id, line_item_id, variant_id, file_name, mime_type, byte_size, ticket_id")
      .in("ticket_id", uniqueIds),
  ]);

  if (linesRes.error) {
    console.error("[fetchTicketLinePreviewBundlesBatch] lines:", linesRes.error);
    return result;
  }

  const lines = (linesRes.data ?? []) as unknown as DbLine[];
  const variants = (variantsRes.data ?? []) as unknown as DbVariant[];
  const files = (filesRes.data ?? []) as DbFile[];

  for (const ticketId of uniqueIds) {
    const ticketLines = lines.filter((l) => String(l.ticket_id) === ticketId);
    const ticketVariants = variants.filter((v) => String(v.ticket_id) === ticketId);
    const ticketFiles = files.filter((f) => String(f.ticket_id) === ticketId);
    result.set(
      ticketId,
      assembleBundle(ticketLines, ticketVariants, ticketFiles),
    );
  }

  return result;
}

export async function fetchTicketLinesBundle(
  admin: SupabaseClient,
  ticketId: string,
): Promise<TicketLineItemRow[]> {
  return fetchTicketLinesBundleInternal(admin, ticketId, "*", "*");
}

/** First SKU removed → line-level file; other SKU files → delete from Storage (DB row cascades). */
async function handleOrphanVariantFiles(
  admin: SupabaseClient,
  orphanVariantIds: string[],
): Promise<void> {
  if (!orphanVariantIds.length) return;

  const { data: orphanVariants } = await admin
    .from("ticket_line_variants")
    .select("id, line_item_id, sort_order")
    .in("id", orphanVariantIds);

  if (!orphanVariants?.length) return;

  const lineIds = [...new Set(orphanVariants.map((v) => String(v.line_item_id)))];

  const { data: allVariantsOnLines } = await admin
    .from("ticket_line_variants")
    .select("id, line_item_id, sort_order")
    .in("line_item_id", lineIds);

  const { data: fileRows } = await admin
    .from("ticket_files")
    .select("id, storage_path, variant_id, line_item_id")
    .in("variant_id", orphanVariantIds);

  const filesByVariant = new Map((fileRows ?? []).map((f) => [String(f.variant_id), f]));

  for (const ov of orphanVariants) {
    const variantId = String(ov.id);
    const file = filesByVariant.get(variantId);
    if (!file) continue;

    const lineId = String(ov.line_item_id);
    const onLine = (allVariantsOnLines ?? []).filter((v) => String(v.line_item_id) === lineId);
    const firstVariantId = [...onLine].sort(
      (a, b) => Number(a.sort_order) - Number(b.sort_order),
    )[0]?.id;

    if (String(firstVariantId) === variantId) {
      const { data: existingLineFile } = await admin
        .from("ticket_files")
        .select("id")
        .eq("line_item_id", lineId)
        .is("variant_id", null)
        .maybeSingle();

      if (existingLineFile && String(existingLineFile.id) !== String(file.id)) {
        if (file.storage_path) await deleteTicketAttachment(admin, String(file.storage_path));
        await admin.from("ticket_files").delete().eq("id", file.id);
        continue;
      }

      await admin.from("ticket_files").update({ variant_id: null }).eq("id", file.id);
    } else if (file.storage_path) {
      await deleteTicketAttachment(admin, String(file.storage_path));
    }
  }
}

async function deleteOrphanLineFiles(admin: SupabaseClient, lineIds: string[]): Promise<void> {
  if (!lineIds.length) return;

  const { data: fileRows } = await admin
    .from("ticket_files")
    .select("id, storage_path")
    .in("line_item_id", lineIds);

  for (const f of fileRows ?? []) {
    if (f.storage_path) {
      await deleteTicketAttachment(admin, String(f.storage_path));
    }
  }
}

/**
 * Upsert lines/variants by stable id; delete orphans.
 * Line attachment: moves to first SKU when SKUs are first added; returns to line when first SKU is removed;
 * deletes Storage when line item or non-first SKU file is removed.
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
    .select("id, line_item_id")
    .eq("ticket_id", ticketId);

  const variantCountBefore = new Map<string, number>();
  for (const v of existingVariants ?? []) {
    const lineId = String(v.line_item_id);
    variantCountBefore.set(lineId, (variantCountBefore.get(lineId) ?? 0) + 1);
  }

  const payloadLineIds = new Set<string>();
  const payloadVariantIds = new Set<string>();
  const lineIdsAddingFirstSku = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineId = line.id ?? randomUUID();
    payloadLineIds.add(lineId);

    const variantCountAfter = (line.variants ?? []).length;
    const variantCountPrior = variantCountBefore.get(lineId) ?? 0;
    if (variantCountPrior === 0 && variantCountAfter > 0) {
      lineIdsAddingFirstSku.add(lineId);
    }

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
    await handleOrphanVariantFiles(admin, orphanVariantIds);
    await admin.from("ticket_line_variants").delete().in("id", orphanVariantIds);
  }

  if (orphanLineIds.length) {
    await deleteOrphanLineFiles(admin, orphanLineIds);
    await admin.from("ticket_line_items").delete().in("id", orphanLineIds);
  }

  await migrateLineLevelFilesToFirstVariant(admin, ticketId, lineIdsAddingFirstSku);

  const line_items = await fetchTicketLinesBundle(admin, ticketId);
  return { ok: true, line_items };
}

/** When the first additional SKU is added, move line-level file onto that SKU. */
async function migrateLineLevelFilesToFirstVariant(
  admin: SupabaseClient,
  ticketId: string,
  lineIdsAddingFirstSku: Set<string>,
): Promise<void> {
  if (!lineIdsAddingFirstSku.size) return;

  const { data: lineFiles } = await admin
    .from("ticket_files")
    .select("id, line_item_id, storage_path")
    .eq("ticket_id", ticketId)
    .is("variant_id", null);

  if (!lineFiles?.length) return;

  const { data: variants } = await admin
    .from("ticket_line_variants")
    .select("id, line_item_id, sort_order")
    .eq("ticket_id", ticketId)
    .order("sort_order", { ascending: true });

  const firstByLine = new Map<string, string>();
  for (const v of variants ?? []) {
    const lid = String(v.line_item_id);
    if (!firstByLine.has(lid)) firstByLine.set(lid, String(v.id));
  }

  for (const f of lineFiles) {
    const lineId = String(f.line_item_id);
    if (!lineIdsAddingFirstSku.has(lineId)) continue;

    const firstVariantId = firstByLine.get(lineId);
    if (!firstVariantId) continue;

    const { data: variantHasFile } = await admin
      .from("ticket_files")
      .select("id")
      .eq("variant_id", firstVariantId)
      .maybeSingle();

    if (variantHasFile) {
      if (f.storage_path) await deleteTicketAttachment(admin, String(f.storage_path));
      await admin.from("ticket_files").delete().eq("id", f.id);
      continue;
    }

    await admin.from("ticket_files").update({ variant_id: firstVariantId }).eq("id", f.id);
  }
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
