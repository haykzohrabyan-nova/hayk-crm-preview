import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { formatDateLong } from "@/lib/utils/format";
import type { TicketFileMeta, TicketLineDisplayRow } from "@/lib/utils/ticket-line-items";
import { formatShipToAddress } from "@/lib/utils/address";
import { formatTicketLineVariantLabel } from "@/lib/utils/format-ticket-line-variants";
import type { ShippingDestinationDisplayRow } from "@/lib/utils/ticket-shipping-destinations";
import type { InvoicePaymentSummary } from "@/lib/utils/invoice-payment-summary";
import type { CustomerDocumentBanner } from "@/lib/utils/public-invoice-document";

// ── Colors ──────────────────────────────────────────────────────────────────
const NAVY = "#1B2B4B";
const GOLD = "#E8C97A";
const MUTED = "#888888";
const BORDER = "#E5E7EB";
const DANGER = "#DC2626";

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#333333",
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    backgroundColor: "#ffffff",
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: NAVY,
    borderBottomStyle: "solid",
  },
  logo: { width: 160, height: 48, objectFit: "contain" },
  companyName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  companyDetail: { fontSize: 9, color: MUTED, lineHeight: 1.6 },

  docType: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    letterSpacing: 1,
    textAlign: "right",
    marginBottom: 6,
  },
  rushBadge: {
    backgroundColor: "#FEF3C7",
    color: "#D97706",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  docMeta: { fontSize: 10, color: "#444", textAlign: "right", lineHeight: 1.8 },
  docMetaMuted: { color: MUTED },

  // Bill To / Prepared By
  parties: {
    flexDirection: "row",
    gap: 32,
    marginBottom: 28,
  },
  partyCol: { flex: 1 },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: MUTED,
    marginBottom: 5,
  },
  partyName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 2,
  },
  partyDetail: { fontSize: 10, color: "#555", marginBottom: 1 },
  reLine: { fontSize: 10, color: "#555", marginTop: 4 },

  shippingSection: { marginBottom: 20 },
  shippingGridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  shippingCard: {
    width: "48%",
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    backgroundColor: "#FAFAFA",
  },

  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F8F9FA",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: "solid",
    marginBottom: 0,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    borderBottomStyle: "solid",
  },
  tableRowAlt: { backgroundColor: "#FAFAFA" },
  thText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: MUTED,
  },
  tdText: { fontSize: 10, color: "#333" },
  tdBold: { fontFamily: "Helvetica-Bold", color: NAVY },
  tdSub: { fontSize: 8, color: MUTED, marginTop: 1 },
  tdNote: { fontSize: 8, color: "#aaa", marginTop: 1 },

  // Column widths
  colNum: { width: 20 },
  colProduct: { flex: 2 },
  colSpec: { flex: 2 },
  colQty: { width: 40, textAlign: "right" },
  colUnit: { width: 60, textAlign: "right" },
  colTotal: { width: 64, textAlign: "right" },

  // Pricing summary
  pricingWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12, marginBottom: 28 },
  pricingBox: { width: 220, borderTopWidth: 1, borderTopColor: BORDER, borderTopStyle: "solid" },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  priceLabel: { fontSize: 10, color: MUTED },
  priceValue: { fontSize: 10, color: "#333" },
  priceDanger: { color: DANGER },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: NAVY,
    borderTopStyle: "solid",
  },
  totalLabel: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY },
  totalValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: NAVY },

  paymentDivider: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderTopStyle: "solid",
  },
  paymentHighlight: { fontFamily: "Helvetica-Bold", color: "#92400E" },
  paymentHighlightValue: { fontFamily: "Helvetica-Bold", color: "#92400E" },
  paymentPaid: { color: "#16A34A" },
  paymentReview: { fontFamily: "Helvetica-Bold", color: "#92400E" },
  paymentReviewValue: { fontFamily: "Helvetica-Bold", color: "#92400E" },
  paymentReviewBanner: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderStyle: "solid",
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
  },
  paymentReviewBannerTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#92400E",
    marginBottom: 4,
  },
  paymentReviewBannerText: {
    fontSize: 9,
    color: "#92400E",
    lineHeight: 1.5,
  },
  cancelledBanner: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderStyle: "solid",
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  cancelledBannerTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#DC2626",
    marginBottom: 4,
  },
  cancelledBannerText: {
    fontSize: 9,
    color: "#DC2626",
    lineHeight: 1.5,
  },
  paymentNote: { fontSize: 8, color: MUTED, fontStyle: "italic", marginTop: 2 },

  // Details section
  detailsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderTopStyle: "solid",
    marginBottom: 24,
  },
  detailBlock: { width: "45%" },
  detailBlockFull: { width: "100%" },
  detailValue: { fontSize: 10, color: "#333" },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 14,
    borderTopWidth: 2,
    borderTopColor: GOLD,
    borderTopStyle: "solid",
    marginTop: "auto",
  },
  footerThanks: { fontSize: 10, color: MUTED },
  footerWebsite: { fontSize: 10, fontFamily: "Helvetica-Bold", color: NAVY },
});

