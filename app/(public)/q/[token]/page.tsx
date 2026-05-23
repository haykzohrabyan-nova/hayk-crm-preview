"use client";

import { useEffect, useState, use, useRef } from "react";
import {
  CheckCircle2, AlertCircle, Package, Loader2,
  Copy, Check, Upload, X, Clock,
} from "lucide-react";
import type { QuoteSku } from "@/lib/types";
import { PublicQuoteDocument } from "@/components/public/public-quote-document";
import { AddressMapLink, AddressMapText } from "@/components/public/address-map-link";
import { computeInvoicePaymentSummary } from "@/lib/utils/invoice-payment-summary";
import { companyAddressFull, mapLinkStyle } from "@/lib/utils/maps-link";
import { digitsOnly } from "@/lib/utils/phone";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicTicket {
  id: string;
  ticket_kind: string;
  ticket_status: string;
  title: string | null;
  reference_code: string | null;
  created_at?: string | null;
  due_date?: string | null;
  priority?: string | null;
  quote_channel?: string | null;
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
  special_requirements: string | null;
  rush: boolean;
  client_confirmed: boolean;
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
  order_source: string | null;
  payment_evidence_url: string | null;
  payment_evidence_submitted_at: string | null;
  payment_evidence_amount: number | null;
  payment_amount_received: number | null;
  payment_paid_at: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  // Per-ticket payment config
  ticket_payment_strategy: "full" | "partial" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  ticket_dep_handling: "cash" | "gateway" | null;
  ticket_partial_channels: string[] | null;
  ticket_full_channels: string[] | null;
  ticket_require_client_confirm: boolean | null;
  ticket_net_terms_label: string | null;
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
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_routing_number?: string | null;
  zelle_phone?: string | null;
  zelle_email?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NAVY    = "#1B2B4B";
const GOLD    = "#E8C97A";
const GOLD_DK = "#C9A84C";
const BG      = "#F0F4FA";
const SURFACE = "#FFFFFF";
const MUTED   = "#6B7280";
const TEXT    = "#1F2937";
const BORDER  = "#E5E7EB";

const CHANNEL_LABELS: Record<string, string> = {
  wire:    "Wire Transfer",
  ach:     "ACH / Bank Transfer",
  zelle:   "Zelle",
  check:   "Check",
  card:    "Credit / Debit Card",
  cash:    "Cash (In Person)",
  offline: "Offline / In-Person",
  other:   "Other",
};

// Channels where customer uploads a payment confirmation screenshot
// Card is excluded — raw card data must not be collected or stored (PCI compliance)
const EVIDENCE_CHANNELS = new Set(["wire", "ach", "zelle", "check"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function getChannels(ticket: PublicTicket): string[] {
  const strategy = ticket.ticket_payment_strategy ?? "full";
  if (strategy === "net") return [];
  if (strategy === "partial") {
    return ticket.ticket_partial_channels ?? ticket.ticket_full_channels ?? [];
  }
  // Full strategy — try full_channels first, fall back to partial as legacy safety net
  return ticket.ticket_full_channels ?? ticket.ticket_partial_channels ?? [];
}

function computeDepositDue(ticket: PublicTicket): number {
  const total    = Number(ticket.quote_final_total ?? 0);
  const strategy = ticket.ticket_payment_strategy ?? "full";
  if (strategy === "net") return 0;
  if (strategy === "partial") {
    const depType  = ticket.ticket_deposit_type ?? "percent";
    const depValue = ticket.ticket_deposit_value ?? 0;
    return depType === "percent"
      ? Math.round(total * (depValue / 100) * 100) / 100
      : Math.round(Math.min(depValue, total) * 100) / 100;
  }
  return total;
}

function computeAmountPaid(ticket: PublicTicket): number {
  return Math.round(Number(ticket.payment_amount_received ?? ticket.deposit_amount ?? 0) * 100) / 100;
}

function isDepositPaid(ticket: PublicTicket, depositDue: number, amountPaid: number): boolean {
  const strategy = ticket.ticket_payment_strategy ?? "full";
  if (strategy !== "partial") return false;
  return !!ticket.deposit_paid_at || amountPaid >= depositDue - 0.01;
}

// ─── Portal phase — one link, UI adapts to what the customer needs next ────────

type PortalPhase =
  | "needs_confirm"
  | "needs_payment"
  | "evidence_pending"
  | "balance_due"
  | "fully_paid"
  | "net_terms"
  | "order_ready";

interface PortalState {
  phase: PortalPhase;
  total: number;
  depositDue: number;
  amountPaid: number;
  remaining: number;
  depositPaid: boolean;
  fullyPaid: boolean;
  isInProduction: boolean;
  isCompleted: boolean;
  isConfirmed: boolean;
  requireConfirm: boolean;
  evidencePending: boolean;
  payAmount: number;
  payLabel: string;
  payButtonText: string;
  checklistTitle: string;
  actionTitle: string;
  actionSubtitle: string;
}

function computePortalState(ticket: PublicTicket, isConfirmedOverride?: boolean): PortalState {
  const strategy       = ticket.ticket_payment_strategy ?? "full";
  const status         = ticket.ticket_status;
  const total          = Number(ticket.quote_final_total ?? 0);
  const depositDue     = computeDepositDue(ticket);
  const amountPaid     = computeAmountPaid(ticket);
  const remaining      = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
  const depositPaid    = isDepositPaid(ticket, depositDue, amountPaid);
  const isCompleted    = status === "completed";
  const isInProduction = status === "in_production";
  const requireConfirm = ticket.ticket_require_client_confirm ?? true;
  const channels       = getChannels(ticket);
  const isPartialCash  = strategy === "partial" && ticket.ticket_dep_handling === "cash";
  const isCashOnly     = strategy === "full" && channels.length === 1 && channels[0] === "cash";
  const isConfirmed    = isConfirmedOverride ?? ticket.client_confirmed ?? false;
  const confirmed      = isConfirmed || !requireConfirm || isCashOnly || isPartialCash;

  const evidencePending =
    !!ticket.payment_evidence_submitted_at &&
    !!ticket.payment_evidence_url &&
    !ticket.payment_paid_at &&
    strategy !== "net";

  const fullyPaid =
    !!ticket.payment_paid_at ||
    (total > 0 && amountPaid >= total - 0.01 && !evidencePending);

  let phase: PortalPhase = "needs_payment";
  if (isCompleted) phase = "order_ready";
  else if (fullyPaid) phase = "fully_paid";
  else if (evidencePending) phase = "evidence_pending";
  else if ((depositPaid || isInProduction) && remaining > 0.01) phase = "balance_due";
  else if (!confirmed && requireConfirm && !isPartialCash && !isCashOnly) phase = "needs_confirm";
  else if (strategy === "net") phase = "net_terms";

  const payAmount = !depositPaid && strategy === "partial"
    ? Math.max(0, depositDue - amountPaid)
    : remaining;

  const payLabel = phase === "balance_due" || depositPaid ? "Balance remaining" : "Amount due";
  const payButtonText =
    phase === "balance_due" ? "Pay remaining balance"
    : strategy === "partial" ? "Pay deposit now"
    : "Pay in full";

  const checklistTitle = phase === "order_ready"
    ? "Your Order Status"
    : phase === "balance_due" || isInProduction
      ? "Your Order Status"
      : "To Start Production Checklist";

  const actionCopy: Record<PortalPhase, { title: string; subtitle: string }> = {
    needs_confirm: {
      title: "Confirm your quote",
      subtitle: "Review the details below and confirm when you're ready to proceed.",
    },
    needs_payment: {
      title: strategy === "partial" ? "Pay your deposit" : "Complete your payment",
      subtitle: strategy === "partial"
        ? `A deposit of ${fmt(depositDue)} is required before we can start production.`
        : `Full payment of ${fmt(total)} is required before we can start production.`,
    },
    evidence_pending: {
      title: "Payment under review",
      subtitle: "We've received your payment proof. Our team is validating it — you'll receive an email once confirmed, and this page will update when your order enters production.",
    },
    balance_due: {
      title: "Pay your remaining balance",
      subtitle: isInProduction
        ? `Your order is in production. You've paid ${fmt(amountPaid)} — ${fmt(remaining)} remains due upon completion / delivery. Pay now if you'd like.`
        : `You've paid ${fmt(amountPaid)} so far. The remaining ${fmt(remaining)} is due upon completion / delivery — pay now if you'd like.`,
    },
    fully_paid: {
      title: isInProduction ? "Order in production" : "Payment complete",
      subtitle: isInProduction
        ? "Your order is paid in full and currently in production. We'll be in touch with updates."
        : "Thank you — your order is fully paid.",
    },
    net_terms: {
      title: isInProduction ? "Order in production" : "Net terms order",
      subtitle: isInProduction
        ? `No upfront payment was required. Payment is due under ${ticket.ticket_net_terms_label?.replace("-", " ") ?? "your net terms"} — you may pay early below if you prefer.`
        : "No upfront payment is required. Production begins once your quote is confirmed.",
    },
    order_ready: {
      title: "Your order is ready for pickup",
      subtitle: "Your order is complete. Visit our print shop to pick it up — pickup details are shown below.",
    },
  };

  const { title: actionTitle, subtitle: actionSubtitle } = actionCopy[phase];

  return {
    phase, total, depositDue, amountPaid, remaining, depositPaid, fullyPaid,
    isInProduction, isCompleted, isConfirmed: confirmed, requireConfirm, evidencePending,
    payAmount, payLabel, payButtonText, checklistTitle, actionTitle, actionSubtitle,
  };
}

function portalGreetingSubtitle(portal: PortalState): string {
  switch (portal.phase) {
    case "needs_confirm":
      return ", please review your quote and confirm when ready to proceed.";
    case "needs_payment":
      return ", complete the steps below to start production.";
    case "evidence_pending":
      return ", we're reviewing your payment confirmation.";
    case "balance_due":
      return portal.isInProduction
        ? ", your order is in production. You can pay your remaining balance below anytime."
        : ", your deposit is received. Pay the remaining balance below whenever you're ready.";
    case "fully_paid":
      return portal.isInProduction
        ? ", your order is in production and paid in full."
        : ", thank you — your order is fully paid.";
    case "net_terms":
      return ", your order is on net terms — no upfront payment required.";
    case "order_ready":
      return ", your order is complete and ready for pickup at our print shop.";
    default:
      return ".";
  }
}

function PayStep({
  num, title, desc, last = false, children,
}: {
  num: number;
  title: string;
  desc?: string;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", gap: 14,
      paddingBottom: last ? 0 : 20,
      marginBottom: last ? 0 : 20,
      borderBottom: last ? "none" : `1px solid ${BORDER}`,
    }}>
      {/* Numbered circle */}
      <div style={{
        flexShrink: 0, width: 26, height: 26, borderRadius: "50%",
        background: NAVY, color: GOLD,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, marginTop: 1,
      }}>
        {num}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: desc ? 6 : 0 }}>{title}</div>
        {desc && <p style={{ margin: "0 0 10px", fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{desc}</p>}
        {children}
      </div>
    </div>
  );
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

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy"
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 4, border: `1px solid ${BORDER}`,
        background: copied ? "#F0FDF4" : SURFACE, color: copied ? "#16A34A" : MUTED,
        fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
        transition: "all 0.15s",
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${BORDER}`, gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{value}</span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

// ─── Payment instruction panels (one per channel) ─────────────────────────────
// Each panel is wrapped in a numbered PayStep list matching shadow app structure.

interface PanelProps {
  company: PublicCompany;
  refCode: string | null;
  channel?: string;
  evidenceFile: File | null;
  onEvidenceChange: (f: File | null) => void;
}

function WireAchPanel({ company, channel, evidenceFile, onEvidenceChange }: PanelProps) {
  const label = channel === "wire" ? "Wire Transfer" : "ACH / Bank Transfer";
  return (
    <div>
      <PayStep
        num={1}
        title={`Send payment via ${label}`}
        desc={`Use the company account below. Send the amount shown above, then complete step 2.`}
      >
        <div>
          {company.bank_name           && <InfoRow label="Bank"           value={company.bank_name} />}
          {company.bank_account_name   && <InfoRow label="Account name"   value={company.bank_account_name} />}
          {company.bank_account_number && <InfoRow label="Account number" value={company.bank_account_number} />}
          {company.bank_routing_number && <InfoRow label="Routing number" value={company.bank_routing_number} />}
        </div>
      </PayStep>
      <PayStep
        num={2}
        title="Upload payment confirmation screenshot"
        desc={`Take a screenshot of your bank app or ${label.toLowerCase()} confirmation showing the amount, date, and account details.`}
        last
      >
        <FileUpload file={evidenceFile} onChange={onEvidenceChange} label="Payment confirmation" />
      </PayStep>
    </div>
  );
}

function ZellePanel({ company, refCode, evidenceFile, onEvidenceChange }: PanelProps) {
  return (
    <div>
      <PayStep
        num={1}
        title="Send payment via Zelle"
        desc="Send the amount above to the contact below. Copy the quote number into the Zelle memo / note field."
      >
        <div>
          {company.zelle_phone && <InfoRow label="Zelle phone" value={company.zelle_phone} />}
          {company.zelle_email && <InfoRow label="Zelle email" value={company.zelle_email} />}
          {refCode && <InfoRow label="Unique quote number (memo)" value={refCode} />}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: MUTED, lineHeight: 1.4 }}>
          Include the quote number exactly as shown so we can match your payment.
        </p>
      </PayStep>
      <PayStep
        num={2}
        title="Upload payment confirmation screenshot"
        desc="After sending, screenshot your Zelle confirmation showing the amount and memo with the quote number."
        last
      >
        <FileUpload file={evidenceFile} onChange={onEvidenceChange} label="Payment confirmation" />
      </PayStep>
    </div>
  );
}

function CheckPanel({ company, evidenceFile, onEvidenceChange }: PanelProps) {
  const payableTo = company.company_name ?? "Bazaar Printing";
  return (
    <div>
      <PayStep
        num={1}
        title="Send your check"
        desc={`Make check payable to ${payableTo}. Mail or deliver the check, then complete step 2.`}
      />
      <PayStep
        num={2}
        title="Upload payment confirmation"
        desc="Attach a photo of the check or your bank deposit confirmation once the check has been sent or deposited."
        last
      >
        <FileUpload file={evidenceFile} onChange={onEvidenceChange} label="Check or deposit confirmation" />
      </PayStep>
    </div>
  );
}

function CashPanel({ refCode, receiptId, onReceiptChange }: {
  refCode: string | null;
  receiptId: string;
  onReceiptChange: (v: string) => void;
}) {
  return (
    <div>
      <PayStep num={1} title="Record receipt" last>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
          Pay in person at our location.
          {refCode && <> Bring your order reference: <strong style={{ color: TEXT }}>{refCode}</strong>.</>}
          {" "}Our staff will provide a receipt ID when you pay.
        </p>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Receipt ID <span style={{ color: "#DC2626" }}>— required</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={receiptId}
            onChange={(e) => onReceiptChange(digitsOnly(e.target.value))}
            placeholder="e.g. 10482"
            style={{ width: "100%", padding: "10px 14px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, color: TEXT, background: SURFACE, outline: "none" }}
          />
        </div>
      </PayStep>
    </div>
  );
}

function CardContactPanel({ company }: { company: PublicCompany }) {
  return (
    <div style={{ padding: "14px 18px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#1E3A5F" }}>
        Card payments are processed in person
      </p>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#3B82F6", lineHeight: 1.5 }}>
        Please contact us directly to arrange a card payment.
      </p>
      {company.phone && (
        <div style={{ fontSize: 13, color: "#1E3A5F", marginBottom: 4 }}>
          Tel: <strong>{company.phone}</strong>
        </div>
      )}
      {company.email && (
        <div style={{ fontSize: 13 }}>
          <a href={`mailto:${company.email}`} style={{ color: "#2563EB", textDecoration: "none" }}>{company.email}</a>
        </div>
      )}
    </div>
  );
}

// ─── File upload widget ───────────────────────────────────────────────────────

function FileUpload({
  file, onChange, label,
}: { file: File | null; onChange: (f: File | null) => void; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onChange(files[0]);
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      {file ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1px solid #BBF7D0`, borderRadius: 8, background: "#F0FDF4" }}>
          <CheckCircle2 size={16} style={{ color: "#16A34A", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
          <span style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>{(file.size / 1024).toFixed(0)} KB</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, display: "flex", padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          style={{
            border: `2px dashed ${dragOver ? GOLD_DK : BORDER}`,
            borderRadius: 8, padding: "20px 16px", textAlign: "center", cursor: "pointer",
            background: dragOver ? "#FFFBEB" : BG, transition: "all 0.15s",
          }}
        >
          <Upload size={20} style={{ color: dragOver ? GOLD_DK : MUTED, marginBottom: 6 }} />
          <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
            <span style={{ fontWeight: 600, color: dragOver ? GOLD_DK : TEXT }}>Click to upload</span> or drag &amp; drop
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: MUTED }}>JPEG, PNG, WEBP, HEIC or PDF — up to 10 MB</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

