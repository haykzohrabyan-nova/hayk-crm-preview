"use client";

import type { ReactNode } from "react";
import { LineItemsForm } from "@/components/quotes/shared/line-items-form";
import { QuoteForm } from "@/components/quotes/shared/quote-form";
import { ShippingFulfillmentSection } from "@/components/quotes/shared/shipping-fulfillment-section";
import { OrderPaymentSummary } from "@/components/quotes/quote-detail/order-payment-summary";
import { StripePaymentDetailSection } from "@/components/quotes/quote-detail/stripe-payment-detail-section";
import { isPaymentEvidencePending } from "@/lib/utils/invoice-payment-summary";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { resolveRequiresShipping } from "@/lib/utils/address";
import { emptySkuRow as sharedEmptySkuRow } from "@/components/quotes/shared/utils";
import type { QuoteSku, ProductType, SkuLookups } from "@/components/quotes/shared/types";
import type { TicketLineItemRow } from "@/lib/utils/ticket-line-items";
import { lineItemsToDisplayRows } from "@/lib/utils/ticket-line-items";
import type { QuoteFormTicket } from "@/components/quotes/shared/quote-form";
import type { SummaryTicket } from "@/components/quotes/quote-detail/order-payment-summary";
import type { TicketPaymentDraft } from "@/components/quotes/quote-payment-config";
import type { ShippingDestinationDraft, TicketShippingDestinationRow } from "@/lib/utils/ticket-shipping-destinations";
import {
  DetailSection,
  DetailSectionTitle,
  DetailCollapsibleSection,
  DetailNotesBox,
  DetailPricingTable,
  MoreSectionGroup,
} from "@/components/quotes/quote-detail/detail-layout-primitives";

function emptySkuRow(): QuoteSku {
  return sharedEmptySkuRow();
}

type SectionTicket = OverviewTicket & QuoteFormTicket & SummaryTicket;

interface OverviewTicket {
  line_items?: TicketLineItemRow[] | null;
  quote_skus?: QuoteSku[] | null;
  notes: string | null;
  quote_subtotal: number | null;
  quote_shipping: number | null;
  requires_shipping?: boolean | null;
  ship_to_line1?: string | null;
  ship_to_line2?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  ship_to_zip?: string | null;
  shipping_destinations?: TicketShippingDestinationRow[];
  quote_pre_tax_total: number | null;
  quote_tax_amount: number | null;
  quote_final_total: number | null;
  discount_type: string | null;
  discount_value: string | null;
  sales_permit_file_name?: string | null;
}

interface Props {
  ticket: SectionTicket;
  /** Reference code or ID — used to build the sales permit download URL. */
  ticketRef?: string;
  products: ProductType[];
  skuLookups: SkuLookups;
  pricing: ReturnType<typeof import("@/lib/utils/ticket-math").computePricing>;
  requiresShipping: boolean;
  setRequiresShipping: (v: boolean) => void;
  shippingDestinations: ShippingDestinationDraft[];
  setShippingDestinations: (rows: ShippingDestinationDraft[]) => void;
  customerId?: string | null;
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
  /** Order detail — Line Items expanded on load. */
  lineItemsDefaultOpen?: boolean;
  /** Extra sections (e.g. PaymentsReceived, RefundHistory) rendered inside the More group. */
  extraMoreContent?: ReactNode;
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
  ticketRef,
  products,
  skuLookups,
  pricing,
  requiresShipping,
  setRequiresShipping,
  shippingDestinations,
  setShippingDestinations,
  customerId,
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
  lineItemsDefaultOpen = false,
  extraMoreContent,
}: Props) {
  const paymentReviewAbove = isPaymentEvidencePending(ticket);
  const pricingRows = buildPricingRows(ticket);
  const fulfillmentRequiresShipping = resolveRequiresShipping(ticket);
  if (pricingRows.length > 0) {
    pricingRows[pricingRows.length - 1] = {
      ...pricingRows[pricingRows.length - 1],
      label: totalLabel,
    };
  }

  return (
    <>
      {/* ── Always visible ── */}
      <DetailSection>
        <DetailCollapsibleSection title="Line Items" defaultOpen={lineItemsDefaultOpen}>
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
        </DetailCollapsibleSection>
      </DetailSection>

      {canViewPaymentEvidence && ticket.stripe_payment_intent_id && (
        <StripePaymentDetailSection ticket={ticket} />
      )}

      {/* ── Collapsed under "More details" by default ── */}
      <MoreSectionGroup>
        <DetailSection>
          <DetailCollapsibleSection title="Fulfillment">
            <ShippingFulfillmentSection
              editing={false}
              requiresShipping={fulfillmentRequiresShipping}
              onRequiresShippingChange={() => {}}
              destinations={shippingDestinations}
              onDestinationsChange={() => {}}
              ticket={{
                ...ticket,
                requires_shipping: fulfillmentRequiresShipping,
                quote_shipping: ticket.quote_shipping,
                shipping_destinations: ticket.shipping_destinations,
              }}
            />
          </DetailCollapsibleSection>
        </DetailSection>

        <DetailSection>
          <DetailCollapsibleSection title={paymentReviewAbove ? "Quote details" : "Quote & Pricing"}>
            {!paymentReviewAbove && (
              <DetailPricingTable rows={pricingRows} totalLabel={totalLabel} />
            )}
            <div className={paymentReviewAbove ? "" : "mt-5"}>
              <QuoteForm
                editing={false}
                ticket={ticket}
                hidePricingSummary
                hideFulfillment
                pricing={pricing}
                requiresShipping={requiresShipping}
                setRequiresShipping={setRequiresShipping}
                shippingDestinations={shippingDestinations}
                setShippingDestinations={setShippingDestinations}
                customerId={customerId}
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
                salesPermitSavedName={ticket.sales_permit_file_name ?? null}
                salesPermitViewHref={ticket.sales_permit_file_name && ticketRef ? `/api/tickets/${ticketRef}/sales-permit` : null}
                paymentDraft={paymentDraft}
                onPaymentChange={onPaymentChange}
                recordedDepositAmount={ticket.deposit_paid_at ? (ticket.deposit_amount ?? null) : null}
              />
            </div>
          </DetailCollapsibleSection>
        </DetailSection>

        {ticket.notes && (
          <DetailSection>
            <DetailSectionTitle>Notes</DetailSectionTitle>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.07em] mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                Internal Notes
              </p>
              <DetailNotesBox>{ticket.notes}</DetailNotesBox>
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

        {extraMoreContent}
      </MoreSectionGroup>
    </>
  );
}