// ── Props ─────────────────────────────────────────────────────────────────────
export interface InvoicePDFProps {
  isOrder: boolean;
  company: {
    name: string;
    logoUrl: string | null;
    address: string;
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  ticket: {
    referenceCode: string | null;
    title: string | null;
    createdAt: string;
    dueDate: string | null;
    rush: boolean | null;
    priority: string | null;
    specialRequirements: string | null;
    quoteSubtotal: number | null;
    quoteShipping: number | null;
    discountReason: string | null;
    quotePreTaxTotal: number | null;
    quoteTaxRatePercent: number | null;
    quoteTaxAmount: number | null;
    quoteFinalTotal: number | null;
    taxExempt: boolean | null;
    taxExemptReviewPending?: boolean;
    refundStatus?: string | null;
    totalRefundedAmount?: number | null;
    quoteChannel: string | null;
    requiresShipping?: boolean | null;
    /** @deprecated Prefer shippingDestinations */
    shipToAddress?: string | null;
    shippingDestinations?: ShippingDestinationDisplayRow[];
  };
  customer: { name: string; email: string; phone: string; company: string };
  repName: string;
  skus: TicketLineDisplayRow[];
  discountAmt: number | null;
  paymentMethods: string;
  paymentSummary?: InvoicePaymentSummary | null;
  /** Cancelled / refund notice — suppresses misleading payment-under-review copy */
  documentBanner?: CustomerDocumentBanner;
  /** Omit totals / deposit / balance (cancelled or refunded customer documents) */
  hidePricingSummary?: boolean;
  /** Omit all financial data — unit prices, line totals, and the entire pricing summary block. Qty is kept. */
  hidePricing?: boolean;
}

const fmtDate = formatDateLong;

function fileLabel(file?: TicketFileMeta | null): string | null {
  if (!file?.file_name) return null;
  return file.file_name;
}

function shippingDestinationPairs(
  rows: ShippingDestinationDisplayRow[],
): ShippingDestinationDisplayRow[][] {
  const pairs: ShippingDestinationDisplayRow[][] = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push(rows.slice(i, i + 2));
  }
  return pairs;
}

