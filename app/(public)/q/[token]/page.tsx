"use client";

import { useEffect, useState, use } from "react";
import { CheckCircle2, AlertCircle, Package, Loader2, Clock, ShieldCheck, Printer } from "lucide-react";
import type { QuoteSku } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicTicket {
  id: string;
  ticket_kind: string;
  ticket_status: string;
  title: string | null;
  reference_code: string | null;
  quote_skus: QuoteSku[];
  quote_subtotal: number | null;
  quote_shipping: number | null;
  discount_type: string | null;
  discount_value: string | null;
  discount_reason: string | null;
  quote_pre_tax_total: number | null;
  quote_tax_rate_percent: number | null;
  quote_tax_amount: number | null;
  quote_final_total: number | null;
  tax_exempt: boolean;
  quote_payment_types: string[];
  prepayment_type: string | null;
  prepayment_value: string | null;
  order_source: string | null;
  special_requirements: string | null;
  rush: boolean;
  client_confirmed: boolean;
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
  customer?: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    email: string | null;
  } | null;
}

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

// ─── Constants ────────────────────────────────────────────────────────────────

const NAVY = "#1B2B4B";
const GOLD = "#E8C97A";
const GOLD_DARK = "#C9A84C";
const BG = "#F0F4FA";
const SURFACE = "#FFFFFF";
const MUTED = "#6B7280";
const TEXT = "#1F2937";
const BORDER = "#E5E7EB";

