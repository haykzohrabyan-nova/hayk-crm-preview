"use client";

import { Fragment } from "react";
import { formatCurrency, formatDateLong } from "@/lib/utils/format";
import { Printer } from "lucide-react";
import type { TicketLineDisplayRow } from "@/lib/utils/ticket-line-items";
import { PublicLineItemSkusGrid, publicSkuGridItems } from "@/components/public/public-line-item-skus-grid";
import type { InvoicePaymentSummary } from "@/lib/utils/invoice-payment-summary";
import { AddressMapLink } from "@/components/public/address-map-link";
import { publicContactLinkStyle } from "@/lib/utils/maps-link";
import {
  PublicShippingAddressSingle,
  PublicShippingAddressesList,
  publicShippingDestinationRows,
} from "@/components/public/public-shipping-addresses";
import type { TicketShippingDestinationRow } from "@/lib/utils/ticket-shipping-destinations";

const NAVY    = "#1B2B4B";
const MUTED   = "#6B7280";
const TEXT    = "#1F2937";
const BORDER  = "#E5E7EB";
const SURFACE = "#FFFFFF";

interface PublicCompany {
  company_name?: string | null;
  logo_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

interface PublicTicketDoc {
  title: string | null;
  reference_code: string | null;
  created_at?: string | null;
  due_date?: string | null;
  priority?: string | null;
  rush: boolean;
  quote_channel?: string | null;
  quote_subtotal: number | null;
  quote_shipping: number | null;
  requires_shipping?: boolean;
  ship_to_line1?: string | null;
  ship_to_line2?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  ship_to_zip?: string | null;
  shipping_destinations?: TicketShippingDestinationRow[];
  discount_reason?: string | null;
  quote_pre_tax_total: number | null;
  quote_tax_rate_percent: number | null;
  quote_tax_amount: number | null;
  quote_final_total: number | null;
  tax_exempt: boolean;
  tax_exempt_review_pending?: boolean;
  refund_status?: string | null;
  total_refunded_amount?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_company?: string | null;
  line_items: TicketLineDisplayRow[];
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}

const fmt = formatCurrency;

const fmtDocDate = formatDateLong;

function customerDisplayName(ticket: PublicTicketDoc): string {
  if (ticket.customer?.first_name || ticket.customer?.last_name) {
    return [ticket.customer.first_name, ticket.customer.last_name].filter(Boolean).join(" ");
  }
  return ticket.contact_name ?? "";
}

function skuSpecification(sku: TicketLineDisplayRow): string {
  const parts = [
    sku.material,
    sku.lamination && sku.lamination !== "None" ? sku.lamination : null,
    sku.color_mode,
    sku.sides,
    sku.roll_direction,
    sku.width && sku.height ? `${sku.width}" × ${sku.height}"` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

function skuAddons(sku: TicketLineDisplayRow): string {
  return [
    sku.spot_uv && "Spot UV",
    sku.foil && "Foil",
    sku.perforation && "Perforation",
    sku.die_cut && "Die Cut",
    sku.design_required && "Need a design",
  ].filter(Boolean).join(" · ");
}

function discountAmount(ticket: PublicTicketDoc): number | null {
  if (ticket.quote_subtotal == null || ticket.quote_pre_tax_total == null) return null;
  const ship = ticket.quote_shipping ?? 0;
  const amt = ticket.quote_subtotal + ship - ticket.quote_pre_tax_total;
  return amt > 0 ? amt : null;
}

export function PublicQuoteDocument({
  company,
  ticket,
  token,
  isOrder,
  isCancelled = false,
  isRefunded = false,
  refundStatus,
  refCode,
  paymentSummary,
}: {
  company: PublicCompany;
  ticket: PublicTicketDoc;
  token: string;
  isOrder: boolean;
  isCancelled?: boolean;
  isRefunded?: boolean;
  refundStatus?: string | null;
  refCode: string;
  paymentSummary: InvoicePaymentSummary;
}) {
  const companyName = company.company_name ?? "BazaarPrinting";

  const skus = ticket.line_items ?? [];
  const disc = discountAmount(ticket);
  const custName = customerDisplayName(ticket);
  const custCompany = ticket.customer?.company ?? ticket.contact_company ?? "";
  const custEmail = ticket.customer?.email ?? ticket.contact_email ?? "";
  const custPhone = ticket.customer?.phone ?? "";
  const shippingRows = publicShippingDestinationRows(ticket);
  const singleShippingRow = shippingRows.length === 1 ? shippingRows[0] : null;
  const docType = isOrder ? "INVOICE" : "QUOTE";

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20,
        paddingBottom: 20, marginBottom: 24, borderBottom: `2px solid ${NAVY}`,
        flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {company.logo_url ? (
            <img src={company.logo_url} alt={companyName} style={{ height: 48, marginBottom: 8, display: "block" }} />
          ) : (
            <div style={{ fontSize: 18, fontWeight: 600, color: NAVY, letterSpacing: "0.08em", marginBottom: 8 }}>
              {companyName.toUpperCase()}
            </div>
          )}
          <AddressMapLink
            company={company}
            lineStyle={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}
          />
          {company.phone && (
            <a href={`tel:${String(company.phone).replace(/\s/g, "")}`} style={{ ...publicContactLinkStyle, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              {company.phone}
            </a>
          )}
          {company.email && (
            <a href={`mailto:${company.email}`} style={{ ...publicContactLinkStyle, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              {company.email}
            </a>
          )}
          {company.website && (
            <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" style={{ ...publicContactLinkStyle, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              {company.website}
            </a>
          )}
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 28, fontWeight: 600, color: NAVY, letterSpacing: "0.04em" }}>{docType}</span>
          </div>
          <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.8 }}>
            <div><span style={{ color: MUTED }}>Ref: </span><strong>{refCode}</strong></div>
            <div><span style={{ color: MUTED }}>Date: </span>{fmtDocDate(ticket.created_at)}</div>
            {ticket.due_date && <div><span style={{ color: MUTED }}>Due: </span>{fmtDocDate(ticket.due_date)}</div>}
            {ticket.priority && ticket.priority !== "Normal" && (
              <div><span style={{ color: MUTED }}>Priority: </span>{ticket.priority}</div>
            )}
          </div>
        </div>
      </div>

      <div className="stack-mobile" style={{ display: "flex", gap: 24, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, marginBottom: 8 }}>
            Bill To
          </div>
          {custName && <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, marginBottom: 4 }}>{custName}</div>}
          {custCompany && <div style={{ fontSize: 13, color: TEXT, marginBottom: 2 }}>{custCompany}</div>}
          {custEmail && <div style={{ fontSize: 13, color: MUTED }}>{custEmail}</div>}
          {custPhone && <div style={{ fontSize: 13, color: MUTED }}>{custPhone}</div>}
        </div>
        {singleShippingRow ? <PublicShippingAddressSingle row={singleShippingRow} /> : null}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, marginBottom: 8 }}>
            Quote Details
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 4 }}>
            {isOrder ? "Order created" : "Quote created"}: <strong style={{ color: TEXT }}>{fmtDocDate(ticket.created_at)}</strong>
          </div>
          {ticket.title && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
              Re: <span style={{ color: TEXT }}>{ticket.title}</span>
            </div>
          )}
          <a
            href={`/api/public/quotes/${token}/pdf`}
            download
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 6, background: NAVY, color: "#E8C97A",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
            }}
          >
            <Printer size={14} />
            Download PDF
          </a>
        </div>
      </div>

      {shippingRows.length > 1 ? <PublicShippingAddressesList rows={shippingRows} /> : null}

      {skus.length > 0 && (
        <div style={{ marginBottom: 20, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          <div className="hide-mobile" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8F9FA", borderBottom: `1px solid ${BORDER}` }}>
                  {["#", "Product", "Specification", "Qty", "Unit Price", "Total"].map((h, i) => (
                    <th key={h} style={{
                      padding: "8px 12px", textAlign: i >= 3 ? "right" : "left",
                      fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: MUTED,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skus.map((sku, i) => {
                  const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
                  const addons = skuAddons(sku);
                  const skuGridItems = publicSkuGridItems(sku);
                  return (
                    <Fragment key={i}>
                      <tr style={{ background: i % 2 === 1 ? "#FAFAFA" : SURFACE, borderTop: "1px solid #F0F0F0" }}>
                        <td style={{ padding: "10px 12px", color: "#bbb", fontSize: 12 }}>{i + 1}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 600, color: NAVY }}>{sku.product_type}</div>
                          {addons && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{addons}</div>}
                          {sku.comment && <div style={{ fontSize: 11, color: "#aaa", fontStyle: "italic", marginTop: 2 }}>{sku.comment}</div>}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: "#666" }}>{skuSpecification(sku)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{sku.quantity ?? "—"}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>{fmt(sku.unit_price)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: NAVY, whiteSpace: "nowrap" }}>{fmt(lineTotal)}</td>
                      </tr>
                      {skuGridItems.length > 0 && (
                        <tr key={`${i}-skus`} style={{ background: i % 2 === 1 ? "#FAFAFA" : SURFACE }}>
                          <td colSpan={6} style={{ padding: "0 12px 12px" }}>
                            <PublicLineItemSkusGrid token={token} items={skuGridItems} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="hide-desktop" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {skus.map((sku, i) => {
              const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
              const skuGridItems = publicSkuGridItems(sku);
              return (
                <div key={i} style={{ padding: 12, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <strong style={{ color: NAVY }}>{i + 1}. {sku.product_type}</strong>
                    <strong>{fmt(lineTotal)}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: MUTED }}>{skuSpecification(sku)}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Qty {sku.quantity} · Unit {fmt(sku.unit_price)}</div>
                  {skuGridItems.length > 0 && (
                    <PublicLineItemSkusGrid token={token} items={skuGridItems} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isRefunded && (ticket.total_refunded_amount ?? 0) > 0 ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <div style={{ width: "100%", maxWidth: 280, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0",
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#D97706" }}>
                {refundStatus === "full" ? "Amount Refunded" : "Refunded to Date"}
              </span>
              <span style={{ fontSize: 18, fontWeight: 600, color: "#D97706" }}>
                {fmt(ticket.total_refunded_amount)}
              </span>
            </div>
            {refundStatus === "partial" ? (
              <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                A partial refund has been issued on this order.
              </p>
            ) : null}
          </div>
        </div>
      ) : isCancelled && !isRefunded ? null : (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <div style={{ width: "100%", maxWidth: 280, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
          {[
            ["Subtotal", fmt(ticket.quote_subtotal), false],
            ...(ticket.quote_shipping && ticket.quote_shipping > 0 ? [["Shipping", fmt(ticket.quote_shipping), false]] : []),
            ...(disc && disc > 0 ? [[`Discount${ticket.discount_reason ? ` (${ticket.discount_reason})` : ""}`, `−${fmt(disc)}`, true]] : []),
            ...(ticket.quote_pre_tax_total != null ? [["Pre-tax Total", fmt(ticket.quote_pre_tax_total), false]] : []),
            ...(ticket.tax_exempt ? [["Tax", "Exempt", false]] :
              ticket.quote_tax_amount != null ? [[`Tax (${ticket.quote_tax_rate_percent ?? 0}%)`, fmt(ticket.quote_tax_amount), false]] : []),
          ].map(([label, value, danger]) => (
            <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13 }}>
              <span style={{ color: MUTED }}>{label}</span>
              <span style={{ color: danger ? "#DC2626" : TEXT }}>{value}</span>
            </div>
          ))}

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingTop: 10, marginTop: 6, borderTop: `2px solid ${NAVY}`,
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>Total</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: NAVY }}>{fmt(ticket.quote_final_total)}</span>
          </div>

          {paymentSummary.showSchedule && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              {!paymentSummary.depositPaid ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>Deposit Due Now</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>{fmt(paymentSummary.depositDue)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>Required to begin your order</div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px" }}>
                    <span style={{ fontSize: 13, color: MUTED }}>Balance Remaining</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                      {fmt(Math.max(0, (ticket.quote_final_total ?? 0) - paymentSummary.depositDue))}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 13, color: "#16A34A" }}>Deposit Paid</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#16A34A" }}>{fmt(paymentSummary.depositPaidAmount)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 2px" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>Balance Due</span>
                    <span style={{ fontSize: 20, fontWeight: 600, color: "#92400E" }}>{fmt(paymentSummary.balanceDue)}</span>
                  </div>
                </>
              )}
              <div style={{ fontSize: 11, color: MUTED, fontStyle: "italic", marginTop: 4 }}>
                Balance due upon completion / delivery
              </div>
            </div>
          )}

          {ticket.tax_exempt_review_pending && (
            <div style={{
              marginTop: 12, marginBottom: 4, padding: "10px 12px",
              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#92400E", marginBottom: 4, letterSpacing: "0.04em" }}>
                TAX-EXEMPT DOCUMENTATION UNDER REVIEW
              </div>
              <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
                Your sales permit is being verified. Totals on this document may change after approval. You may still confirm or pay; final tax-exempt pricing applies once approved.
              </div>
            </div>
          )}

          {!isCancelled && !isRefunded && paymentSummary.evidencePending && (
            <div style={{
              marginTop: 12, marginBottom: 4, padding: "10px 12px",
              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#92400E", marginBottom: 4, letterSpacing: "0.04em" }}>
                PAYMENT UNDER REVIEW — NOT PAID
              </div>
              <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
                Payment proof submitted — awaiting verification. This document is not proof of payment until confirmed.
              </div>
            </div>
          )}

          {!isCancelled && !isRefunded && paymentSummary.evidencePending && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>Amount Submitted</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>{fmt(paymentSummary.submittedAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>Payment Status</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>Under Review</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 2px" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>
                  {paymentSummary.strategy === "partial" && !paymentSummary.depositPaid ? "Deposit Due" : "Amount Due"}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#92400E" }}>
                  {fmt(paymentSummary.balanceDue || ticket.quote_final_total)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#92400E", fontStyle: "italic", marginTop: 4 }}>
                Not paid until verified by our team
              </div>
            </div>
          )}

          {paymentSummary.fullyPaid && !paymentSummary.evidencePending && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#16A34A" }}>Paid in Full</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#16A34A" }}>{fmt(paymentSummary.amountPaid)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {ticket.quote_channel && ticket.quote_channel !== "In-person" && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 20, paddingTop: 16,
          borderTop: `1px solid ${BORDER}`, marginBottom: 8,
        }}>
          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, marginBottom: 4 }}>
              Delivery Channel
            </div>
            <div style={{ fontSize: 13, color: TEXT }}>{ticket.quote_channel}</div>
          </div>
        </div>
      )}
    </div>
  );
}
