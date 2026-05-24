"use client";

import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import { emptySkuRow } from "./utils";
import { SkuRow } from "./sku-row";
import type { ProductType, SkuLookups } from "./types";
import { DetailLineItemCard } from "@/components/quotes/quote-detail/detail-layout-primitives";

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
          const name = [
            sku.product_type || "—",
            sku.material,
            sku.lamination && sku.lamination !== "None" ? sku.lamination : null,
          ].filter(Boolean).join(" · ");
          const specs: string[] = [];
          if (sku.color_mode) specs.push(sku.color_mode);
          if (sku.sides) specs.push(sku.sides);
          if (sku.roll_direction) specs.push(sku.roll_direction);
          if (sku.width && sku.height) specs.push(`${sku.width}" × ${sku.height}"`);
          if (sku.quantity) specs.push(`Qty: ${sku.quantity}`);
          if (sku.unit_price) specs.push(`${formatCurrency(sku.unit_price)} ea`);
          if (sku.comment) specs.push(sku.comment);
          return (
            <DetailLineItemCard key={i} name={name} specs={specs} price={lineTotal} />
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
