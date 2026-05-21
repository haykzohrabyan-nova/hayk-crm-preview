"use client";

import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import { emptySkuRow } from "./utils";
import { SkuRow } from "./sku-row";
import type { ProductType, SkuLookups } from "./types";

interface LineItemsFormProps {
  /** When false, renders a read-only list. Default true. */
  editing?: boolean;
  skus: QuoteSku[];
  products: ProductType[];
  skuLookups: SkuLookups;
  onUpdate: (idx: number, field: keyof QuoteSku, value: unknown) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  error?: string;
}

export function LineItemsForm({
  editing = true,
  skus,
  products,
  skuLookups,
  onUpdate,
  onRemove,
  onAdd,
  error,
}: LineItemsFormProps) {
  const lastRowRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(skus.length);

  useEffect(() => {
    if (editing && skus.length > prevLengthRef.current) {
      lastRowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    prevLengthRef.current = skus.length;
  }, [skus.length, editing]);

  if (!editing) {
    if (!skus.length) {
      return <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No line items yet.</p>;
    }
    return (
      <div className="space-y-3">
        {skus.map((sku, i) => {
          const computedLineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
          const lineTotal = sku.line_total ?? computedLineTotal;
          return (
            <div key={i} className="rounded-lg p-3 border" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {sku.product_type || "—"}{sku.material ? ` · ${sku.material}` : ""}{sku.lamination && sku.lamination !== "None" ? ` · ${sku.lamination}` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {sku.color_mode ? `${sku.color_mode}` : ""}{sku.sides ? ` · ${sku.sides}` : ""}{sku.roll_direction ? ` · ${sku.roll_direction}` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {sku.width && sku.height ? `${sku.width}" × ${sku.height}" · ` : ""}
                    {sku.quantity ? `Qty: ${sku.quantity}` : ""}{sku.unit_price ? ` · ${formatCurrency(sku.unit_price)} ea` : ""}
                  </p>
                  {sku.comment && (
                    <p className="text-xs mt-1 italic" style={{ color: "var(--color-text-muted)" }}>{sku.comment}</p>
                  )}
                </div>
                {lineTotal > 0 && (
                  <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatCurrency(lineTotal)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3 mb-4 text-sm"
          style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      <div className="space-y-4">
        {skus.map((sku, idx) => (
          <div key={idx} ref={idx === skus.length - 1 ? lastRowRef : undefined}>
            <SkuRow
              idx={idx}
              sku={sku}
              products={products}
              skuLookups={skuLookups}
              onUpdate={onUpdate}
              onRemove={onRemove}
              canRemove={skus.length > 1}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 w-full py-3 text-sm font-medium rounded-lg border-2 border-dashed transition-colors hover:opacity-80"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
          background: "transparent",
        }}
      >
        Add Line Item
      </button>
    </div>
  );
}

export { emptySkuRow };