function ShippingDestinationCard({ row }: { row: ShippingDestinationDisplayRow }) {
  const addr = formatShipToAddress(row);
  const amount = Number(row.shipping_amount) || 0;
  return (
    <View style={s.shippingCard}>
      {amount > 0 ? (
        <Text style={[s.partyDetail, { marginBottom: 4 }]}>
          Shipping: {formatCurrency(amount)}
        </Text>
      ) : null}
      {addr ? (
        addr.split("\n").map((line, j) => (
          <Text key={j} style={s.partyDetail}>{line}</Text>
        ))
      ) : (
        <Text style={{ fontSize: 10, color: MUTED }}>No address entered</Text>
      )}
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function InvoicePDF({
  isOrder,
  company,
  ticket,
  customer,
  repName,
  skus,
  discountAmt,
  paymentMethods,
  paymentSummary,
  documentBanner = null,
  hidePricingSummary = false,
  hidePricing = false,
}: InvoicePDFProps) {
  const docType = isOrder ? "INVOICE" : "QUOTE";
  const isOrderDoc = isOrder;
  const shippingRows = ticket.shippingDestinations ?? [];
  const singleShipping =
    shippingRows.length === 1 ? shippingRows[0] : null;
  const singleShipToText =
    (singleShipping && formatShipToAddress(singleShipping)) ||
    ticket.shipToAddress ||
    null;
  const multiShipping = shippingRows.length > 1 ? shippingRows : [];

  return (
    <Document
      title={`${docType} — ${ticket.title ?? "Untitled"} — ${company.name}`}
      author={company.name}
    >
      <Page size="LETTER" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          {/* Left: company info */}
          <View>
            {company.logoUrl ? (
              <Image src={company.logoUrl} style={s.logo} />
            ) : (
              <Text style={s.companyName}>{company.name.toUpperCase()}</Text>
            )}
            {company.address ? <Text style={s.companyDetail}>{company.address}</Text> : null}
            {company.phone ? <Text style={s.companyDetail}>{company.phone}</Text> : null}
            {company.email ? <Text style={s.companyDetail}>{company.email}</Text> : null}
            {company.website ? <Text style={s.companyDetail}>{company.website}</Text> : null}
          </View>

          {/* Right: doc type + meta */}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 6 }}>
              <Text style={s.docType}>{docType}</Text>
              {ticket.rush ? (
                <View style={s.rushBadge}>
                  <Text>RUSH</Text>
                </View>
              ) : null}
            </View>
            <View>
              {ticket.referenceCode ? (
                <Text style={s.docMeta}>
                  <Text style={s.docMetaMuted}>Ref: </Text>
                  {ticket.referenceCode}
                </Text>
              ) : null}
              <Text style={s.docMeta}>
                <Text style={s.docMetaMuted}>Date: </Text>
                {fmtDate(ticket.createdAt)}
              </Text>
              {ticket.dueDate ? (
                <Text style={s.docMeta}>
                  <Text style={s.docMetaMuted}>Due: </Text>
                  {fmtDate(ticket.dueDate)}
                </Text>
              ) : null}
              {ticket.priority && ticket.priority !== "Normal" ? (
                <Text style={s.docMeta}>
                  <Text style={s.docMetaMuted}>Priority: </Text>
                  {ticket.priority}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {documentBanner === "cancelled" ||
        documentBanner === "cancelled_refunded_full" ||
        documentBanner === "cancelled_refunded_partial" ? (
          <View style={s.cancelledBanner}>
            <Text style={s.cancelledBannerTitle}>
              {isOrderDoc ? "ORDER CANCELLED" : "QUOTE CANCELLED"}
            </Text>
            <Text style={s.cancelledBannerText}>
              {isOrderDoc
                ? "This order has been cancelled. Please contact your sales representative if you have questions."
                : "This quote has been cancelled. Please contact us if you have questions."}
            </Text>
          </View>
        ) : null}
        {documentBanner === "cancelled_refunded_full" ||
        documentBanner === "cancelled_refunded_partial" ? (
          <View style={[s.paymentReviewBanner, { marginTop: documentBanner.startsWith("cancelled") ? 8 : 0 }]}>
            <Text style={s.paymentReviewBannerTitle}>
              {documentBanner === "cancelled_refunded_full" ? "FULLY REFUNDED" : "PARTIALLY REFUNDED"}
            </Text>
            <Text style={s.paymentReviewBannerText}>
              {documentBanner === "cancelled_refunded_full"
                ? "Payment received on this order has been fully refunded."
                : "A partial refund has been issued on this order."}
            </Text>
          </View>
        ) : documentBanner === "refunded_full" ? (
          <View style={s.paymentReviewBanner}>
            <Text style={s.paymentReviewBannerTitle}>FULLY REFUNDED</Text>
            <Text style={s.paymentReviewBannerText}>
              This order has been fully refunded. Please contact your sales representative if you have any questions.
            </Text>
          </View>
        ) : documentBanner === "refunded_partial" ? (
          <View style={s.paymentReviewBanner}>
            <Text style={s.paymentReviewBannerTitle}>PARTIALLY REFUNDED</Text>
            <Text style={s.paymentReviewBannerText}>
              A partial refund has been issued on this order. Please contact your sales representative for further assistance.
            </Text>
          </View>
        ) : paymentSummary?.evidencePending ? (
          <View style={s.paymentReviewBanner}>
            <Text style={s.paymentReviewBannerTitle}>PAYMENT UNDER REVIEW — NOT PAID</Text>
            <Text style={s.paymentReviewBannerText}>
              Payment proof has been submitted and is awaiting verification. This invoice is not proof of payment until confirmed by {company.name}.
            </Text>
          </View>
        ) : null}

        {/* ── Bill To / Ship To / Prepared By ── */}
        <View style={s.parties}>
          <View style={s.partyCol}>
            <Text style={s.sectionLabel}>Bill To</Text>
            {customer.name ? <Text style={s.partyName}>{customer.name}</Text> : null}
            {customer.company ? <Text style={s.partyDetail}>{customer.company}</Text> : null}
            {customer.email ? <Text style={s.partyDetail}>{customer.email}</Text> : null}
            {customer.phone ? <Text style={s.partyDetail}>{customer.phone}</Text> : null}
            {!customer.name && !customer.email && !customer.phone ? (
              <Text style={{ fontSize: 10, color: "#bbb" }}>No customer details</Text>
            ) : null}
          </View>
          {singleShipToText ? (
            <View style={s.partyCol}>
              <Text style={s.sectionLabel}>Ship To</Text>
              {(Number(singleShipping?.shipping_amount) || 0) > 0 ? (
                <Text style={s.partyDetail}>
                  Shipping: {formatCurrency(singleShipping!.shipping_amount)}
                </Text>
              ) : null}
              {singleShipToText.split("\n").map((line, i) => (
                <Text key={i} style={s.partyDetail}>{line}</Text>
              ))}
            </View>
          ) : null}
          <View style={s.partyCol}>
            <Text style={s.sectionLabel}>Prepared By</Text>
            <Text style={[s.partyDetail, { fontFamily: "Helvetica-Bold", color: "#333" }]}>{repName}</Text>
            {ticket.title ? (
              <Text style={s.reLine}>
                <Text style={{ color: MUTED }}>Re: </Text>
                {ticket.title}
              </Text>
            ) : null}
          </View>
        </View>

        {multiShipping.length > 0 ? (
          <View style={s.shippingSection}>
            <Text style={s.sectionLabel}>Shipping addresses</Text>
            {shippingDestinationPairs(multiShipping).map((pair, ri) => (
              <View key={ri} style={s.shippingGridRow}>
                {pair.map((row, ci) => (
                  <ShippingDestinationCard key={ci} row={row} />
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Line Items Table ── */}
        {skus.length > 0 ? (
          <View style={{ marginBottom: 4 }}>
            {/* Table header */}
            <View style={s.tableHeader}>
              <Text style={[s.thText, s.colNum]}>#</Text>
              <Text style={[s.thText, s.colProduct]}>Product</Text>
              <Text style={[s.thText, s.colSpec]}>Specification</Text>
              <Text style={[s.thText, s.colQty]}>Qty</Text>
              {!hidePricing && <Text style={[s.thText, s.colUnit]}>Unit Price</Text>}
              {!hidePricing && <Text style={[s.thText, s.colTotal]}>Total</Text>}
            </View>
            {/* Rows */}
            {skus.map((sku, i) => {
              const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
              const specParts = [
                sku.material,
                sku.lamination && sku.lamination !== "None" ? sku.lamination : null,
                sku.color_mode,
                sku.sides,
                sku.roll_direction,
                sku.width && sku.height ? `${sku.width}" × ${sku.height}"` : null,
              ].filter(Boolean).join(" · ");
              const addons = [
                sku.spot_uv && "Spot UV",
                sku.foil && "Foil",
                sku.perforation && "Perforation",
                sku.die_cut && "Die Cut",
                sku.design_required && "Need a design",
              ].filter(Boolean).join(" · ");

              return (
                <View
                  key={i}
                  style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
                >
                  <Text style={[s.tdText, s.colNum, { color: "#bbb", fontSize: 9 }]}>{i + 1}</Text>
                  <View style={s.colProduct}>
                    <Text style={[s.tdText, { fontFamily: "Helvetica-Bold" }]}>
                      {sku.product_type || "—"}
                    </Text>
                    {addons ? <Text style={s.tdSub}>{addons}</Text> : null}
                    {sku.comment ? <Text style={s.tdNote}>{sku.comment}</Text> : null}
                    {(sku.variants ?? []).map((v, vi) => {
                      const fileName = fileLabel(v.file);
                      return (
                        <Text key={vi} style={s.tdSub}>
                          {formatTicketLineVariantLabel(v, vi + 1)}
                          {fileName ? ` · File: ${fileName}` : ""}
                        </Text>
                      );
                    })}
                    {sku.lineFile?.file_name ? (
                      <Text style={s.tdSub}>Line attachment: {sku.lineFile.file_name}</Text>
                    ) : null}
                  </View>
                  <Text style={[s.tdText, s.colSpec, { color: "#666", fontSize: 9 }]}>
                    {specParts || "—"}
                  </Text>
                  <Text style={[s.tdText, s.colQty]}>{sku.quantity ?? "—"}</Text>
                  {!hidePricing && (
                    <Text style={[s.tdText, s.colUnit]}>
                      {sku.unit_price != null ? formatCurrency(sku.unit_price) : "—"}
                    </Text>
                  )}
                  {!hidePricing && (
                    <Text style={[s.tdText, s.colTotal, s.tdBold]}>
                      {lineTotal > 0 ? formatCurrency(lineTotal) : "—"}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ── Pricing Summary ── */}
        {!hidePricing && hidePricingSummary &&
        ticket.refundStatus &&
        (ticket.totalRefundedAmount ?? 0) > 0 ? (
          <View style={s.pricingWrap}>
            <View style={s.pricingBox}>
              <View style={s.totalRow}>
                <Text style={[s.totalLabel, { color: "#D97706", fontSize: 12 }]}>
                  {ticket.refundStatus === "full" ? "Amount Refunded" : "Refunded to Date"}
                </Text>
                <Text style={[s.totalValue, { color: "#D97706", fontSize: 16 }]}>
                  {formatCurrency(ticket.totalRefundedAmount!)}
                </Text>
              </View>
            </View>
          </View>
        ) : (!hidePricing && !hidePricingSummary) ? (
        <View style={s.pricingWrap}>
          <View style={s.pricingBox}>
            {ticket.quoteSubtotal != null ? (
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Subtotal</Text>
                <Text style={s.priceValue}>{formatCurrency(ticket.quoteSubtotal)}</Text>
              </View>
            ) : null}
            {ticket.quoteShipping != null && ticket.quoteShipping > 0 ? (
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Shipping</Text>
                <Text style={s.priceValue}>{formatCurrency(ticket.quoteShipping)}</Text>
              </View>
            ) : null}
            {discountAmt != null && discountAmt > 0 ? (
              <View style={s.priceRow}>
                <Text style={[s.priceLabel, s.priceDanger]}>
                  Discount{ticket.discountReason ? ` (${ticket.discountReason})` : ""}
                </Text>
                <Text style={[s.priceValue, s.priceDanger]}>−{formatCurrency(discountAmt)}</Text>
              </View>
            ) : null}
            {ticket.quotePreTaxTotal != null ? (
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Pre-tax Total</Text>
                <Text style={s.priceValue}>{formatCurrency(ticket.quotePreTaxTotal)}</Text>
              </View>
            ) : null}
            {ticket.taxExempt ? (
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Tax</Text>
                <Text style={s.priceValue}>Exempt</Text>
              </View>
            ) : ticket.quoteTaxAmount != null ? (
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Tax ({ticket.quoteTaxRatePercent ?? 0}%)</Text>
                <Text style={s.priceValue}>{formatCurrency(ticket.quoteTaxAmount)}</Text>
              </View>
            ) : null}
            {/* Total */}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>
                {ticket.quoteFinalTotal != null ? formatCurrency(ticket.quoteFinalTotal) : "—"}
              </Text>
            </View>

            {paymentSummary?.showSchedule ? (
              <View style={s.paymentDivider}>
                {!paymentSummary.depositPaid ? (
                  <>
                    <View style={s.priceRow}>
                      <Text style={[s.priceLabel, s.paymentHighlight]}>Deposit Due Now</Text>
                      <Text style={[s.priceValue, s.paymentHighlightValue]}>
                        {formatCurrency(paymentSummary.depositDue)}
                      </Text>
                    </View>
                    <Text style={s.paymentNote}>Required to begin your order</Text>
                    <View style={[s.priceRow, { marginTop: 6 }]}>
                      <Text style={s.priceLabel}>Balance Remaining</Text>
                      <Text style={s.priceValue}>
                        {formatCurrency(Math.max(0, (ticket.quoteFinalTotal ?? 0) - paymentSummary.depositDue))}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={s.priceRow}>
                      <Text style={[s.priceLabel, s.paymentPaid]}>Deposit Paid</Text>
                      <Text style={[s.priceValue, s.paymentPaid]}>
                        {formatCurrency(paymentSummary.depositPaidAmount)}
                      </Text>
                    </View>
                    <View style={[s.priceRow, { marginTop: 4 }]}>
                      <Text style={[s.priceLabel, s.paymentHighlight]}>Balance Due</Text>
                      <Text style={[s.priceValue, s.paymentHighlightValue]}>
                        {formatCurrency(paymentSummary.balanceDue)}
                      </Text>
                    </View>
                  </>
                )}
                <Text style={[s.paymentNote, { marginTop: 4 }]}>
                  Balance due upon completion / delivery
                </Text>
              </View>
            ) : null}

            {paymentSummary && paymentSummary.strategy === "full" && !paymentSummary.fullyPaid && !paymentSummary.evidencePending && paymentSummary.amountPaid > 0 ? (
              <View style={s.paymentDivider}>
                <View style={s.priceRow}>
                  <Text style={[s.priceLabel, s.paymentPaid]}>Paid</Text>
                  <Text style={[s.priceValue, s.paymentPaid]}>{formatCurrency(paymentSummary.amountPaid)}</Text>
                </View>
                <View style={s.priceRow}>
                  <Text style={[s.priceLabel, s.paymentHighlight]}>Balance Due</Text>
                  <Text style={[s.priceValue, s.paymentHighlightValue]}>{formatCurrency(paymentSummary.balanceDue)}</Text>
                </View>
              </View>
            ) : null}

            {paymentSummary?.evidencePending ? (
              <View style={s.paymentDivider}>
                <View style={s.priceRow}>
                  <Text style={[s.priceLabel, s.paymentReview]}>Amount Submitted</Text>
                  <Text style={[s.priceValue, s.paymentReviewValue]}>
                    {formatCurrency(paymentSummary.submittedAmount ?? 0)}
                  </Text>
                </View>
                <View style={[s.priceRow, { marginTop: 4 }]}>
                  <Text style={[s.priceLabel, s.paymentReview]}>Payment Status</Text>
                  <Text style={[s.priceValue, s.paymentReviewValue]}>Under Review</Text>
                </View>
                <View style={[s.priceRow, { marginTop: 4 }]}>
                  <Text style={[s.priceLabel, s.paymentHighlight]}>
                    {paymentSummary.strategy === "partial" && !paymentSummary.depositPaid ? "Deposit Due" : "Amount Due"}
                  </Text>
                  <Text style={[s.priceValue, s.paymentHighlightValue]}>
                    {formatCurrency(paymentSummary.balanceDue || ticket.quoteFinalTotal || 0)}
                  </Text>
                </View>
                <Text style={[s.paymentNote, { marginTop: 4, color: "#92400E" }]}>
                  Not paid until verified by {company.name}
                </Text>
              </View>
            ) : null}

            {paymentSummary?.fullyPaid && !paymentSummary.evidencePending ? (
              <View style={s.paymentDivider}>
                <View style={s.priceRow}>
                  <Text style={[s.priceLabel, s.paymentPaid]}>Paid in Full</Text>
                  <Text style={[s.priceValue, s.paymentPaid]}>{formatCurrency(paymentSummary.amountPaid)}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
        ) : null}

        {/* ── Details (payment, channel, special requirements) ── */}
        {((!hidePricing && !hidePricingSummary && paymentMethods) || ticket.quoteChannel || ticket.specialRequirements) ? (
          <View style={s.detailsWrap}>
            {!hidePricing && !hidePricingSummary && paymentMethods ? (
              <View style={s.detailBlock}>
                <Text style={s.sectionLabel}>Payment Methods</Text>
                <Text style={s.detailValue}>{paymentMethods}</Text>
              </View>
            ) : null}
            {ticket.quoteChannel && ticket.quoteChannel !== "In-person" ? (
              <View style={s.detailBlock}>
                <Text style={s.sectionLabel}>Delivery Channel</Text>
                <Text style={s.detailValue}>{ticket.quoteChannel}</Text>
              </View>
            ) : null}
            {ticket.specialRequirements ? (
              <View style={s.detailBlockFull}>
                <Text style={s.sectionLabel}>Special Requirements</Text>
                <Text style={s.detailValue}>{ticket.specialRequirements}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {ticket.taxExempt && ticket.taxExemptReviewPending ? (
          <View style={[s.paymentDivider, { marginTop: 8 }]}>
            <Text style={[s.paymentNote, { color: "#92400E" }]}>
              Tax-exempt documentation is pending verification. Totals on this document may change after accountant approval.
            </Text>
          </View>
        ) : null}

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerThanks}>Thank you for your business!</Text>
          {company.website ? (
            <Text style={s.footerWebsite}>{company.website}</Text>
          ) : null}
        </View>

      </Page>
    </Document>
  );
}
