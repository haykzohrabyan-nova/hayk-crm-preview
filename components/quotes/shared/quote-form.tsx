"use client";

import { useRef, useState } from "react";
import { ChevronDown, Paperclip, Download, X, FileText } from "lucide-react";
import { computePricing, formatCurrency } from "@/lib/utils/ticket-math";
import QuotePaymentConfig, { type TicketPaymentDraft } from "@/components/quotes/quote-payment-config";
import {
  ShippingFulfillmentSection,
  type ShippingFulfillmentDraft,
} from "@/components/quotes/shared/shipping-fulfillment-section";
import type { ShippingDestinationDraft } from "@/lib/utils/ticket-shipping-destinations";

export interface QuoteFormTicket extends ShippingFulfillmentDraft {
  quote_subtotal: number | null;
  quote_shipping: number | null;
  quote_pre_tax_total: number | null;
  quote_tax_amount: number | null;
  quote_final_total: number | null;
  quote_tax_rate_percent: number | null;
  tax_exempt: boolean;
  discount_type: string | null;
  discount_value: string | null;
  sales_permit_number: string | null;
  order_source: string | null;
}

interface QuoteFormProps {
  /** When false, renders a read-only summary using ticket values. Default true. */
  editing?: boolean;
  /** Required in read-only mode. */
  ticket?: QuoteFormTicket;
  /** Live pricing computation result (used in edit mode). */
  pricing: ReturnType<typeof computePricing>;
  requiresShipping: boolean;
  setRequiresShipping: (v: boolean) => void;
  shippingDestinations: ShippingDestinationDraft[];
  setShippingDestinations: (rows: ShippingDestinationDraft[]) => void;
  customerId?: string | null;
  zipError?: string;
  zipErrors?: Record<number, string>;
  discountType: "percent" | "fixed" | ""; setDiscountType: (v: "percent" | "fixed" | "") => void;
  discountValue: string; setDiscountValue: (v: string) => void;
  discountReason: string; setDiscountReason: (v: string) => void;
  taxRate: number; setTaxRate: (v: number) => void;
  taxExempt: boolean; setTaxExempt: (v: boolean) => void;
  salesPermit: string; setSalesPermit: (v: string) => void;
  salesPermitError?: string;
  /** Pending local file chosen in edit mode (not yet uploaded). */
  salesPermitPendingFile?: File | null;
  setSalesPermitPendingFile?: (f: File | null) => void;
  /** File name of the already-saved permit document (from ticket). */
  salesPermitSavedName?: string | null;
  /** URL to view / download the saved permit (e.g. /api/tickets/REF/sales-permit). */
  salesPermitViewHref?: string | null;
  /** Called when the user removes the saved file; parent marks it for deletion. */
  onClearSavedSalesPermit?: () => void;
  salesPermitFileError?: string;
  paymentDraft: TicketPaymentDraft;
  onPaymentChange: (cfg: TicketPaymentDraft) => void;
  customerPhone?: string;
  customerEmail?: string;
  /** Recorded deposit amount — shows an info banner explaining that saving will auto-recalculate. */
  recordedDepositAmount?: number | null;
  /** When true, hides the pricing breakdown (shown elsewhere, e.g. combined payment review card). */
  hidePricingSummary?: boolean;
  /** When true, fulfillment block is rendered by the parent (e.g. collapsible section). */
  hideFulfillment?: boolean;
}