const PAYMENT_LABELS: Record<string, string> = {
  card_default: "Credit / Debit Card",
  zelle: "Zelle",
  offline: "Cash / Check / Bank Transfer",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function customerName(ticket: PublicTicket): string {
  if (ticket.customer?.first_name || ticket.customer?.last_name) {
    return [ticket.customer.first_name, ticket.customer.last_name].filter(Boolean).join(" ");
  }
  return ticket.contact_name ?? "Valued Customer";
}

function skuSpecs(sku: QuoteSku): string {
  const parts: string[] = [];
  if (sku.material) parts.push(sku.material);
  if (sku.width && sku.height) parts.push(`${sku.width}" × ${sku.height}"`);
  if (sku.color_mode) parts.push(sku.color_mode);
  if (sku.sides) parts.push(sku.sides);
  if (sku.lamination) parts.push(sku.lamination);
  const addons: string[] = [];
  if (sku.spot_uv) addons.push("UV Coating");
  if (sku.foil) addons.push("Foil");
  if (sku.perforation) addons.push("Perforation");
  if (sku.die_cut) addons.push("Die Cut");
  if (addons.length) parts.push(addons.join(", "));
  return parts.join(" · ");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <Loader2 size={32} style={{ color: NAVY, animation: "spin 1s linear infinite" }} />
        <p style={{ color: MUTED, fontSize: 14 }}>Loading your quote…</p>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <AlertCircle size={48} style={{ color: "#DC2626", margin: "0 auto 16px" }} />
        <h1 style={{ fontSize: 20, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Quote Not Found</h1>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
          This link is invalid or has expired. Please contact us directly if you need assistance.
        </p>
      </div>
    </div>
  );
}

function AlreadyConfirmed({ referenceCode, companyName, isOrder }: { referenceCode: string | null; companyName: string; isOrder: boolean }) {
  const label = isOrder ? "Order" : "Quote";
  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 440, background: SURFACE, borderRadius: 16, padding: 40, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <CheckCircle2 size={56} style={{ color: "#16A34A", margin: "0 auto 20px" }} />
        <h1 style={{ fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 8 }}>{label} Confirmed!</h1>
        {referenceCode && (
          <div style={{ display: "inline-block", background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 20px", margin: "8px 0 16px", fontWeight: 600, color: NAVY, fontSize: 15 }}>
            {referenceCode}
          </div>
        )}
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
          Thank you! Your {label.toLowerCase()} has been confirmed and is being processed by <strong style={{ color: TEXT }}>{companyName}</strong>.
          You will be contacted with updates.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedRef, setConfirmedRef] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/quotes/${token}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setTicket(d.ticket);
        setCompany(d.company);
        setLoading(false);
        if (d.ticket?.client_confirmed) {
          setConfirmed(true);
          setConfirmedRef(d.ticket.reference_code);
        }
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  async function handleConfirm() {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/public/quotes/${token}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error ?? "Something went wrong. Please try again or contact us.");
        setConfirming(false);
        return;
      }
      setConfirmed(true);
      setConfirmedRef(data.reference_code);
    } catch {
      setConfirmError("Network error. Please check your connection and try again.");
      setConfirming(false);
    }
  }

  if (loading) return <LoadingSkeleton />;
  if (notFound) return <NotFound />;

  const companyName = company?.company_name ?? "BazaarPrinting";
  const addressParts = [
    company?.address_line1,
    company?.address_line2,
    [company?.city, company?.state, company?.zip].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];

  const isOrder = ticket?.order_source === "direct";
  const isSent = ticket?.ticket_status === "sent";
  const isCancelled = ticket?.ticket_status === "cancelled";

  if (confirmed) {
    return <AlreadyConfirmed referenceCode={confirmedRef} companyName={companyName} isOrder={isOrder ?? false} />;
  }

  const skus = ticket?.quote_skus ?? [];
  const paymentTypes = ticket?.quote_payment_types ?? [];

  const prepay = (() => {
    const type = ticket?.prepayment_type;
    const val = parseFloat(ticket?.prepayment_value ?? "0") || 0;
    const total = ticket?.quote_final_total ?? 0;
    if (!type || type === "full" || val === 0 || total === 0) return null;
    const dueNow = type === "percent"
      ? Math.round(total * (val / 100) * 100) / 100
      : Math.round(Math.min(val, total) * 100) / 100;
    const balance = Math.max(Math.round((total - dueNow) * 100) / 100, 0);
    const label = type === "percent" ? `${val}% deposit` : `${fmt(val)} deposit`;
    return { dueNow, balance, label };
  })();

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          .hide-mobile { display: none !important; }
          .stack-mobile { flex-direction: column !important; }
        }
        @media (min-width: 641px) {
          .hide-desktop { display: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px" }}>

        {/* Header */}
        <div style={{ background: NAVY, borderRadius: "16px 16px 0 0", padding: "28px 32px", textAlign: "center" }}>
          {company?.logo_url ? (
            <img src={company.logo_url} alt={companyName} style={{ height: 44, marginBottom: 8, display: "block", margin: "0 auto 8px" }} />
          ) : (
            <div style={{ fontSize: 20, fontWeight: 600, color: GOLD, letterSpacing: "0.08em", marginBottom: 4 }}>
              {companyName.toUpperCase()}
            </div>
          )}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>PROFESSIONAL PRINTING SERVICES</div>
        </div>

        {/* Body */}
        <div style={{ background: SURFACE, padding: "32px 32px 28px" }}>

          {/* Greeting */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: TEXT }}>
                {isOrder ? "Your Order Details" : "Your Quote is Ready"}
              </h1>
              <a
                href={`/api/public/quotes/${token}/pdf`}
                download
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
                  padding: "6px 14px", borderRadius: 6, border: `1px solid ${BORDER}`,
                  background: SURFACE, color: MUTED, fontSize: 13, fontWeight: 500,
                  textDecoration: "none", whiteSpace: "nowrap",
                }}
              >
                <Printer size={13} />
                Save PDF
              </a>
            </div>
            <p style={{ margin: 0, fontSize: 15, color: MUTED, lineHeight: 1.6 }}>
              Hi <strong style={{ color: TEXT }}>{customerName(ticket!)}</strong>
              {isOrder
                ? ", please review your order details below."
                : ", please review your quote and confirm when ready to proceed."}
            </p>
          </div>

          {/* Status banner */}
          {isCancelled && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={16} style={{ color: "#DC2626", flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: "#DC2626" }}>This quote has been cancelled. Please contact us if you have questions.</span>
            </div>
          )}

          {ticket?.rush && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <Clock size={15} style={{ color: "#D97706", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#92400E", fontWeight: 500 }}>Rush Order</span>
            </div>
          )}

          {/* Reference card */}
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 4 }}>
                {isOrder ? "Order" : "Quote"} Reference
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>
                {ticket?.reference_code ?? ticket?.id?.slice(0, 8).toUpperCase() ?? "—"}
              </div>
              {ticket?.title && (
                <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{ticket.title}</div>
              )}
            </div>
            <div style={{ background: NAVY, color: GOLD, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 14px", borderRadius: 10, whiteSpace: "nowrap" }}>
              {isCancelled ? "Cancelled" : isOrder ? "Order" : "Awaiting Approval"}
            </div>
          </div>

          {/* Line items */}
          {skus.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 10 }}>Line Items</div>

              {/* Desktop table */}
              <div className="hide-mobile" style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: NAVY }}>
                      {["Product", "Qty", "Unit Price", "Total"].map((h, i) => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.65)", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {skus.map((sku, i) => {
                      const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
                      const specs = skuSpecs(sku);
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? SURFACE : "#F9FAFB", borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ fontWeight: 600, color: TEXT }}>{sku.product_type}</div>
                            {specs && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{specs}</div>}
                            {sku.comment && <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic", marginTop: 2 }}>{sku.comment}</div>}
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right", color: TEXT }}>{sku.quantity ?? 0}</td>
                          <td style={{ padding: "12px 16px", textAlign: "right", color: TEXT, whiteSpace: "nowrap" }}>{fmt(sku.unit_price)}</td>
                          <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: TEXT, whiteSpace: "nowrap" }}>{fmt(lineTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="hide-desktop">
                {skus.map((sku, i) => {
                  const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
                  const specs = skuSpecs(sku);
                  return (
                    <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, background: SURFACE }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: TEXT, flex: 1 }}>{sku.product_type}</div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: TEXT, marginLeft: 12, whiteSpace: "nowrap" }}>{fmt(lineTotal)}</div>
                      </div>
                      {specs && <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{specs}</div>}
                      <div style={{ display: "flex", gap: 16, fontSize: 12, color: MUTED }}>
                        <span>Qty: <strong style={{ color: TEXT }}>{sku.quantity ?? 0}</strong></span>
                        <span>Unit: <strong style={{ color: TEXT }}>{fmt(sku.unit_price)}</strong></span>
                      </div>
                      {sku.comment && <div style={{ fontSize: 12, color: MUTED, fontStyle: "italic", marginTop: 6 }}>{sku.comment}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pricing summary */}
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 24px", marginBottom: prepay ? 12 : 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 14 }}>Pricing Summary</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Subtotal", fmt(ticket?.quote_subtotal)],
                ...(ticket?.quote_shipping && ticket.quote_shipping > 0 ? [["Shipping", fmt(ticket.quote_shipping)]] : []),
                ...(ticket?.discount_value && parseFloat(ticket.discount_value) > 0
                  ? [[`Discount${ticket.discount_type === "percent" ? ` (${ticket.discount_value}%)` : ""}`, `− ${fmt(ticket?.quote_subtotal != null && ticket?.quote_pre_tax_total != null ? ticket.quote_subtotal - ticket.quote_pre_tax_total + (ticket.quote_shipping ?? 0) : null)}`]]
                  : []),
                ...(ticket?.quote_tax_rate_percent && ticket.quote_tax_rate_percent > 0 && !ticket.tax_exempt
                  ? [[`Tax (${ticket.quote_tax_rate_percent}%)`, fmt(ticket.quote_tax_amount)]]
                  : []),
                ...(ticket?.tax_exempt ? [["Tax", "Exempt"]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: MUTED }}>
                  <span>{label}</span><span style={{ color: TEXT }}>{value}</span>
                </div>
              ))}
              <div style={{ borderTop: `2px solid ${BORDER}`, paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>Order Total</span>
                <span style={{ fontSize: 22, fontWeight: 600, color: GOLD_DARK }}>{fmt(ticket?.quote_final_total)}</span>
              </div>
            </div>
          </div>

          {/* Payment breakdown — only for partial prepayment */}
          {prepay && (
            <div style={{ border: `2px solid ${GOLD}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
              {/* Header */}
              <div style={{ background: NAVY, padding: "10px 20px" }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: GOLD }}>
                  Payment Schedule — {prepay.label}
                </span>
              </div>
              {/* Rows */}
              <div style={{ background: SURFACE, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Due Now */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "12px 16px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>Deposit Due Now</div>
                    <div style={{ fontSize: 12, color: "#A16207", marginTop: 2 }}>Required to begin your order</div>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 600, color: "#92400E" }}>{fmt(prepay.dueNow)}</span>
                </div>
                {/* Balance */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 4px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: MUTED }}>Balance Remaining</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Due upon completion / delivery</div>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>{fmt(prepay.balance)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Payment methods */}
          {paymentTypes.length > 0 && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "14px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#15803D", marginBottom: 6 }}>
                <ShieldCheck size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Accepted Payment Methods
              </div>
              <div style={{ fontSize: 14, color: TEXT }}>
                {paymentTypes.map((k) => PAYMENT_LABELS[k] ?? k).join(" · ")}
              </div>
            </div>
          )}

          {/* Special requirements */}
          {ticket?.special_requirements && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "14px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#92400E", marginBottom: 6 }}>Special Requirements</div>
              <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.6 }}>{ticket.special_requirements}</div>
            </div>
          )}

          {/* CTA — only for "sent" tickets */}
          {isSent && !isCancelled && (
            <div style={{ marginTop: 8 }}>
              {confirmError && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                  <AlertCircle size={15} style={{ color: "#DC2626", flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: "#DC2626" }}>{confirmError}</span>
                </div>
              )}
              <button
                onClick={handleConfirm}
                disabled={confirming}
                style={{
                  width: "100%",
                  padding: "16px 24px",
                  background: confirming ? "#C9A84C" : GOLD,
                  color: NAVY,
                  border: "none",
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: confirming ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transition: "opacity 0.15s",
                }}
              >
                {confirming ? (
                  <>
                    <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                    Confirming…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    {isOrder ? "Confirm & Accept Order" : "Confirm & Accept Quote"}
                  </>
                )}
              </button>
              <p style={{ margin: "12px 0 0", fontSize: 12, color: MUTED, textAlign: "center", lineHeight: 1.5 }}>
                By confirming, you agree to proceed with this {isOrder ? "order" : "quote"} from {companyName}.
                A representative will follow up with next steps.
              </p>
            </div>
          )}

          {!isSent && !isCancelled && !confirmed && (
            <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
              <Package size={20} style={{ color: MUTED, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
                This {isOrder ? "order" : "quote"} is being processed. Contact us if you have any questions.
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ background: NAVY, borderRadius: "0 0 16px 16px", padding: "24px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: GOLD, marginBottom: 8 }}>{companyName}</div>
          {addressParts.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>{line}</div>
          ))}
          {company?.phone && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>Tel: {company.phone}</div>}
          {company?.email && (
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <a href={`mailto:${company.email}`} style={{ color: GOLD, textDecoration: "none" }}>{company.email}</a>
            </div>
          )}
          {company?.website && (
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <a href={company.website} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>{company.website}</a>
            </div>
          )}
          <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            Powered by BazaarPrinting CRM
          </div>
        </div>

      </div>
    </div>
  );
}
