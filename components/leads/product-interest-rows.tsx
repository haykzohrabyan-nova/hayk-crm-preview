"use client";

import { Plus, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeadProductInterestRow } from "@/lib/utils/validate-lead-product-interests";

const labelCls =
  "block text-[11px] font-medium uppercase tracking-[0.06em] leading-none";
const labelStyle = { color: "var(--color-text-muted)" };
const inputCls =
  "w-full h-9 rounded-[6px] border px-3 text-sm outline-none transition-all";
const inputStyle = {
  background: "var(--color-surface)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

export type ProductInterestRowErrors = {
  product: Set<number>;
  quantity: Set<number>;
};

interface ProductInterestRowsProps {
  rows: LeadProductInterestRow[];
  productTypes: { id: string; name: string }[];
  errors: ProductInterestRowErrors;
  readOnly?: boolean;
  onUpdateRow: (idx: number, patch: Partial<LeadProductInterestRow>) => void;
  onRemoveRow: (idx: number) => void;
  onAddRow: () => void;
  bannerError?: string | null;
}

export function ProductInterestRows({
  rows,
  productTypes,
  errors,
  readOnly = false,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  bannerError,
}: ProductInterestRowsProps) {
  return (
    <div className="space-y-2 pt-2">
      {bannerError && (
        <p className="text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">
          {bannerError}
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const selectedProducts = rows
              .filter((_, i) => i !== idx)
              .map((r) => r.product)
              .filter(Boolean);
            const availableTypes = productTypes.filter(
              (pt) => !selectedProducts.includes(pt.name),
            );
            const productError = errors.product.has(idx);
            const quantityError = errors.quantity.has(idx);

            return (
              <div
                key={idx}
                className="grid w-full grid-cols-[minmax(0,1fr)_88px_80px_36px] gap-x-2 gap-y-1"
              >
                <span className={`${labelCls} min-w-0`} style={labelStyle}>
                  Product
                </span>
                <span className={labelCls} style={labelStyle}>
                  Quantity
                </span>
                <span className={`${labelCls} whitespace-nowrap text-center`} style={labelStyle}>
                  Has Design
                </span>
                {!readOnly ? (
                  <span className={`${labelCls} invisible select-none`} aria-hidden>
                    Remove
                  </span>
                ) : (
                  <span aria-hidden />
                )}

                <div className="min-w-0">
                  <Select
                    value={row.product}
                    onValueChange={(v) => onUpdateRow(idx, { product: v ?? "" })}
                    disabled={readOnly}
                  >
                    <SelectTrigger
                      className="h-9 w-full text-sm"
                      style={productError ? { borderColor: "var(--color-danger)" } : undefined}
                      aria-invalid={productError}
                    >
                      <SelectValue placeholder="Select product…">
                        {row.product || "Select product…"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableTypes.map((pt) => (
                        <SelectItem key={pt.id} value={pt.name}>
                          {pt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={row.quantity}
                  onChange={(e) =>
                    onUpdateRow(idx, {
                      quantity: e.target.value.replace(/[^0-9]/g, "").replace(/^0+([1-9])/, "$1"),
                    })
                  }
                  disabled={readOnly}
                  placeholder="Qty"
                  className={inputCls}
                  style={{
                    ...inputStyle,
                    ...(quantityError ? { borderColor: "var(--color-danger)" } : {}),
                  }}
                  aria-invalid={quantityError}
                  onFocus={(e) => {
                    if (readOnly) return;
                    e.currentTarget.style.borderColor = "var(--color-accent)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--color-accent) 18%, transparent)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = quantityError
                      ? "var(--color-danger)"
                      : "var(--color-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />

                <div className="flex h-9 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={row.has_design}
                    onChange={(e) => onUpdateRow(idx, { has_design: e.target.checked })}
                    disabled={readOnly}
                    className="h-4 w-4 rounded disabled:cursor-default"
                    aria-label="Has design"
                  />
                </div>

                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => onRemoveRow(idx)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border text-[12px] font-medium transition-all active:scale-[0.97]"
                    style={{
                      background: "var(--color-surface)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-muted)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--color-danger-bg)";
                      e.currentTarget.style.borderColor = "var(--color-danger-border)";
                      e.currentTarget.style.color = "var(--color-danger)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--color-surface)";
                      e.currentTarget.style.borderColor = "var(--color-border)";
                      e.currentTarget.style.color = "var(--color-text-muted)";
                    }}
                    aria-label="Remove product interest"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="h-9 w-9" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {rows.length === 0 && readOnly && (
        <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
          No product interests recorded.
        </p>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={onAddRow}
          disabled={
            productTypes.length > 0 && rows.filter((r) => r.product).length >= productTypes.length
          }
          className="flex items-center gap-1.5 rounded-[6px] border border-dashed px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Product Interest
        </button>
      )}
    </div>
  );
}
