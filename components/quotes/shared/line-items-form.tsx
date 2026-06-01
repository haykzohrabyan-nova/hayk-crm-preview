"use client";

import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import type { TicketLineDisplayRow } from "@/lib/utils/ticket-line-items";
import { AdditionalSkusOverviewList } from "./line-item-variants";
import { LineItemFileThumbnail } from "./line-item-attachment";
import type { TicketFileMeta } from "@/lib/utils/ticket-line-items";
import { emptySkuRow, emptyFormLineItem, type FormLineItem } from "./utils";
import { SkuRow } from "./sku-row";
import type { FormLineVariant } from "./line-item-variants";
import type { ProductType, SkuLookups } from "./types";
import { DetailLineItemCard } from "@/components/quotes/quote-detail/detail-layout-primitives";

interface LineItemsFormProps {
  /** When false, renders a read-only list. Default true. */
  editing?: boolean;
  skus: QuoteSku[] | FormLineItem[];
  products: ProductType[];
  skuLookups: SkuLookups;
  onUpdate: (idx: number, field: keyof QuoteSku, value: unknown) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  onVariantsChange?: (idx: number, variants: FormLineVariant[]) => void;
  onLineAttachmentChange?: (idx: number, attachment: import("./line-item-attachment").FormLineAttachment | undefined) => void;
  ticketRef?: string | null;
  displayLines?: TicketLineDisplayRow[];
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
  onVariantsChange,
  onLineAttachmentChange,
  ticketRef,
  displayLines,
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
    const rows = displayLines ?? skus;
    if (!rows.length) {
      return <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No line items yet.</p>;
    }
    return (
      <div className="space-y-3">
        {rows.map((sku, i) => {
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
          const variants = "variants" in sku && Array.isArray(sku.variants) ? sku.variants : [];
          const lineFile =
            "lineFile" in sku && sku.lineFile
              ? (sku.lineFile as TicketFileMeta)
              : null;
          const footer =
            variants.length > 0 ? (
              <AdditionalSkusOverviewList variants={variants} ticketRef={ticketRef} />
            ) : undefined;
          const thumbnail =
            lineFile ? (
              <LineItemFileThumbnail file={lineFile} ticketRef={ticketRef} fill />
            ) : undefined;
          return (
            <DetailLineItemCard
              key={i}
              name={name}
              specs={specs}
              price={lineTotal}
              footer={footer}
              thumbnail={thumbnail}
            />
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
        {skus.map((sku, idx) => {
          const formSku = sku as FormLineItem;
          return (
            <div key={formSku.id ?? idx} ref={idx === skus.length - 1 ? lastRowRef : undefined}>
              <SkuRow
                idx={idx}
                sku={sku}
                products={products}
                skuLookups={skuLookups}
                onUpdate={onUpdate}
                onRemove={onRemove}
                canRemove={skus.length > 1}
                variants={formSku.variants}
                lineAttachment={formSku.lineAttachment}
                onLineAttachmentChange={onLineAttachmentChange}
                onVariantsChange={onVariantsChange}
                ticketRef={ticketRef}
              />
            </div>
          );
        })}
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

export { emptySkuRow, emptyFormLineItem };
export type { FormLineItem };
