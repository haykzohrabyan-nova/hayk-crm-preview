"use client";

import { useEffect, useState } from "react";
import { Trash2, ChevronDown, AlertCircle } from "lucide-react";
import { formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import { renderLookupOptions } from "./utils";
import type { ProductType, SkuLookups } from "./types";
import { LineItemVariants, type FormLineVariant } from "./line-item-variants";
import {
  LineItemAttachmentControl,
  applyVariantListAttachmentChanges,
  type FormLineAttachment,
} from "./line-item-attachment";
import { lineQuantityFromVariants, sumVariantQuantities } from "@/lib/utils/line-item-variant-quantity";

interface SkuRowProps {
  idx: number;
  sku: QuoteSku;
  products: ProductType[];
  skuLookups: SkuLookups;
  onUpdate: (idx: number, field: keyof QuoteSku, value: unknown) => void;
  onRemove: (idx: number) => void;
  canRemove: boolean;
  variants?: FormLineVariant[];
  onVariantsChange?: (idx: number, variants: FormLineVariant[]) => void;
  lineAttachment?: FormLineAttachment;
  onLineAttachmentChange?: (idx: number, attachment: FormLineAttachment | undefined) => void;
  ticketRef?: string | null;
  rowError?: string;
  variantError?: string;
}

export function SkuRow({
  idx,
  sku,
  products,
  skuLookups,
  onUpdate,
  onRemove,
  canRemove,
  variants,
  onVariantsChange,
  lineAttachment,
  onLineAttachmentChange,
  ticketRef,
  rowError,
  variantError,
}: SkuRowProps) {
  const selectedProduct = products.find((p) => p.name === sku.product_type);
  const allMaterials = selectedProduct?.material_groups.flatMap((g) => g.materials) ?? [];
  const computedTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
  const skuFieldStyle = {
    background: "var(--color-surface)",
    borderWidth: "1px",
    borderStyle: "solid" as const,
    borderColor: "var(--color-border)",
    color: "var(--color-text-primary)",
  };

  const [lineTotalRaw, setLineTotalRaw] = useState(sku.line_total != null ? String(sku.line_total) : "");
  const [widthRaw, setWidthRaw]         = useState(sku.width      != null ? String(sku.width)      : "");
  const [heightRaw, setHeightRaw]       = useState(sku.height     != null ? String(sku.height)     : "");
  const [quantityRaw, setQuantityRaw]   = useState(sku.quantity   != null ? String(sku.quantity)   : "");
  const [unitPriceRaw, setUnitPriceRaw] = useState(sku.unit_price != null ? String(sku.unit_price) : "");

  const variantList = variants ?? [];
  const hasVariants = variantList.length > 0;
  const hasLineAttachment = Boolean(lineAttachment?.file || lineAttachment?.pendingFile);

  useEffect(() => {
    const list = variants ?? [];
    if (list.length > 0) {
      const total = sumVariantQuantities(list);
      setQuantityRaw(total > 0 ? String(total) : "");
    } else if (sku.quantity != null) {
      setQuantityRaw(String(sku.quantity));
    } else {
      setQuantityRaw("");
    }
  }, [variants, sku.quantity]);

  function handleVariantsChange(next: FormLineVariant[]) {
    const migrated = applyVariantListAttachmentChanges(variantList, next, lineAttachment);
    if (lineAttachment !== migrated.lineAttachment) {
      onLineAttachmentChange?.(idx, migrated.lineAttachment);
    }
    onVariantsChange?.(idx, migrated.variants);
    const synced = lineQuantityFromVariants(migrated.variants);
    if (synced != null) {
      onUpdate(idx, "quantity", synced);
    }
  }

  function SkuSelect({ value, onChange, disabled = false, error = false, children }: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    error?: boolean;
    children: React.ReactNode;
  }) {
    return (
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full appearance-none px-3 py-2 pr-8 rounded-md text-sm outline-none disabled:opacity-50"
          style={{ ...skuFieldStyle, ...(error ? { borderColor: "var(--color-danger)" } : {}) }}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--color-text-muted)" }}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-4"
      style={{ border: rowError ? "1px solid var(--color-danger)" : "1px solid var(--color-border)", background: "var(--color-bg)" }}
      data-field-anchor={`lineItem-${idx}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          Line {idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-danger)" }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {rowError && (
        <div
          className="flex items-center gap-2 rounded-md px-3 py-2 mb-3 text-[12px] font-medium"
          style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" }}
          role="alert"
        >
          <AlertCircle size={13} className="shrink-0" />
          {rowError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Product Type | Material */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Product Type *</label>
          <SkuSelect
            value={sku.product_type}
            onChange={(v) => { onUpdate(idx, "product_type", v); onUpdate(idx, "material", ""); }}
            error={!!rowError && !sku.product_type?.trim()}
          >
            <option value="">Select product…</option>
            {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </SkuSelect>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Material *</label>
          <SkuSelect
            value={sku.material ?? ""}
            onChange={(v) => onUpdate(idx, "material", v)}
            disabled={!selectedProduct}
            error={!!rowError && !sku.material?.trim()}
          >
            <option value="">Select material…</option>
            {allMaterials.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
          </SkuSelect>
        </div>

        {/* Width | Height */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Width (in) *</label>
          <input
            type="text" inputMode="decimal" placeholder="e.g. 4"
            value={widthRaw}
            onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && widthRaw === "0") { e.preventDefault(); if (e.key !== "0") { setWidthRaw(e.key); onUpdate(idx, "width", parseFloat(e.key)); } } }}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+([1-9])/, "$1").replace(/(\..*)\./g, "$1"); setWidthRaw(v); onUpdate(idx, "width", v && v !== "." ? parseFloat(v) : undefined); }}
            onBlur={() => { const n = parseFloat(widthRaw); setWidthRaw(isNaN(n) ? "" : String(n)); }}
            className="w-full px-3 py-2 rounded-md text-sm outline-none"
            style={{
              ...skuFieldStyle,
              ...(rowError && !(sku.width != null && sku.width > 0) ? { borderColor: "var(--color-danger)" } : {}),
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Height (in) *</label>
          <input
            type="text" inputMode="decimal" placeholder="e.g. 3"
            value={heightRaw}
            onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && heightRaw === "0") { e.preventDefault(); if (e.key !== "0") { setHeightRaw(e.key); onUpdate(idx, "height", parseFloat(e.key)); } } }}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+([1-9])/, "$1").replace(/(\..*)\./g, "$1"); setHeightRaw(v); onUpdate(idx, "height", v && v !== "." ? parseFloat(v) : undefined); }}
            onBlur={() => { const n = parseFloat(heightRaw); setHeightRaw(isNaN(n) ? "" : String(n)); }}
            className="w-full px-3 py-2 rounded-md text-sm outline-none"
            style={{
              ...skuFieldStyle,
              ...(rowError && !(sku.height != null && sku.height > 0) ? { borderColor: "var(--color-danger)" } : {}),
            }}
          />
        </div>

        {/* Color Mode | Sides */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Color Mode</label>
          <SkuSelect value={sku.color_mode ?? ""} onChange={(v) => onUpdate(idx, "color_mode", v || undefined)}>
            <option value="">None</option>
            {renderLookupOptions(skuLookups.color_mode, sku.color_mode)}
          </SkuSelect>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Sides</label>
          <SkuSelect value={sku.sides ?? ""} onChange={(v) => onUpdate(idx, "sides", v || undefined)}>
            <option value="">None</option>
            {renderLookupOptions(skuLookups.sides, sku.sides)}
          </SkuSelect>
        </div>

        {/* Quantity | Unit Price */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Quantity *{hasVariants ? (
              <span className="font-normal normal-case tracking-normal opacity-70"> — total of SKUs below</span>
            ) : null}
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 1000"
            value={quantityRaw}
            readOnly={hasVariants}
            title={hasVariants ? "Sum of additional SKU quantities" : undefined}
            onKeyDown={hasVariants ? undefined : (e) => { if (/^[0-9]$/.test(e.key) && quantityRaw === "0") { e.preventDefault(); if (e.key !== "0") { setQuantityRaw(e.key); onUpdate(idx, "quantity", parseInt(e.key)); } } }}
            onChange={hasVariants ? undefined : (e) => { const v = e.target.value.replace(/[^0-9]/g, "").replace(/^0+([1-9])/, "$1"); setQuantityRaw(v); onUpdate(idx, "quantity", v ? parseInt(v) : undefined); }}
            className="w-full px-3 py-2 rounded-md text-sm outline-none"
            style={{
              ...skuFieldStyle,
              ...(hasVariants ? { opacity: 0.85, cursor: "default" } : {}),
              ...(rowError && !((sku.quantity ?? 0) > 0) ? { borderColor: "var(--color-danger)" } : {}),
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Unit Price ($) *</label>
          <input
            type="text" inputMode="decimal" placeholder="0.00"
            value={unitPriceRaw}
            onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && unitPriceRaw === "0") { e.preventDefault(); if (e.key !== "0") { setUnitPriceRaw(e.key); onUpdate(idx, "unit_price", parseFloat(e.key)); } } }}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+([1-9])/, "$1").replace(/(\..*)\./g, "$1"); setUnitPriceRaw(v); onUpdate(idx, "unit_price", v && v !== "." ? parseFloat(v) : undefined); }}
            onBlur={() => { const n = parseFloat(unitPriceRaw); setUnitPriceRaw(isNaN(n) ? "" : String(n)); }}
            className="w-full px-3 py-2 rounded-md text-sm outline-none"
            style={{
              ...skuFieldStyle,
              ...(rowError && !((sku.unit_price ?? 0) > 0) ? { borderColor: "var(--color-danger)" } : {}),
            }}
          />
        </div>

        {/* Lamination | Roll Direction */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Lamination</label>
          <SkuSelect value={sku.lamination ?? "None"} onChange={(v) => onUpdate(idx, "lamination", v)}>
            {renderLookupOptions(skuLookups.lamination, sku.lamination)}
          </SkuSelect>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Roll Direction</label>
          <SkuSelect value={sku.roll_direction ?? ""} onChange={(v) => onUpdate(idx, "roll_direction", v || undefined)}>
            <option value="">None</option>
            {renderLookupOptions(skuLookups.roll_direction, sku.roll_direction)}
          </SkuSelect>
        </div>
      </div>

      {/* Calculated reference */}
      {computedTotal > 0 && sku.line_total == null && (
        <div className="mb-3 px-3 py-2 rounded text-sm font-semibold" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
          Calculated: {formatCurrency(computedTotal)} <span className="text-xs font-normal opacity-60">(qty × unit — override below if needed)</span>
        </div>
      )}

      {/* Add-on finishings + line attachment */}
      <div className="pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
            Add-on Finishings
          </p>
          {(!hasVariants || hasLineAttachment) && onLineAttachmentChange ? (
            <LineItemAttachmentControl
              compact
              attachment={lineAttachment}
              ticketRef={ticketRef}
              onChange={(att) => onLineAttachmentChange(idx, att)}
            />
          ) : hasVariants ? (
            <p className="text-[11px] text-right max-w-[200px]" style={{ color: "var(--color-text-muted)" }}>
              Line file below · attach per SKU in Additional SKUs
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {(skuLookups.finishing.length
            ? skuLookups.finishing.map((o) => ({ key: o.value as keyof QuoteSku, label: o.label }))
            : [
                { key: "spot_uv" as keyof QuoteSku, label: "Spot UV" },
                { key: "foil" as keyof QuoteSku, label: "Foil" },
                { key: "perforation" as keyof QuoteSku, label: "Perforation" },
              ]
          ).concat([
            { key: "design_required" as keyof QuoteSku, label: "Need a design" },
            { key: "die_cut" as keyof QuoteSku, label: "Die Cut" },
          ]).map(({ key, label }) => {
            const checked = !!sku[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onUpdate(idx, key, !checked)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all"
                style={checked
                  ? { background: "var(--color-badge-bg)", color: "var(--color-badge-text)", borderColor: "var(--color-accent)" }
                  : { background: "transparent", color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
                }
              >
                <span
                  className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0"
                  style={checked
                    ? { background: "var(--color-accent)", borderColor: "var(--color-accent)" }
                    : { borderColor: "var(--color-border)" }
                  }
                >
                  {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="var(--color-btn-primary-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Line Item Comment */}
      <div className="mt-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Line Item Comment</label>
        <textarea
          rows={2}
          placeholder="Optional notes for this SKU"
          value={sku.comment ?? ""}
          onChange={(e) => onUpdate(idx, "comment", e.target.value || undefined)}
          className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        />
      </div>

      {/* Line Total override */}
      <div className="mt-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
          Line Total ($) <span className="font-normal opacity-60">— actual price</span>
        </label>
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder={computedTotal > 0 ? formatCurrency(computedTotal).replace("$", "") : "0.00"}
          value={lineTotalRaw}
          onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && e.currentTarget.value === "0") { e.preventDefault(); if (e.key !== "0") { const nv = e.key; setLineTotalRaw(nv); onUpdate(idx, "line_total", parseFloat(nv)); } } }}
          onChange={(e) => { const v = e.target.value.replace(/^0+([1-9])/, "$1"); setLineTotalRaw(v); const n = parseFloat(v); onUpdate(idx, "line_total", isNaN(n) ? undefined : n); }}
          onBlur={() => { const n = parseFloat(lineTotalRaw); setLineTotalRaw(isNaN(n) ? "" : String(n)); }}
          className="w-full px-3 py-2 rounded-md text-sm outline-none"
          style={{
            background: "var(--color-surface)",
            border: sku.line_total != null ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
        {sku.line_total != null && (
          <button
            type="button"
            onClick={() => { setLineTotalRaw(""); onUpdate(idx, "line_total", undefined); }}
            className="mt-1 text-[10px] hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-text-muted)" }}
          >
            ✕ Clear override
          </button>
        )}
      </div>

      {variants != null && onVariantsChange ? (
        <LineItemVariants
          lineIdx={idx}
          variants={variantList}
          lineItemQuantity={sku.quantity}
          ticketRef={ticketRef}
          onChange={handleVariantsChange}
          bannerError={variantError}
          nameError={variantError?.includes("name is required") ? variantError : undefined}
          qtyError={variantError?.includes("quantity must be") ? variantError : undefined}
        />
      ) : null}
    </div>
  );
}