export function QuoteForm(p: QuoteFormProps) {
  const editing = p.editing !== false;
  const fieldStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" };

  const [taxRateRaw, setTaxRateRaw]   = useState(p.taxRate   === 0 ? "" : String(p.taxRate));
  const permitFileInputRef = useRef<HTMLInputElement>(null);

  function onPermitFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    p.setSalesPermitPendingFile?.(file);
  }

  function StyledSelect({ value, onChange, children }: {
    value: string; onChange: (v: string) => void; children: React.ReactNode;
  }) {
    return (
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-3 py-2 pr-8 rounded-md text-sm border outline-none"
          style={fieldStyle}>
          {children}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--color-text-muted)" }} />
      </div>
    );
  }

  if (!editing && p.ticket) {
    const t = p.ticket;
    const subtotal    = t.quote_subtotal    ?? 0;
    const shipping    = t.quote_shipping    ?? 0;
    const pre_tax     = t.quote_pre_tax_total ?? 0;
    const tax_amount  = t.quote_tax_amount  ?? 0;
    const final_total = t.quote_final_total ?? 0;
    const discount_amount = Math.max(Math.round((subtotal + shipping - pre_tax) * 100) / 100, 0);

    return (
      <div className="space-y-4">
        {!p.hidePricingSummary && (
          <div className="rounded-lg p-4 space-y-2" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>Pricing Summary</h4>
            {([
              ["Subtotal", subtotal],
              ["Shipping", shipping],
              ["Discount", -discount_amount],
              ["Pre-tax Total", pre_tax],
              ["Tax", tax_amount],
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                <span style={{ color: val < 0 ? "var(--color-danger)" : "var(--color-text-primary)" }}>
                  {val !== 0 ? formatCurrency(Math.abs(val)) : "—"}
                </span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-lg pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
              <span style={{ color: "var(--color-text-primary)" }}>Total</span>
              <span className="tabular-nums" style={{ color: "var(--color-accent)" }}>{formatCurrency(final_total)}</span>
            </div>
          </div>
        )}

        {/* Key adjustments read-only — fulfillment shown in Overview Fulfillment section */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {([
            ["Order Flow", t.order_source === "direct" ? "Direct order" : "Quote first"],
            ["Discount", t.discount_type === "percent" ? `${t.discount_value}%` : t.discount_type === "fixed" ? `$${t.discount_value}` : null],
            ["Tax Rate", t.tax_exempt ? "Exempt" : t.quote_tax_rate_percent != null ? `${t.quote_tax_rate_percent}%` : null],
            ["Sales Permit #", t.tax_exempt ? (t.sales_permit_number ?? null) : null],
          ] as [string, string | null][]).map(([label, val]) => val ? (
            <div key={label}>
              <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>{label}</dt>
              <dd className="text-sm" style={{ color: "var(--color-text-primary)" }}>{val}</dd>
            </div>
          ) : null)}

          {/* Permit file download — shown whenever a saved file exists */}
          {t.tax_exempt && p.salesPermitSavedName && (
            <div>
              <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>Permit File</dt>
              <dd className="text-sm">
                {p.salesPermitViewHref ? (
                  <a
                    href={p.salesPermitViewHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium hover:underline"
                    style={{ color: "var(--color-tab-active)" }}
                  >
                    <FileText size={13} />
                    {p.salesPermitSavedName}
                    <Download size={11} />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5" style={{ color: "var(--color-text-primary)" }}>
                    <FileText size={13} />
                    {p.salesPermitSavedName}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pricing summary */}
      <div className="rounded-lg p-4 space-y-2" style={{ background: "var(--color-badge-bg)", border: "1px solid var(--color-border)" }}>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>Pricing Summary</h4>
        {([
          ["Subtotal", p.pricing.subtotal],
          ["Shipping", p.pricing.shipping],
          ["Discount", -p.pricing.discount_amount],
          ["Pre-tax Total", p.pricing.pre_tax_total],
          ["Tax", p.pricing.tax_amount],
        ] as [string, number][]).map(([label, val]) => (
          <div key={label} className="flex justify-between text-sm">
            <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
            <span style={{ color: val < 0 ? "var(--color-danger)" : "var(--color-text-primary)" }}>
              {val !== 0 ? formatCurrency(Math.abs(val)) : "—"}
            </span>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-base pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <span style={{ color: "var(--color-text-primary)" }}>Total</span>
          <span style={{ color: "var(--color-accent)" }}>{formatCurrency(p.pricing.final_total)}</span>
        </div>
      </div>

      {!p.hideFulfillment && (
        <ShippingFulfillmentSection
          editing
          customerId={p.customerId}
          requiresShipping={p.requiresShipping}
          onRequiresShippingChange={p.setRequiresShipping}
          destinations={p.shippingDestinations}
          onDestinationsChange={p.setShippingDestinations}
          zipError={p.zipError}
          zipErrors={p.zipErrors}
        />
      )}

      {/* Pricing Adjustments */}
      <div className="rounded-lg p-4 space-y-4 border" style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Adjustments</h4>

        {/* Tax Rate + Discount + Tax Exempt */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Tax Rate (%)</label>
            <input type="number" min={0} max={100} step={0.1} placeholder="0" disabled={p.taxExempt}
              value={taxRateRaw}
              onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && e.currentTarget.value === "0") { e.preventDefault(); if (e.key !== "0") { setTaxRateRaw(e.key); p.setTaxRate(parseFloat(e.key)); } } }}
              onChange={(e) => { const v = e.target.value.replace(/^0+([1-9])/, "$1"); setTaxRateRaw(v); p.setTaxRate(parseFloat(v) || 0); }}
              onBlur={() => { const n = parseFloat(taxRateRaw); setTaxRateRaw(isNaN(n) ? "" : String(n)); }}
              className="w-full px-3 py-2 rounded-md text-sm border outline-none disabled:opacity-40" style={fieldStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Discount</label>
            <div className="grid grid-cols-3 rounded-md overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
              {(["", "percent", "fixed"] as const).map((opt, i) => {
                const active = p.discountType === opt;
                return (
                  <button key={opt} type="button" onClick={() => p.setDiscountType(opt)}
                    className={`py-2 text-sm font-medium transition-all${i < 2 ? " border-r" : ""}`}
                    style={{
                      background: active ? "var(--color-accent)" : "var(--color-surface)",
                      color: active ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    {opt === "" ? "None" : opt === "percent" ? "%" : "$"}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Tax</label>
            <button type="button" onClick={() => p.setTaxExempt(!p.taxExempt)}
              className="w-full py-2 rounded-md text-sm font-medium border transition-all"
              style={p.taxExempt ? {
                background: "var(--color-accent)", color: "var(--color-btn-primary-text)", borderColor: "var(--color-accent)",
              } : {
                background: "var(--color-surface)", color: "var(--color-text-muted)", borderColor: "var(--color-border)",
              }}
            >
              Tax Exempt
            </button>
          </div>
        </div>

        {/* Conditional: discount value row */}
        {p.discountType && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                {p.discountType === "percent" ? "Discount %" : "Discount ($)"}
              </label>
              <input type="number" min={0} max={p.discountType === "percent" ? 100 : undefined}
                step={p.discountType === "percent" ? 1 : 0.01} value={p.discountValue}
                onChange={(e) => p.setDiscountValue(e.target.value)}
                placeholder={p.discountType === "percent" ? "0" : "0.00"}
                className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
            </div>
          </div>
        )}

        {/* Conditional: sales permit # (left) + permit file (right) — same 50/50 row */}
        {p.taxExempt && (
          <div className="grid grid-cols-2 gap-4" style={{ marginTop: 10 }}>
            {/* Left: permit number */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                Sales Permit # <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input value={p.salesPermit} onChange={(e) => p.setSalesPermit(e.target.value)}
                placeholder="Permit number…"
                className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                style={{ ...fieldStyle, ...(p.salesPermitError ? { border: "1px solid var(--color-danger)" } : {}) }} />
              {p.salesPermitError && (
                <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.salesPermitError}</p>
              )}
            </div>

            {/* Right: permit file */}
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                Permit File <span style={{ color: "var(--color-danger)" }}>*</span>
              </p>
              <input
                ref={permitFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={onPermitFileChange}
              />

                    {/* Pending file (not yet saved) */}
                    {p.salesPermitPendingFile ? (
                      <div
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm"
                        style={{ borderColor: "var(--color-border)", background: "var(--color-badge-bg)" }}
                      >
                        <FileText size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                        <span className="flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>
                          {p.salesPermitPendingFile.name}
                        </span>
                        <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                          uploads on save
                        </span>
                        <button
                          type="button"
                          onClick={() => p.setSalesPermitPendingFile?.(null)}
                          className="shrink-0 hover:opacity-70"
                          style={{ color: "var(--color-danger)" }}
                          aria-label="Remove file"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : p.salesPermitSavedName ? (
                      /* Saved file already on ticket */
                      <div
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm"
                        style={{ borderColor: "var(--color-border)", background: "var(--color-badge-bg)" }}
                      >
                        <FileText size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                        <span className="flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>
                          {p.salesPermitSavedName}
                        </span>
                        {p.salesPermitViewHref && (
                          <a
                            href={p.salesPermitViewHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 hover:opacity-70"
                            style={{ color: "var(--color-tab-active)" }}
                            aria-label="View permit file"
                            title="View permit file"
                          >
                            <Download size={14} />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => p.onClearSavedSalesPermit?.()}
                          className="shrink-0 hover:opacity-70"
                          style={{ color: "var(--color-danger)" }}
                          aria-label="Remove file"
                          title="Remove file"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      /* No file yet */
                      <button
                        type="button"
                        onClick={() => permitFileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border"
                        style={{
                          borderColor: p.salesPermitFileError ? "var(--color-danger)" : "var(--color-border)",
                          background: "var(--color-surface)",
                          color: "var(--color-text-primary)",
                        }}
                      >
                        <Paperclip size={13} />
                        Attach permit file
                      </button>
                    )}

              {p.salesPermitFileError && (
                <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.salesPermitFileError}</p>
              )}
            </div>
          </div>
        )}

        {/* Discount reason */}
        {p.discountType && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Discount Reason</label>
            <input value={p.discountReason} onChange={(e) => p.setDiscountReason(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-sm border outline-none"
              style={fieldStyle} placeholder="Reason for discount…" />
          </div>
        )}
      </div>

      {/* Payment & Order Configuration */}
      <QuotePaymentConfig
        quoteTotal={p.pricing.final_total}
        initialConfig={p.paymentDraft}
        onChange={p.onPaymentChange}
        customerPhone={p.customerPhone}
        customerEmail={p.customerEmail}
        recordedDepositAmount={p.recordedDepositAmount}
      />
    </div>
  );
}

export type { TicketPaymentDraft };
