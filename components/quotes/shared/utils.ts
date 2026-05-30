import type { QuoteSku } from "@/lib/utils/ticket-math";
import type { FormLineVariant } from "./line-item-variants";
import type { FormLineAttachment } from "./line-item-attachment";
import type { LookupOption } from "./types";
import { lineQuantityFromVariants } from "@/lib/utils/line-item-variant-quantity";
import React from "react";

export type FormLineItem = QuoteSku & {
  id: string;
  variants: FormLineVariant[];
  /** Attachment for the line when there are no additional SKUs. */
  lineAttachment?: FormLineAttachment;
};

export function emptySkuRow(): QuoteSku {
  return {
    product_type: "",
    material: "",
    lamination: "None",
    width: undefined,
    height: undefined,
    quantity: undefined,
    unit_price: undefined,
    design_required: false,
    die_cut: false,
    spot_uv: false,
    foil: false,
    perforation: false,
  };
}

export function emptyFormLineItem(): FormLineItem {
  return {
    id: crypto.randomUUID(),
    ...emptySkuRow(),
    variants: [],
  };
}

/** API bundle rows → editable form lines (includes file metadata on variants). */
export function bundleToFormLineItems(
  lines: import("@/lib/utils/ticket-line-items").TicketLineItemRow[],
): FormLineItem[] {
  return lines.map((row) => ({
    id: row.id,
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
    variants: (() => {
      const mapped = row.variants.map((v) => ({
        id: v.id,
        name: v.name,
        quantity: String(v.quantity),
        file: v.file ?? null,
      }));
      if (mapped.length > 0 && row.file && !mapped[0].file) {
        mapped[0] = { ...mapped[0], file: row.file };
      }
      return mapped;
    })(),
    lineAttachment:
      row.variants.length === 0 && row.file
        ? { file: row.file }
        : undefined,
  })).map((line) => {
    const fromVariants = lineQuantityFromVariants(line.variants);
    if (fromVariants != null) {
      return { ...line, quantity: fromVariants };
    }
    return line;
  });
}

/**
 * Renders <option> elements for a lookup select.
 * If the currently saved value is no longer in the active list it is re-injected
 * so the select still shows the correct value and the data is never silently wiped on save.
 */
export function renderLookupOptions(
  opts: LookupOption[],
  currentLabel: string | undefined,
): React.ReactElement[] {
  const activeSet = new Set(opts.map((o) => o.label));
  const nodes = opts.map((o) => (
    React.createElement("option", { key: o.value, value: o.label }, o.label)
  ));
  if (currentLabel && !activeSet.has(currentLabel)) {
    nodes.push(
      React.createElement("option", { key: "__inactive__", value: currentLabel }, `${currentLabel} (inactive)`)
    );
  }
  return nodes;
}

export function priorityStyle(opt: string, active: boolean): React.CSSProperties {
  if (active) {
    if (opt === "Urgent") return { background: "var(--color-danger)", color: "#fff", borderColor: "var(--color-danger)" };
    if (opt === "High")   return { background: "#7C3AED", color: "#fff", borderColor: "#7C3AED" };
    if (opt === "Low")    return { background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)", borderColor: "var(--color-neutral-border)" };
    return { background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)", borderColor: "var(--color-btn-verify-bg)" };
  }
  if (opt === "Urgent") return { background: "transparent", color: "var(--color-danger)", borderColor: "var(--color-danger-border)" };
  if (opt === "High")   return { background: "transparent", color: "#7C3AED", borderColor: "#DDD6FE" };
  return { background: "transparent", color: "var(--color-text-muted)", borderColor: "var(--color-border)" };
}

export function quickDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
