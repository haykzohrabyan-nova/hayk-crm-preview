"use client";

import { LineItemsForm } from "@/components/quotes/shared/line-items-form";
import { QuoteForm } from "@/components/quotes/shared/quote-form";
import { OrderPaymentSummary } from "@/components/quotes/quote-detail/order-payment-summary";
import { emptySkuRow as sharedEmptySkuRow } from "@/components/quotes/shared/utils";
import type { QuoteSku, ProductType, SkuLookups } from "@/components/quotes/shared/types";
import type { QuoteFormTicket } from "@/components/quotes/shared/quote-form";
import type { SummaryTicket } from "@/components/quotes/quote-detail/order-payment-summary";
import type { TicketPaymentDraft } from "@/components/quotes/quote-payment-config";

function emptySkuRow(): QuoteSku {
  return sharedEmptySkuRow();
}

type SectionTicket = OverviewTicket & QuoteFormTicket & SummaryTicket;

interface OverviewTicket {
  quote_skus?: QuoteSku[] | null;
  special_requirements: string | null;
  notes: string | null;
}

interface Props {
  ticket: SectionTicket;
  products: ProductType[];
  skuLookups: SkuLookups;
  pricing: ReturnType<typeof import("@/lib/utils/ticket-math").computePricing>;
  shipping: number;
  setShipping: (v: number) => void;
  discountType: "percent" | "fixed" | "";
  setDiscountType: (v: "percent" | "fixed" | "") => void;
  discountValue: string;
  setDiscountValue: (v: string) => void;
  discountReason: string;
  setDiscountReason: (v: string) => void;
  taxRate: number;
  setTaxRate: (v: number) => void;
  taxExempt: boolean;
  setTaxExempt: (v: boolean) => void;
  salesPermit: string;
  setSalesPermit: (v: string) => void;
  salesPermitError?: string;
  paymentDraft: TicketPaymentDraft;
  onPaymentChange: (v: TicketPaymentDraft) => void;
  showPaymentSummary: boolean;
}

/** Shared read-only body below the snapshot card (payments / production / quote stages). */
export function TicketOverviewSections({
  ticket,
  products,
  skuLookups,
  pricing,
  shipping,
  setShipping,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  discountReason,
  setDiscountReason,
  taxRate,
  setTaxRate,
  taxExempt,
  setTaxExempt,
  salesPermit,
  setSalesPermit,
  salesPermitError,
  paymentDraft,
  onPaymentChange,
  showPaymentSummary,
}: Props) {
  return (
    <>
      {(ticket.special_requirements || ticket.notes) && (
        <div
          className="rounded-lg p-4 space-y-3"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
        >
          {ticket.special_requirements && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
                Special Requirements
              </p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-primary)" }}>
                {ticket.special_requirements}
              </p>
            </div>
          )}
          {ticket.notes && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
                Internal Notes
              </p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--color-text-primary)" }}>
                {ticket.notes}
              </p>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center gap-3 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>Line Items</p>
          <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
        </div>
        <LineItemsForm
          editing={false}
          skus={ticket.quote_skus?.length ? ticket.quote_skus : [emptySkuRow()]}
          products={products}
          skuLookups={skuLookups}
          onUpdate={() => {}}
          onRemove={() => {}}
          onAdd={() => {}}
        />
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>Pricing</p>
          <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
        </div>
        <QuoteForm
          editing={false}
          ticket={ticket}
          pricing={pricing}
          shipping={shipping}
          setShipping={setShipping}
          discountType={discountType}
          setDiscountType={setDiscountType}
          discountValue={discountValue}
          setDiscountValue={setDiscountValue}
          discountReason={discountReason}
          setDiscountReason={setDiscountReason}
          taxRate={taxRate}
          setTaxRate={setTaxRate}
          taxExempt={taxExempt}
          setTaxExempt={setTaxExempt}
          salesPermit={salesPermit}
          setSalesPermit={setSalesPermit}
          salesPermitError={salesPermitError}
          paymentDraft={paymentDraft}
          onPaymentChange={onPaymentChange}
        />
      </div>

      {showPaymentSummary && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>
              Payment &amp; Evidence
            </p>
            <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
          </div>
          <OrderPaymentSummary ticket={ticket} compact />
        </div>
      )}
    </>
  );
}
