"use client";

import { LineItemsForm } from "@/components/quotes/shared/line-items-form";
import { QuoteForm } from "@/components/quotes/shared/quote-form";
import { OrderPaymentSummary } from "@/components/quotes/quote-detail/order-payment-summary";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { emptySkuRow as sharedEmptySkuRow } from "@/components/quotes/shared/utils";
import type { QuoteSku, ProductType, SkuLookups } from "@/components/quotes/shared/types";
import type { TicketLineItemRow } from "@/lib/utils/ticket-line-items";
import { lineItemsToDisplayRows } from "@/lib/utils/ticket-line-items";
import type { QuoteFormTicket } from "@/components/quotes/shared/quote-form";
import type { SummaryTicket } from "@/components/quotes/quote-detail/order-payment-summary";
import type { TicketPaymentDraft } from "@/components/quotes/quote-payment-config";
import {
  DetailSection,
  DetailSectionTitle,
  DetailCollapsibleSection,
  DetailNotesBox,
  DetailPricingTable,
} from "@/components/quotes/quote-detail/detail-layout-primitives";

function emptySkuRow(): QuoteSku {
  return sharedEmptySkuRow();
}

type SectionTicket = OverviewTicket & QuoteFormTicket & SummaryTicket;

interface OverviewTicket {
  line_items?: TicketLineItemRow[] | null;
  quote_skus?: QuoteSku[] | null;
  special_requirements: string | null;
  notes: string | null;
  quote_subtotal: number | null;
  quote_shipping: number | null;
  quote_pre_tax_total: number | null;
  quote_tax_amount: number | null;
  quote_final_total: number | null;
  discount_type: string | null;
  discount_value: string | null;
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
  canViewPaymentEvidence?: boolean;
  totalLabel?: "Order Total" | "Quote Total";
}

function buildPricingRows(ticket: SectionTicket): { label: string; value: string; muted?: boolean }[] {
  const subtotal = ticket.quote_subtotal ?? 0;
  const shipping = ticket.quote_shipping ?? 0;
  const preTax = ticket.quote_pre_tax_total ?? 0;
  const taxAmount = ticket.quote_tax_amount ?? 0;
  const finalTotal = Number(ticket.quote_final_total ?? 0);
  const discountAmount = Math.max(Math.round((subtotal + shipping - preTax) * 100) / 100, 0);

  return [
    { label: "Subtotal", value: formatCurrency(subtotal) },
    { label: "Shipping", value: shipping > 0 ? formatCurrency(shipping) : "—", muted: shipping <= 0 },
    { label: "Discount", value: discountAmount > 0 ? formatCurrency(discountAmount) : "—", muted: discountAmount <= 0 },
    { label: "Pre-tax Total", value: formatCurrency(preTax), muted: true },
    { label: "Tax", value: taxAmount > 0 ? formatCurrency(taxAmount) : "—", muted: taxAmount <= 0 },
    { label: "Order Total", value: formatCurrency(finalTotal) },
  ];
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
  canViewPaymentEvidence = true,
  totalLabel = "Order Total",
}: Props) {
  const paymentReviewAbove = isPaymentEvidencePending(ticket);
  const pricingRows = buildPricingRows(ticket);
  if (pricingRows.length > 0) {
    pricingRows[pricingRows.length - 1] = {
      ...pricingRows[pricingRows.length - 1],
      label: totalLabel,
    };
  }

  return (
    <>
      <DetailSection>
        <DetailSectionTitle>Line Items</DetailSectionTitle>
        <LineItemsForm
          editing={false}
          skus={[]}
          displayLines={
            ticket.line_items?.length ? lineItemsToDisplayRows(ticket.line_items) : []
          }
          products={products}
          skuLookups={skuLookups}
          ticketRef={("reference_code" in ticket && ticket.reference_code) ? String(ticket.reference_code) : null}
          onUpdate={() => {}}
          onRemove={() => {}}
          onAdd={() => {}}
        />
      </DetailSection>

      <DetailSection>
        <DetailCollapsibleSection title={paymentReviewAbove ? "Quote details" : "Pricing"}>
          {!paymentReviewAbove && (
            <DetailPricingTable rows={pricingRows} totalLabel={totalLabel} />
          )}
          <div className={paymentReviewAbove ? "" : "mt-5"}>
            <QuoteForm
              editing={false}
              ticket={ticket}
              hidePricingSummary
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
        </DetailCollapsibleSection>
      </DetailSection>

      {(ticket.special_requirements || ticket.notes) && (
        <DetailSection>
          <DetailSectionTitle>Notes &amp; Requirements</DetailSectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.07em] mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                Special Requirements
              </p>
              <DetailNotesBox>{ticket.special_requirements}</DetailNotesBox>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.07em] mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                Internal Notes
              </p>
              <DetailNotesBox>{ticket.notes}</DetailNotesBox>
            </div>
          </div>
        </DetailSection>
      )}

      {showPaymentSummary && (
        <OrderPaymentSummary
          ticket={ticket}
          canViewPaymentEvidence={canViewPaymentEvidence}
          paymentReviewAbove={paymentReviewAbove}
          layout="grid"
        />
      )}
    </>
  );
}