// ─── Shared payment modal (deposit or balance) ────────────────────────────────

interface PublicPayModalProps {
  open: boolean;
  onClose: () => void;
  ticket: PublicTicket;
  company: PublicCompany;
  token: string;
  dueAmount: number;
  amountLabel: string;
  modalTitle: string;
  onSubmitted: (autoReleased: boolean, refCode: string | null) => void;
}

function PublicPayModal({
  open, onClose, ticket, company, token, dueAmount, amountLabel, modalTitle, onSubmitted,
}: PublicPayModalProps) {
  const strategy  = ticket.ticket_payment_strategy ?? "full";
  const channels  = getChannels(ticket);
  const total     = ticket.quote_final_total ?? 0;
  const refCode   = ticket.reference_code;
  const depositDue = computeDepositDue(ticket);
  const amountPaid = computeAmountPaid(ticket);
  const depositPaid = isDepositPaid(ticket, depositDue, amountPaid);
  const depositAmt  = Number(ticket.deposit_amount ?? amountPaid);

  const [selectedChannel, setSelectedChannel] = useState(channels[0] ?? "");
  const [amount, setAmount]                   = useState(dueAmount > 0 ? String(dueAmount) : "");
  const [receiptId, setReceiptId]             = useState("");
  const [evidenceFile, setEvidenceFile]       = useState<File | null>(null);
  const [submitting, setSubmitting]           = useState(false);
  const [submitErr, setSubmitErr]             = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(dueAmount > 0 ? String(dueAmount) : "");
    setSelectedChannel(channels[0] ?? "");
    setReceiptId("");
    setEvidenceFile(null);
    setSubmitErr(null);
    setSubmitting(false);
  }, [open, dueAmount, channels]);

  const needsEvidence = EVIDENCE_CHANNELS.has(selectedChannel);
  const canSubmit =
    !!selectedChannel && selectedChannel !== "card" &&
    !!amount && parseFloat(amount) > 0 &&
    (!needsEvidence || !!evidenceFile);

  async function handleSubmitPayment() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const form = new FormData();
      form.set("method", selectedChannel);
      form.set("amount",  amount);
      if (receiptId)    form.set("receiptId", receiptId);
      if (evidenceFile) form.set("file",      evidenceFile);
      const res  = await fetch(`/api/public/quotes/${token}/submit-payment`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setSubmitErr(data.error ?? "Submission failed. Please try again."); setSubmitting(false); return; }
      onClose();
      onSubmitted(data.autoReleased ?? false, data.reference_code ?? data.referenceCode ?? null);
    } catch {
      setSubmitErr("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: SURFACE, borderRadius: 12, width: "100%", maxWidth: 480,
        maxHeight: "90vh", overflowY: "auto", padding: "24px 24px 20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>{modalTitle}</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, display: "flex", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ background: "#FFFBEB", border: `1px solid ${GOLD}`, borderRadius: 8, padding: "12px 16px", marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>{amountLabel}</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: GOLD_DK }}>{fmt(dueAmount)}</div>
          {strategy === "partial" && depositPaid && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
              Deposit of {fmt(depositAmt)} already received · Total {fmt(total)}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Payment Method
          </label>
          <select
            value={selectedChannel}
            onChange={(e) => { setSelectedChannel(e.target.value); setEvidenceFile(null); setSubmitErr(null); }}
            style={{ width: "100%", padding: "10px 14px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, color: TEXT, background: SURFACE, outline: "none", cursor: "pointer" }}
          >
            {channels.map((ch) => (
              <option key={ch} value={ch}>{CHANNEL_LABELS[ch] ?? ch}</option>
            ))}
          </select>
        </div>

        {selectedChannel === "card" && (
          <div style={{ marginBottom: 16 }}>
            <CardContactPanel company={company} />
          </div>
        )}

        {selectedChannel && selectedChannel !== "card" && (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 20px 4px", marginBottom: 16, background: BG }}>
            {(selectedChannel === "wire" || selectedChannel === "ach") && (
              <WireAchPanel company={company} refCode={refCode} channel={selectedChannel}
                evidenceFile={evidenceFile} onEvidenceChange={setEvidenceFile} />
            )}
            {selectedChannel === "zelle" && (
              <ZellePanel company={company} refCode={refCode}
                evidenceFile={evidenceFile} onEvidenceChange={setEvidenceFile} />
            )}
            {selectedChannel === "check" && (
              <CheckPanel company={company} refCode={refCode}
                evidenceFile={evidenceFile} onEvidenceChange={setEvidenceFile} />
            )}
            {(selectedChannel === "cash" || selectedChannel === "offline") && (
              <CashPanel refCode={refCode} receiptId={receiptId} onReceiptChange={setReceiptId} />
            )}
          </div>
        )}

        {selectedChannel && selectedChannel !== "card" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Payment Amount ($)
            </label>
            <input
              type="number" step="0.01" min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              style={{ width: "100%", padding: "10px 14px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, color: TEXT, background: SURFACE, outline: "none" }}
            />
          </div>
        )}

        {needsEvidence && !evidenceFile && selectedChannel !== "card" && (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: MUTED, textAlign: "center" }}>
            Upload your payment screenshot to enable submission.
          </p>
        )}

        {submitErr && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10 }}>
            <AlertCircle size={15} style={{ color: "#DC2626", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#DC2626" }}>{submitErr}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, padding: "11px", background: "none", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Cancel
          </button>
          {selectedChannel !== "card" && (
            <button
              type="button"
              onClick={handleSubmitPayment}
              disabled={!canSubmit || submitting}
              style={{
                flex: 2, padding: "11px 20px",
                background: (!canSubmit || submitting) ? "#E5E7EB" : GOLD,
                color: (!canSubmit || submitting) ? "#9CA3AF" : NAVY,
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: (!canSubmit || submitting) ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {submitting
                ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</>
                : <><CheckCircle2 size={15} /> Submit Payment</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Unified customer portal — one link, phase-driven UI ─────────────────────

interface QuotePortalSectionProps {
  ticket: PublicTicket;
  company: PublicCompany;
  token: string;
  isAlreadyConfirmed: boolean;
  onConfirmed: () => void;
  onPaymentSubmitted: (autoReleased: boolean, refCode: string | null) => void;
  onRefresh: () => void;
}

// ─── Step badge (numbered circle — green when done, amber when under review) ─
function StepBadge({
  num, state = "idle",
}: {
  num: number;
  state?: "done" | "review" | "active" | "idle";
}) {
  const styles = {
    done:   { border: "none", background: "#16A34A", color: "#fff" },
    review: { border: "2px solid #D97706", background: "#FFFBEB", color: "#D97706" },
    active: { border: `2px solid ${NAVY}`, background: "transparent", color: NAVY },
    idle:   { border: `2px solid ${BORDER}`, background: "transparent", color: MUTED },
  }[state];

  return (
    <div style={{
      flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 700, marginTop: 2,
      ...styles,
    }}>
      {state === "done" ? <Check size={13} /> : state === "review" ? <Clock size={12} /> : num}
    </div>
  );
}

function QuotePortalSection({ ticket, company, token, onPaymentSubmitted, onConfirmed, isAlreadyConfirmed, onRefresh }: QuotePortalSectionProps) {
  const strategy = ticket.ticket_payment_strategy ?? "full";
  const channels = getChannels(ticket);
  const depositAmt = Number(ticket.deposit_amount ?? computeAmountPaid(ticket));

  const [localConfirmed, setLocalConfirmed] = useState(false);
  const isConfirmedOverride = isAlreadyConfirmed || localConfirmed;
  const portal = computePortalState(ticket, isConfirmedOverride);

  const {
    phase, total, depositDue, amountPaid, remaining, depositPaid, fullyPaid,
    isInProduction, isCompleted, requireConfirm, evidencePending,
    payAmount, payLabel, payButtonText, checklistTitle, actionTitle, actionSubtitle,
  } = portal;

  const isPartialCash = strategy === "partial" && ticket.ticket_dep_handling === "cash";
  const isCashOnly    = strategy === "full" && channels.length === 1 && channels[0] === "cash";
  const priceStepDone = portal.isConfirmed || isCashOnly || isPartialCash;

  const [localSubmitted, setLocalSubmitted] = useState(false);

  const paymentValidated =
    fullyPaid ||
    (strategy === "partial" && depositPaid) ||
    (strategy === "net" && priceStepDone);
  const awaitingReview = evidencePending || (localSubmitted && !paymentValidated);

  const paymentStepState: "done" | "review" | "active" | "idle" =
    paymentValidated && !evidencePending ? "done"
    : awaitingReview ? "review"
    : priceStepDone ? "active"
    : "idle";

  const productionStepState: "done" | "review" | "active" | "idle" =
    isCompleted || isInProduction ? "done"
    : paymentValidated && !awaitingReview ? "active"
    : "idle";

  const submittedAmount = Number(ticket.payment_evidence_amount ?? payAmount);

  function paymentStepDescription(): { text: string; color: string } {
    if (awaitingReview) {
      return {
        text: `Payment submitted (${fmt(submittedAmount)}) — we're validating it. You'll receive an email once confirmed.`,
        color: "#D97706",
      };
    }
    if (fullyPaid) {
      return { text: "Fully paid", color: "#16A34A" };
    }
    if (strategy === "net" && priceStepDone) {
      const terms = ticket.ticket_net_terms_label?.replace("-", " ") ?? "net terms";
      return {
        text: `Net terms — payment due within ${terms.replace("net ", "")} (optional early payment)`,
        color: "#D97706",
      };
    }
    if (strategy === "partial" && depositPaid) {
      return {
        text: `Deposit of ${fmt(depositAmt || amountPaid)} received · Balance ${fmt(remaining)} due later`,
        color: "#16A34A",
      };
    }
    return {
      text: `Paid ${fmt(amountPaid)} · Remaining ${fmt(payAmount)}`,
      color: MUTED,
    };
  }

  const paymentStepDesc = paymentStepDescription();

  const canPay = !fullyPaid && payAmount > 0.01 && priceStepDone && !evidencePending && !localSubmitted && (
    strategy === "net" || !paymentValidated || depositPaid || isInProduction
  );

  function handlePaymentSubmitted(autoReleased: boolean, refCode: string | null) {
    setLocalSubmitted(true);
    setFeedback(
      autoReleased
        ? "Payment confirmed — your order has entered production!"
        : "Thank you — we've received your payment proof. Our team will validate it and email you once confirmed.",
    );
    onPaymentSubmitted(autoReleased, refCode);
  }

  // Poll while payment is awaiting accountant review so the page updates when confirmed
  useEffect(() => {
    if (!awaitingReview || isInProduction || fullyPaid) return;
    const timer = setInterval(onRefresh, 30000);
    return () => clearInterval(timer);
  }, [awaitingReview, isInProduction, fullyPaid, onRefresh]);

  const [showPayModal, setShowPayModal] = useState(false);
  const [confirming, setConfirming]     = useState(false);
  const [confirmErr, setConfirmErr]     = useState<string | null>(null);
  const [feedback, setFeedback]         = useState<string | null>(null);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleConfirm() {
    setConfirming(true);
    setConfirmErr(null);
    try {
      const res  = await fetch(`/api/public/quotes/${token}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setConfirmErr(data.error ?? "Something went wrong. Please try again."); setConfirming(false); return; }
      setLocalConfirmed(true);
      onConfirmed();
    } catch {
      setConfirmErr("Network error. Please check your connection and try again.");
      setConfirming(false);
    }
  }

  const strategyLabel =
    strategy === "full" ? "Pay in full" :
    strategy === "partial" ? "Partial payment" : "Net terms";

  const channelLabelStr = channels.map((ch) => CHANNEL_LABELS[ch] ?? ch).join(", ");

  const confirmLabel =
    isCashOnly || isPartialCash ? "Not required (cash in person)" :
    requireConfirm ? "Required" : "Not required";

  const blockReason =
    !priceStepDone ? null :
    phase === "needs_payment" && strategy === "full"    ? `Full payment of ${fmt(total)} is required before production.` :
    phase === "needs_payment" && strategy === "partial" ? `Deposit of ${fmt(depositDue)} is required before production can start.` :
    null;

  const pickupAddress = companyAddressFull(company);

  if (isCompleted) {
    return (
      <div style={{ border: `1px solid #BBF7D0`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", background: "#F0FDF4", borderBottom: `1px solid #BBF7D0` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <CheckCircle2 size={20} style={{ color: "#16A34A" }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: "#166534" }}>{actionTitle}</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "#15803D", lineHeight: 1.6 }}>{actionSubtitle}</p>
        </div>
        {(pickupAddress || company.phone) && (
          <div style={{ padding: "18px 24px", background: SURFACE }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 10 }}>
              Pickup Location
            </div>
            {pickupAddress && (
              <p style={{ margin: "0 0 6px", fontSize: 14, lineHeight: 1.6 }}>
                <AddressMapText address={pickupAddress} style={{ color: TEXT }} />
              </p>
            )}
            {company.phone && (
              <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
                Phone:{" "}
                <a href={`tel:${String(company.phone).replace(/\s/g, "")}`} style={{ ...mapLinkStyle, color: TEXT, fontWeight: 600 }}>
                  {company.phone}
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (phase === "net_terms" && !requireConfirm) {
    const termsLabel = ticket.ticket_net_terms_label?.replace("-", " ") ?? "agreed net terms";
    return (
      <div style={{ border: `1px solid #BFDBFE`, borderRadius: 10, padding: "20px 24px", background: "#EFF6FF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <CheckCircle2 size={18} style={{ color: "#1D4ED8" }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1E3A5F" }}>{actionTitle}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#3B82F6", lineHeight: 1.6 }}>
          Your order is on <strong>{termsLabel}</strong>.
          {isInProduction
            ? " Production is underway — payment is due per your terms, and you may pay early below if you prefer."
            : " No upfront payment is required — production begins immediately."}
        </p>
        {canPay && (
          <button
            onClick={() => setShowPayModal(true)}
            style={{ marginTop: 14, padding: "7px 18px", background: NAVY, color: GOLD, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Pay early ({fmt(payAmount)})
          </button>
        )}
      </div>
    );
  }

  return (
  <>
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>

      {/* Phase action banner — same shell, different message per scenario */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${BORDER}`, background: BG }}>
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: TEXT }}>{actionTitle}</p>
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{actionSubtitle}</p>
      </div>

      {/* Two-column panel */}
      <div className="stack-mobile" style={{ display: "flex" }}>

        {/* Left — checklist / status */}
        <div style={{ flex: 1, padding: "20px 24px", borderRight: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 16 }}>
            {checklistTitle}
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>

            {/* Step 1 — Quote confirmed */}
            <li style={{ display: "flex", gap: 12, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
              <StepBadge num={1} state={priceStepDone ? "done" : "active"} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: priceStepDone ? MUTED : TEXT }}>
                  Quote price confirmed
                </p>
                <p style={{ margin: 0, fontSize: 12, color: priceStepDone ? "#16A34A" : MUTED }}>
                  {priceStepDone
                    ? "Confirmed"
                    : requireConfirm ? "Customer must confirm the quote" : "Not required"}
                </p>
                {!priceStepDone && requireConfirm && (
                  <div style={{ marginTop: 10 }}>
                    {confirmErr && <p style={{ margin: "0 0 6px", fontSize: 12, color: "#DC2626" }}>{confirmErr}</p>}
                    <button
                      onClick={handleConfirm}
                      disabled={confirming}
                      style={{ padding: "7px 18px", background: NAVY, color: GOLD, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: confirming ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      {confirming && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                      {confirming ? "Confirming…" : "Confirm & Accept Quote"}
                    </button>
                  </div>
                )}
              </div>
            </li>

            {/* Step 2 — Payment */}
            <li style={{ display: "flex", gap: 12, padding: "16px 0", borderBottom: `1px solid ${BORDER}` }}>
              <StepBadge num={2} state={paymentStepState} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: awaitingReview ? TEXT : paymentStepState === "done" ? MUTED : TEXT }}>
                  Payment
                </p>
                <p style={{ margin: 0, fontSize: 12, color: paymentStepDesc.color, lineHeight: 1.5 }}>
                  {paymentStepDesc.text}
                </p>
                {canPay && (
                  <button
                    onClick={() => setShowPayModal(true)}
                    style={{ marginTop: 10, padding: "7px 18px", background: NAVY, color: GOLD, border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    {payButtonText}
                  </button>
                )}
              </div>
            </li>

            {/* Step 3 — Production / Pickup */}
            <li style={{ display: "flex", gap: 12, paddingTop: 16 }}>
              <StepBadge num={3} state={productionStepState} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: isCompleted ? "#16A34A" : isInProduction ? "#16A34A" : productionStepState === "active" ? TEXT : MUTED }}>
                  {isCompleted ? "Ready for pickup" : isInProduction ? "In production" : awaitingReview ? "Awaiting payment confirmation" : "Ready for production"}
                </p>
                {isCompleted && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#16A34A", lineHeight: 1.5 }}>
                    Your order is complete — pick it up at our print shop
                  </p>
                )}
                {isInProduction && !isCompleted && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#16A34A" }}>
                    Your order is being produced
                  </p>
                )}
                {awaitingReview && !isInProduction && !isCompleted && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#D97706", lineHeight: 1.5 }}>
                    Production starts after we confirm your payment
                  </p>
                )}
              </div>
            </li>

          </ol>
        </div>

        {/* Right — payment summary */}
        <div style={{ flex: 1, padding: "20px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 16 }}>
            Payment Summary
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([
              ["Strategy",    strategyLabel,  false],
              ["Quote total", fmt(total),     false],
              ...(awaitingReview ? [
                ["Amount submitted", fmt(submittedAmount), false],
                ["Status", "Awaiting validation", true],
              ] : []),
              // Paid rows — only show when something has actually been confirmed
              ...(depositPaid && strategy === "partial" && !awaitingReview ? [
                ["Deposit paid",       fmt(depositAmt), false],
                ["Balance remaining",  fmt(remaining),  remaining > 0.01],
              ] : []),
              ...(amountPaid > 0 && strategy === "full" && !awaitingReview ? [
                ["Paid",          fmt(amountPaid),                false],
                ["Remaining",     fmt(remaining),                 remaining > 0.01],
              ] : []),
              // Nothing paid yet — show what is due
              ...(!depositPaid && strategy === "partial" ? [
                ["Deposit due",   fmt(depositDue),                depositDue > 0.01],
                ["Balance after deposit", fmt(Math.max(0, total - depositDue)), false],
              ] : []),
              ...(amountPaid <= 0 && strategy === "full" && !awaitingReview ? [
                ["Due now",       fmt(total),                     total > 0.01],
              ] : []),
              ...(channelLabelStr ? [["Channels", channelLabelStr, false]] : []),
              ["Price confirmation", confirmLabel, false],
            ] as [string, string, boolean][]).map(([label, value, warn]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 13, color: MUTED, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: warn ? "#D97706" : TEXT, textAlign: "right", wordBreak: "break-word" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Full-width payment CTA */}
      {canPay && (
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${BORDER}`, background: BG }}>
          <button
            onClick={() => setShowPayModal(true)}
            style={{ width: "100%", padding: "13px", background: NAVY, color: GOLD, border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            {payButtonText}
          </button>
          {blockReason && phase === "needs_payment" && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 13, color: "#92400E" }}>
              {blockReason}
            </div>
          )}
        </div>
      )}

      {feedback && (
        <div style={{
          padding: "14px 24px", borderTop: `1px solid ${BORDER}`,
          background: feedback.includes("production") ? "#F0FDF4" : awaitingReview ? "#FFFBEB" : "#FFF7ED",
          fontSize: 13, fontWeight: 500,
          color: feedback.includes("production") ? "#166534" : awaitingReview ? "#92400E" : "#C2410C",
        }}>
          {feedback}
        </div>
      )}

    </div>

    <PublicPayModal
      open={showPayModal}
      onClose={() => setShowPayModal(false)}
      ticket={ticket}
      company={company}
      token={token}
      dueAmount={payAmount}
      amountLabel={payLabel}
      modalTitle={payButtonText}
      onSubmitted={handlePaymentSubmitted}
    />
  </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [ticket, setTicket]   = useState<PublicTicket | null>(null);
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const [finalRef, setFinalRef]               = useState<string | null>(null);

  function refreshTicket() {
    fetch(`/api/public/quotes/${token}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.ticket) return;
        setTicket(d.ticket);
        if (d.ticket.reference_code) setFinalRef(d.ticket.reference_code);
      })
      .catch(() => {});
  }

  function handlePaymentSubmitted(_autoReleased: boolean, refCode: string | null) {
    refreshTicket();
    if (refCode) setFinalRef(refCode);
  }

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
        if (d.ticket?.client_confirmed) setClientConfirmed(true);
        if (d.ticket?.reference_code) setFinalRef(d.ticket.reference_code);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  if (loading) return <LoadingSkeleton />;
  if (notFound || !ticket) return <NotFound />;

  const companyName  = company?.company_name ?? "BazaarPrinting";

  const isSent      = ticket.ticket_status === "sent";
  const isOrder     = ticket.ticket_status === "order" || ticket.order_source === "direct";
  const isCancelled = ticket.ticket_status === "cancelled";
  const isCompleted = ticket.ticket_status === "completed";
  const isInProd    = ticket.ticket_status === "in_production";
  const isOrderActive = isInProd || isCompleted;
  const portal      = computePortalState(ticket, clientConfirmed || ticket.client_confirmed);
  const showPortal  = !isCancelled && (isSent || isOrder || isOrderActive);
  const paymentSummary = computeInvoicePaymentSummary(ticket);
  const refCode     = finalRef ?? ticket.reference_code ?? ticket.id?.slice(0, 8).toUpperCase() ?? "—";

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          .hide-mobile  { display: none !important; }
          .stack-mobile { flex-direction: column !important; }
        }
        @media (min-width: 641px) { .hide-desktop { display: none !important; } }
      `}</style>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px 64px" }}>

        <div style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "32px 36px 28px" }}>

          {/* Greeting */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600, color: TEXT }}>
              Hi {customerName(ticket)}
            </h1>
            <p style={{ margin: 0, fontSize: 15, color: MUTED, lineHeight: 1.6 }}>
              {portalGreetingSubtitle(portal).replace(/^,\s*/, "")}
            </p>
          </div>

          {isCancelled && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 10 }}>
              <AlertCircle size={16} style={{ color: "#DC2626", flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: "#DC2626" }}>This quote has been cancelled. Please contact us if you have questions.</span>
            </div>
          )}

          {/* Invoice-style document (matches PDF + shadow app) */}
          <PublicQuoteDocument
            company={company ?? {}}
            ticket={ticket}
            token={token}
            isOrder={isOrder || isOrderActive}
            isInProduction={isInProd}
            isCompleted={isCompleted}
            refCode={refCode}
            paymentSummary={paymentSummary}
          />

          {/* Unified portal — payment / confirm actions */}
          {showPortal && (
            <QuotePortalSection
              ticket={ticket}
              company={company ?? {}}
              token={token}
              isAlreadyConfirmed={clientConfirmed || ticket.client_confirmed}
              onConfirmed={() => { setClientConfirmed(true); refreshTicket(); }}
              onPaymentSubmitted={handlePaymentSubmitted}
              onRefresh={refreshTicket}
            />
          )}

          {!isSent && !isOrder && !isCancelled && !isOrderActive && (
            <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
              <Package size={20} style={{ color: MUTED, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
                This quote is being processed. Contact us if you have any questions.
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>{companyName}</div>
          <AddressMapLink
            company={company ?? {}}
            lineStyle={{ fontSize: 12, color: MUTED, lineHeight: 1.8 }}
          />
          {company?.phone && (
            <a href={`tel:${String(company.phone).replace(/\s/g, "")}`} style={{ ...mapLinkStyle, fontSize: 12, color: MUTED, lineHeight: 1.8, display: "block" }}>
              Tel: {company.phone}
            </a>
          )}
          {company?.email && (
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              <a href={`mailto:${company.email}`} style={{ color: NAVY, textDecoration: "none" }}>{company.email}</a>
            </div>
          )}
          {company?.website && (
            <a
              href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...mapLinkStyle, fontSize: 12, color: MUTED, lineHeight: 1.8, display: "block" }}
            >
              {company.website}
            </a>
          )}
          <div style={{ marginTop: 12, fontSize: 11, color: MUTED }}>Powered by BazaarPrinting CRM</div>
        </div>

      </div>
    </div>
  );
}
