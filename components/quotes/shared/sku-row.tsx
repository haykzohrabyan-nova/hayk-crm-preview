"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, ChevronDown, AlertCircle, Eye, FileText } from "lucide-react";
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

// ── Finishings multi-select dropdown ─────────────────────────────────────────

interface FinishingsDropdownProps {
  idx: number;
  sku: QuoteSku;
  skuLookups: SkuLookups;
  onUpdate: (idx: number, field: keyof QuoteSku, value: unknown) => void;
  hasVariants: boolean;
  hasLineAttachment: boolean;
  lineAttachment?: import("./line-item-attachment").FormLineAttachment;
  ticketRef?: string | null;
  onLineAttachmentChange?: (idx: number, att: import("./line-item-attachment").FormLineAttachment | undefined) => void;
}

function FinishingsDropdown({
  idx, sku, skuLookups, onUpdate,
  hasVariants, hasLineAttachment, lineAttachment, ticketRef, onLineAttachmentChange,
}: FinishingsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasFile = Boolean(lineAttachment?.file || lineAttachment?.pendingFile);

  // Auto-open preview when a new file is attached; close when cleared
  useEffect(() => {
    if (hasFile) setShowPreview(true);
    else setShowPreview(false);
  }, [hasFile]);

  // Object URL for pending (local) files — revoke on cleanup
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  useEffect(() => {
    const pending = lineAttachment?.pendingFile;
    if (!pending) { setPendingUrl(null); return; }
    const url = URL.createObjectURL(pending);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [lineAttachment?.pendingFile]);

  const previewUrl =
    pendingUrl ??
    (lineAttachment?.file?.id && ticketRef
      ? `/api/tickets/${ticketRef}/files/${lineAttachment.file.id}`
      : null);
  const mimeType = lineAttachment?.pendingFile?.type ?? lineAttachment?.file?.mime_type;
  const isImage  = Boolean(mimeType?.startsWith("image/"));

  const options: { key: keyof QuoteSku; label: string }[] = [
    ...(skuLookups.finishing.length
      ? skuLookups.finishing.map((o): { key: keyof QuoteSku; label: string } => ({ key: o.value as keyof QuoteSku, label: o.label }))
      : ([
          { key: "spot_uv" as keyof QuoteSku, label: "Spot UV" },
          { key: "foil" as keyof QuoteSku, label: "Foil" },
          { key: "perforation" as keyof QuoteSku, label: "Perforation" },
        ] satisfies { key: keyof QuoteSku; label: string }[])),
    { key: "design_required" as keyof QuoteSku, label: "Need a design" },
    { key: "die_cut" as keyof QuoteSku, label: "Die Cut" },
  ];

  const selected = options.filter(({ key }) => !!sku[key]);
  const label = selected.length === 0
    ? "None selected"
    : selected.map((o) => o.label).join(", ");

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const showAttachmentControl = (!hasVariants || hasLineAttachment) && !!onLineAttachmentChange;

  return (
    <div className="pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
        Add-on Finishings
      </p>

      {/* Single row: [dropdown] [attach] [visible checkbox] */}
      <div className="flex items-center gap-2">
        {/* Dropdown trigger — takes remaining space */}
        <div ref={ref} className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm border transition-all"
            style={{
              background: "var(--color-surface)",
              borderColor: open ? "var(--color-accent)" : "var(--color-border)",
              color: selected.length ? "var(--color-text-primary)" : "var(--color-text-muted)",
            }}
          >
            <span className="truncate text-left">{label}</span>
            <ChevronDown
              size={14}
              className="shrink-0 transition-transform"
              style={{
                color: "var(--color-text-muted)",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {open && (
            <div
              className="absolute z-50 left-0 right-0 mt-1 rounded-[10px] border py-1 shadow-lg"
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
            >
              {options.map(({ key, label: optLabel }) => {
                const checked = !!sku[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onUpdate(idx, key, !checked)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left"
                    style={{
                      background: checked ? "var(--color-row-hover)" : "transparent",
                      color: "var(--color-text-primary)",
                    }}
                    onMouseEnter={(e) => { if (!checked) (e.currentTarget as HTMLElement).style.background = "var(--color-row-alt)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = checked ? "var(--color-row-hover)" : "transparent"; }}
                  >
                    <span
                      className="w-4 h-4 rounded-sm border shrink-0 flex items-center justify-center"
                      style={checked
                        ? { background: "var(--color-accent)", borderColor: "var(--color-accent)" }
                        : { borderColor: "var(--color-border)", background: "var(--color-surface)" }
                      }
                    >
                      {checked && (
                        <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l2 2 4-4" stroke="var(--color-btn-primary-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    {optLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Attach file — same row as dropdown */}
        {showAttachmentControl ? (
          <LineItemAttachmentControl
            compact
            attachment={lineAttachment}
            ticketRef={ticketRef}
            onChange={(att) => onLineAttachmentChange!(idx, att)}
          />
        ) : hasVariants ? (
          <p className="text-[11px] shrink-0 max-w-[180px] text-right" style={{ color: "var(--color-text-muted)" }}>
            Attach per SKU ↓
          </p>
        ) : null}

        {/* Eye toggle — only when a file is attached */}
        {showAttachmentControl && hasFile && (
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="p-2 rounded-md border h-[38px] flex items-center shrink-0 transition-all"
            style={{
              borderColor: showPreview ? "var(--color-accent)" : "var(--color-border)",
              background: showPreview ? "var(--color-badge-bg)" : "var(--color-surface)",
              color: showPreview ? "var(--color-accent)" : "var(--color-text-muted)",
            }}
            title={showPreview ? "Hide preview" : "Show preview"}
            aria-label={showPreview ? "Hide file preview" : "Show file preview"}
          >
            <Eye size={15} />
          </button>
        )}
      </div>

      {/* Inline file preview — rendered BELOW the row so layout is unaffected */}
      {showPreview && previewUrl && (
        <div
          className="mt-2 rounded-lg overflow-hidden border"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", maxWidth: 220 }}
        >
          {isImage ? (
            <img
              src={previewUrl}
              alt={lineAttachment?.pendingFile?.name ?? lineAttachment?.file?.file_name ?? "preview"}
              className="w-full object-contain block"
              style={{ maxHeight: 180 }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 py-4 px-3">
              <FileText size={28} style={{ color: "var(--color-text-muted)" }} />
              <span
                className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
              >
                PDF
              </span>
              <span className="text-[11px] truncate max-w-full text-center" style={{ color: "var(--color-text-muted)" }}>
                {lineAttachment?.pendingFile?.name ?? lineAttachment?.file?.file_name}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map(({ key, label: chipLabel }) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
            >
              {chipLabel}
              <button
                type="button"
                onClick={() => onUpdate(idx, key, false)}
                className="ml-0.5 opacity-60 hover:opacity-100"
                style={{ lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
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
      <FinishingsDropdown
        idx={idx}
        sku={sku}
        skuLookups={skuLookups}
        onUpdate={onUpdate}
        hasVariants={hasVariants}
        hasLineAttachment={hasLineAttachment}
        lineAttachment={lineAttachment}
        ticketRef={ticketRef}
        onLineAttachmentChange={onLineAttachmentChange}
      />

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
