"use client";

import { useRef, useState } from "react";
import { Trash2, Paperclip } from "lucide-react";
import type { TicketFileMeta, TicketLineVariantDisplayRow } from "@/lib/utils/ticket-line-items";
import {
  additionalSkuPrefix,
  formatAdditionalSkuDisplayName,
} from "@/lib/utils/format-ticket-line-variants";
import { defaultNewVariantQuantity } from "@/lib/utils/line-item-variant-quantity";
import { LineItemSavedFileActions } from "./line-item-attachment";

/** Read-only additional SKUs block for quote/order detail Overview. */
export function AdditionalSkusOverviewList({
  variants,
  ticketRef,
}: {
  variants: TicketLineVariantDisplayRow[];
  ticketRef?: string | null;
}) {
  if (!variants.length) return null;

  /** Match line item title in DetailLineItemCard */
  const rowTextCls = "text-sm md:text-[15px] leading-snug";

  return (
    <div
      className="border-t px-3.5 py-3 md:px-5 md:py-3.5 space-y-2.5"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--color-text-muted)" }}
      >
        Additional SKUs
      </p>
      {variants.map((v, i) => {
        const qty = Number(v.quantity);
        const qtyLabel = Number.isFinite(qty) && qty % 1 === 0 ? String(Math.round(qty)) : String(qty);
        const file = v.file;
        const canView = Boolean(file?.id && ticketRef);

        const sep = (
          <span className={`${rowTextCls} shrink-0 select-none`} style={{ color: "var(--color-text-muted)" }} aria-hidden>
            ·
          </span>
        );

        return (
          <div
            key={`${v.name}-${i}`}
            className="flex items-center gap-2 rounded-md border px-3 py-2.5 min-w-0"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <span className={`${rowTextCls} font-medium shrink-0`} style={{ color: "var(--color-text-primary)" }}>
                {formatAdditionalSkuDisplayName(i + 1, v.name)}
              </span>
              {sep}
              <span className={`${rowTextCls} shrink-0 tabular-nums`} style={{ color: "var(--color-text-muted)" }}>
                Qty {qtyLabel}
              </span>
              {file?.file_name && (
                <>
                  {sep}
                  <span
                    className={`${rowTextCls} truncate min-w-0`}
                    style={{ color: "var(--color-text-muted)" }}
                    title={file.file_name}
                  >
                    {file.file_name}
                  </span>
                </>
              )}
            </div>
            {canView && file && (
              <LineItemSavedFileActions file={file} ticketRef={ticketRef!} variant="overview" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface FormLineVariant {
  id: string;
  name: string;
  quantity: string;
  file?: TicketFileMeta | null;
  pendingFile?: File | null;
}

interface LineItemVariantsProps {
  editing?: boolean;
  lineIdx: number;
  variants: FormLineVariant[];
  /** Catalog line quantity — used to prefill the first additional SKU. */
  lineItemQuantity?: number;
  ticketRef?: string | null;
  onChange: (variants: FormLineVariant[]) => void;
  nameError?: string;
  qtyError?: string;
  bannerError?: string | null;
}

const labelCls = "block text-xs font-medium uppercase tracking-wider";
const labelStyle = { color: "var(--color-text-muted)" } as const;
const fieldStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text-primary)",
} as const;

/** Match text inputs (py-2 + text-sm + border) so Attach aligns with Quantity */
const controlHeightCls = "box-border h-[38px]";
const inputCls = `mt-1 w-full px-3 rounded-md text-sm border outline-none ${controlHeightCls}`;

function newVariantRow(): FormLineVariant {
  return { id: crypto.randomUUID(), name: "", quantity: "" };
}

export function LineItemVariants({
  editing = true,
  lineIdx,
  variants,
  lineItemQuantity,
  ticketRef,
  onChange,
  nameError,
  qtyError,
  bannerError,
}: LineItemVariantsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingVariantIdx, setPendingVariantIdx] = useState<number | null>(null);

  function updateVariant(idx: number, patch: Partial<FormLineVariant>) {
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }

  function removeVariant(idx: number) {
    onChange(variants.filter((_, i) => i !== idx));
  }

  function addVariant() {
    const quantity = defaultNewVariantQuantity(variants, lineItemQuantity);
    onChange([...variants, { ...newVariantRow(), quantity }]);
  }

  function pickFile(idx: number) {
    setPendingVariantIdx(idx);
    fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file == null || pendingVariantIdx == null) return;
    updateVariant(pendingVariantIdx, { pendingFile: file, file: undefined });
    setPendingVariantIdx(null);
  }

  if (!editing) {
    if (!variants.length) return null;
    return (
      <AdditionalSkusOverviewList
        variants={variants.map((v) => ({
          name: v.name,
          quantity: Number(v.quantity) || 0,
          file: v.file ?? null,
        }))}
        ticketRef={ticketRef}
      />
    );
  }

  return (
    <div className="mt-4 pt-4 border-t space-y-3" style={{ borderColor: "var(--color-border)" }} data-field-anchor={`lineVariants-${lineIdx}`}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFileSelected} />
      <div className="flex items-center justify-between">
        <p className={labelCls} style={labelStyle}>Additional SKUs</p>
        <button
          type="button"
          onClick={addVariant}
          className="inline-flex items-center rounded-[6px] border px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-80 active:scale-[0.97]"
          style={{
            borderColor: "var(--color-btn-primary-bg)",
            background: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
          }}
        >
          Add SKU
        </button>
      </div>
      {bannerError && (
        <p className="text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">
          {bannerError}
        </p>
      )}
      {variants.length === 0 && (
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Optional — each SKU has its own quantity; line Quantity above is the total of all SKUs.
        </p>
      )}
      {variants.map((v, vIdx) => (
        <div
          key={v.id}
          className="rounded-lg p-3 space-y-2 border"
          style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
        >
          <div className="flex flex-wrap gap-2 items-end">
            <div className="min-w-0 flex-1 basis-[140px]">
              <label className={labelCls} style={labelStyle}>
                {additionalSkuPrefix(vIdx + 1)} Name *
              </label>
              <input
                type="text"
                value={v.name}
                onChange={(e) => updateVariant(vIdx, { name: e.target.value })}
                className={inputCls}
                style={{
                  ...fieldStyle,
                  borderColor: nameError ? "var(--color-danger)" : "var(--color-border)",
                }}
                placeholder="SKU name"
              />
            </div>
            <div className="w-[88px] shrink-0">
              <label className={labelCls} style={labelStyle}>Quantity *</label>
              <input
                type="text"
                inputMode="numeric"
                value={v.quantity}
                onChange={(e) => updateVariant(vIdx, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                className={inputCls}
                style={{
                  ...fieldStyle,
                  borderColor: qtyError ? "var(--color-danger)" : "var(--color-border)",
                }}
                placeholder="0"
              />
            </div>
            <div className="flex shrink-0 flex-col">
              <label className={labelCls} style={labelStyle}>File</label>
              <div className={`mt-1 flex items-center gap-2 ${controlHeightCls}`}>
                <button
                  type="button"
                  onClick={() => pickFile(vIdx)}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 rounded-md text-sm font-medium border whitespace-nowrap h-full ${controlHeightCls}`}
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                    background: v.pendingFile || v.file ? "var(--color-badge-bg)" : "var(--color-surface)",
                  }}
                >
                  <Paperclip size={13} />
                  <span className="hidden md:inline">
                    {v.pendingFile ? "Replace" : v.file ? "Replace file" : "Attach image or PDF"}
                  </span>
                  <span className="md:hidden">{v.pendingFile || v.file ? "Replace" : "Attach"}</span>
                </button>
                {v.file?.id && ticketRef && !v.pendingFile && (
                  <LineItemSavedFileActions file={v.file} ticketRef={ticketRef} className={controlHeightCls} />
                )}
                {v.pendingFile && !v.file?.id && (
                  <LineItemSavedFileActions pendingFile={v.pendingFile} className={controlHeightCls} />
                )}
              </div>
            </div>
            <div className="shrink-0">
              <span className={`${labelCls} invisible select-none`} aria-hidden>
                Remove
              </span>
              <button
                type="button"
                onClick={() => removeVariant(vIdx)}
                className={`mt-1 p-2 rounded-md hover:opacity-70 ${controlHeightCls} flex items-center justify-center`}
                style={{ color: "var(--color-danger)" }}
                aria-label="Remove SKU"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          {v.pendingFile && (
            <p className="text-xs truncate max-w-full pl-0.5" style={{ color: "var(--color-text-muted)" }}>
              {v.pendingFile.name} · uploads on save
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export async function uploadPendingLineItemFiles(
  ticketRef: string,
  lines: { id?: string; variants?: FormLineVariant[]; lineAttachment?: { pendingFile?: File | null } }[],
): Promise<string | null> {
  for (const line of lines) {
    const lineId = line.id;
    if (lineId && line.lineAttachment?.pendingFile) {
      const fd = new FormData();
      fd.append("line_item_id", lineId);
      fd.append("file", line.lineAttachment.pendingFile);
      const res = await fetch(`/api/tickets/${ticketRef}/files`, { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return (j as { error?: string }).error ?? "Failed to upload file.";
      }
    }
    for (const v of line.variants ?? []) {
      if (!v.pendingFile) continue;
      const fd = new FormData();
      fd.append("variant_id", v.id);
      fd.append("file", v.pendingFile);
      const res = await fetch(`/api/tickets/${ticketRef}/files`, { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return (j as { error?: string }).error ?? "Failed to upload file.";
      }
    }
  }
  return null;
}

/** @deprecated Use uploadPendingLineItemFiles */
export const uploadPendingVariantFiles = uploadPendingLineItemFiles;

import type { FormLineItem } from "./utils";

export function lineItemsToApiPayload(
  lines: FormLineItem[],
): import("@/lib/utils/ticket-line-items").LineItemInput[] {
  return lines.map((line, i) => ({
    id: line.id,
    sort_order: i,
    product_type: line.product_type,
    description: line.description,
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
    variants: (line.variants ?? []).map((v, j) => ({
      id: v.id,
      name: v.name.trim(),
      quantity: Number(v.quantity) || 0,
      sort_order: j,
    })),
  }));
}
