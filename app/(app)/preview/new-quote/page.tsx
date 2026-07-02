"use client";

// Hayk 2026-07-01 — New Quote flow preview.
// Real 3-step wizard, uses /api/v1/catalog/products + /api/v1/pricing/quote.
// Includes the Quote Type toggle + Step 3 additions we spec'd.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const DRAFT_STORAGE_KEY = "bazaar.quoteDraft";

const ACCENT = "#FF5D2E";
const GOLD = "#fbbf24";

// ─── Types (mirror /lib/catalog/types) ─────────────────────
interface Product {
  id: number;
  name: string;
  subcategory: string | null;
  fields: Record<string, any>;
  materials: Array<{ id: number; displayName: string; materialName: string; priceMultiplier: number; machine?: string }>;
  frameTiers: any;
  pacdora?: boolean;
}
interface Category { id: string; label: string; icon: string; count: number; order: number }

interface LineItem {
  id: string;
  productId?: number;
  productName?: string;
  materialId?: number;
  materialName?: string;
  widthIn?: number;
  heightIn?: number;
  quantity: number;
  finishingIds: number[];             // FINISHING field ids (lamination / coating)
  specialEffectIds: number[];         // SPECIAL_EFFECTS field ids (foils, emboss, cuts)
  sides?: "S1" | "S2";
  colorMode?: "CMYK" | "Pantone";
  comment?: string;
  // Pricing (from webhook)
  unitPrice?: number;
  extended?: number;
  quoteRefId?: string;
  frameTiersHash?: string;
  pricingLoading?: boolean;
  pricingError?: string;
  // Team override
  overrideEnabled?: boolean;
  overrideUnitPrice?: number;
  overrideExtended?: number;
  overrideReason?: string;
  // Roll-specific specs (only shown for roll products)
  rollDirection?: string;
  coreSize?: string;
  outsideDiameter?: string;
  // Artwork
  designerName?: string;
  artworkFiles?: { name: string; size: string }[];
}

// FINISHING labels — sourced directly from the local Bazaar dev DB (Material.details).
// These are Lamination-type Material rows. Whitespace / casing kept as stored.
const FINISHING_LABELS: Record<number, string> = {
  177: "Matte Lam",
  178: "Soft Touch (Karess)",
  179: "Gloss Lam",
  180: "Matte Lam",
  181: "Gloss Lam",
  182: "Soft Touch Lam",
  183: "Soft Touch — Non-Scratch",
  201: "Rainbow Holographic Lam",
  225: "Rainbow Holographic Lam",
  344: "3mil Gloss Lamination",
  345: "3mil Gloss Lamination",
  346: "3mil Matte Lamination",
  347: "3mil Matte Lamination",
  348: "5mil Gloss Lamination",
  349: "5mil Gloss Lamination",
  350: "5mil Matte Lamination",
  351: "5mil Matte Lamination",
  403: "Matte Lamination",
  404: "Gloss Lamination",
  405: "Soft Touch Lamination",
};

// SPECIAL EFFECTS labels — Foil + Liquid (Raised UV) Material rows from the Bazaar DB.
const SPECIAL_EFFECT_LABELS: Record<number, string> = {
  206: "Gold Foil",
  207: "Gold Foil",
  208: "Bronze Foil",
  209: "Silver Dot Foil",
  210: "Digital Gold Foil",
  211: "Rainbow Holo Foil",
  212: "Royal Blue Foil",
  213: "Green Textile Foil",
  214: "Red Textile Foil",
  215: "Red Textile Foil",
  216: "Royal Blue Foil",
  217: "Holo Dot Foil",
  218: "Green Textile Foil",
  219: "Rainbow Holo Foil",
  227: "1-Pass Raised UV",
  228: "3-Pass Raised UV",
  229: "Raised UV — 40µ (light)",
  230: "Raised UV — 50µ (standard)",
  231: "Raised UV — 60µ (thick)",
  232: "Raised UV — 80µ (max)",
  233: "Cast & Cure",
  329: "Cast & Cure Film",
};
const finishLabel = (id: number) => FINISHING_LABELS[id] || `Finish #${id}`;
const effectLabel = (id: number) => SPECIAL_EFFECT_LABELS[id] || `Effect #${id}`;
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Some material rows in the catalog snapshot ship with generic "Material NNN"
// as displayName because the Bazaar Material table wasn't fully populated at snapshot time.
// This helper builds a more informative label from the other fields we DO have.
function displayMaterialLabel(m: any): string {
  if (!m) return "";
  const dn: string = m.displayName || "";
  if (dn && !/^Material \d+$/.test(dn)) return dn;   // real name — use it
  // Fallback — synthesize from priceMultiplier + frame size
  const parts: string[] = [];
  if (m.materialName) parts.push(m.materialName);
  else parts.push(`Material #${m.id}`);
  if (typeof m.priceMultiplier === "number") parts.push(`${m.priceMultiplier}× multiplier`);
  if (m.frameWidth && m.frameLength) parts.push(`${m.frameWidth}×${m.frameLength} sheet`);
  return parts.join(" · ");
}

export default function NewQuotePreview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillLeadId = searchParams?.get("leadId") || "";
  const prefillName = searchParams?.get("name") || "";
  const prefillPhone = searchParams?.get("phone") || "";
  const prefillEmail = searchParams?.get("email") || "";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [toast, setToast] = useState<null | { kind: "ok" | "err"; msg: string }>(null);
  const [draftFound, setDraftFound] = useState<null | { ageMinutes: number; blob: any }>(null);
  const draftLoadedRef = useRef(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Customer info — pre-filled from lead when arriving via /preview/new-quote?leadId=...&name=...
  const [customerName, setCustomerName] = useState(prefillName || "Hayk Zohrabyan");
  const [customerEmail, setCustomerEmail] = useState(prefillEmail || "haykzoh@gmail.com");
  const [customerPhone, setCustomerPhone] = useState(prefillPhone || "(818) 927-7146");

  // Step 1: Job overview
  const [quoteName, setQuoteName] = useState(prefillName ? `${prefillName} — Quote` : "Trap Snacks Labels + Boxes");
  const [priority, setPriority] = useState<"Normal" | "Rush" | "Critical">("Normal");
  const [dueDate, setDueDate] = useState("2026-07-08");
  const [salesRep, setSalesRep] = useState("Ernesto");
  const [notesToProduction, setNotesToProduction] = useState("Customer needs first article ASAP.\nMatch previous order.");

  // Step 2: Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([{ id: "l1", quantity: 1000, finishingIds: [], specialEffectIds: [] }]);
  const [quoteType, setQuoteType] = useState<"firm" | "comparison">("firm");

  // Step 3: Review & send
  const [validForDays, setValidForDays] = useState(30);
  const [taxRate, setTaxRate] = useState(9.75);
  const [taxExempt, setTaxExempt] = useState(false);
  const [discountMode, setDiscountMode] = useState<"none" | "percent" | "flat">("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [fulfillment, setFulfillment] = useState<"pickup" | "ship">("pickup");
  const [paymentStrategy, setPaymentStrategy] = useState<"partial" | "full" | "netterms">("full");
  const [partialPct, setPartialPct] = useState(50);
  const [netTermsDays, setNetTermsDays] = useState(30);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["Wire", "ACH", "Card (online)"]);
  const [noteToCustomer, setNoteToCustomer] = useState("");
  const [includeRepSignature, setIncludeRepSignature] = useState(true);
  const [channel, setChannel] = useState<"Email" | "SMS" | "Both">("Email");
  const [recipients, setRecipients] = useState<{ email: string; primary: boolean }[]>([{ email: "customer@example.com", primary: true }]);
  const [newRecipient, setNewRecipient] = useState("");
  const [alsoSmsTo, setAlsoSmsTo] = useState("(818) 927-7146");
  const [noNotification, setNoNotification] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; size: string; kind: string; included: boolean }[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Quote reference — generated once when opened, carried through lifecycle
  // 3-digit reference number, no year/QO- prefix — matches sales-floor shorthand (e.g. "705").
  const [quoteRefId] = useState(() => `Q-${String(Math.floor(Math.random() * 900) + 100)}`);

  // Similar-past-order banner — dismissable per session
  const [pastOrderBannerDismissed, setPastOrderBannerDismissed] = useState(false);
  // Previous work collapsible — default collapsed
  const [previousWorkOpen, setPreviousWorkOpen] = useState(false);
  // Placeholder previous-orders count (until DB wiring). >2 triggers the similar-order banner in Step 2.
  const previousOrdersCount = 3;
  // Current user role (SDR/Sales/Admin) — role toggle not wired yet, so we default to SDR
  // to always show the assignment-mismatch banner as a preview.
  const currentUserRole: "SDR" | "Sales" | "Admin" = "SDR";
  const currentUserName = "You";

  // Send-to-workflow state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<null | { ok: boolean; msg: string }>(null);

  async function handleSendQuote() {
    if (sending) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/dev/send-preview-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteRefId,
          customerName,
          customerEmail,
          customerPhone,
          companyName: "Cecile",
          priority,
          dueDate,
          notes: notesToProduction,
          lineItems: lineItems.map(l => ({
            productName: l.productName,
            materialName: l.materialName,
            widthIn: l.widthIn,
            heightIn: l.heightIn,
            sides: l.sides,
            colorMode: l.colorMode,
            quantity: l.quantity,
            comment: l.comment,
            finishingIds: l.finishingIds,
            specialEffectIds: l.specialEffectIds,
            unitPrice: l.overrideEnabled ? l.overrideUnitPrice : l.unitPrice,
            extended: l.overrideEnabled ? l.overrideExtended : l.extended,
          })),
          quoteType,
          total,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const wf = data.workflowResponse || {};
        const orderNo = wf.order_number || wf.orderId || wf.order_id || "";
        setSendResult({ ok: true, msg: `Sent to Workflow board. Order: ${orderNo}` });
        // Clear draft on successful send
        try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
        setToast({ kind: "ok", msg: `Quote sent · ${orderNo}` });
        setTimeout(() => {
          try { router.push("/preview/orders"); } catch {}
        }, 1200);
      } else {
        setSendResult({ ok: false, msg: data.error || "Failed to send" });
      }
    } catch (e) {
      setSendResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  // Fetch catalog
  useEffect(() => {
    fetch("/api/v1/catalog/products")
      .then(r => r.json())
      .then(data => {
        setCategories(data.categories || []);
        setProducts(data.products || []);
      })
      .catch(() => {});
  }, []);

  // Pricing math — use override if enabled, else the returned mock/live price
  const subtotal = lineItems.reduce((sum, l) => sum + ((l.overrideEnabled ? l.overrideExtended : l.extended) || 0), 0);
  const discountAmount = discountMode === "percent" ? subtotal * (discountValue / 100) : discountMode === "flat" ? discountValue : 0;
  const preTax = subtotal - discountAmount + shipping;
  const taxAmount = taxExempt ? 0 : preTax * (taxRate / 100);
  const total = preTax + taxAmount;

  // Per-step required-field validation. Empty array = step is complete.
  function stepIssues(target: 1 | 2 | 3): string[] {
    const issues: string[] = [];
    if (target === 1) {
      if (!quoteName?.trim()) issues.push("Quote name");
      if (!dueDate) issues.push("Due date");
      if (!salesRep?.trim()) issues.push("Sales rep");
    }
    if (target === 2) {
      if (lineItems.length === 0) issues.push("At least one line item");
      lineItems.forEach((l, i) => {
        if (!l.productId)  issues.push(`Line ${i + 1}: product`);
        if (!l.materialId) issues.push(`Line ${i + 1}: material`);
        if (!l.quantity || l.quantity <= 0) issues.push(`Line ${i + 1}: quantity`);
      });
    }
    return issues;
  }
  const step1Issues = stepIssues(1);
  const step2Issues = stepIssues(2);
  const currentIssues = step === 1 ? step1Issues : step === 2 ? step2Issues : [];
  const canAdvance = currentIssues.length === 0;
  function tryAdvance() {
    if (!canAdvance) {
      showToast("err", `Fill required: ${currentIssues.slice(0, 3).join(" · ")}${currentIssues.length > 3 ? ` · +${currentIssues.length - 3} more` : ""}`);
      return;
    }
    setStep((step + 1) as 1 | 2 | 3);
  }

  // ─── Draft persistence (localStorage) ─────────────────
  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  }
  function collectDraftBlob() {
    return {
      savedAt: Date.now(),
      step, customerName, customerEmail, customerPhone,
      quoteName, priority, dueDate, salesRep,
      notesToProduction, lineItems, quoteType,
      validForDays, taxRate, taxExempt, discountMode, discountValue, shipping,
      fulfillment, paymentStrategy, partialPct, netTermsDays, paymentMethods,
      noteToCustomer, includeRepSignature, channel, recipients, alsoSmsTo,
      noNotification, attachments,
    };
  }
  function saveDraft() {
    try {
      const blob = collectDraftBlob();
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(blob));
      showToast("ok", "Draft saved");
    } catch (e) {
      showToast("err", "Could not save draft");
    }
  }
  function applyDraft(blob: any) {
    if (blob.step) setStep(blob.step);
    if (blob.customerName != null) setCustomerName(blob.customerName);
    if (blob.customerEmail != null) setCustomerEmail(blob.customerEmail);
    if (blob.customerPhone != null) setCustomerPhone(blob.customerPhone);
    if (blob.quoteName != null) setQuoteName(blob.quoteName);
    if (blob.priority) setPriority(blob.priority);
    if (blob.dueDate) setDueDate(blob.dueDate);
    if (blob.salesRep) setSalesRep(blob.salesRep);
    if (blob.notesToProduction != null) setNotesToProduction(blob.notesToProduction);
    if (Array.isArray(blob.lineItems) && blob.lineItems.length > 0) setLineItems(blob.lineItems);
    if (blob.quoteType) setQuoteType(blob.quoteType);
    if (blob.validForDays != null) setValidForDays(blob.validForDays);
    if (blob.taxRate != null) setTaxRate(blob.taxRate);
    if (blob.taxExempt != null) setTaxExempt(blob.taxExempt);
    if (blob.discountMode) setDiscountMode(blob.discountMode);
    if (blob.discountValue != null) setDiscountValue(blob.discountValue);
    if (blob.shipping != null) setShipping(blob.shipping);
    if (blob.fulfillment) setFulfillment(blob.fulfillment);
    if (blob.paymentStrategy) setPaymentStrategy(blob.paymentStrategy);
    if (blob.partialPct != null) setPartialPct(blob.partialPct);
    if (blob.netTermsDays != null) setNetTermsDays(blob.netTermsDays);
    if (Array.isArray(blob.paymentMethods)) setPaymentMethods(blob.paymentMethods);
    if (blob.noteToCustomer != null) setNoteToCustomer(blob.noteToCustomer);
    if (blob.includeRepSignature != null) setIncludeRepSignature(blob.includeRepSignature);
    if (blob.channel) setChannel(blob.channel);
    if (Array.isArray(blob.recipients)) setRecipients(blob.recipients);
    if (blob.alsoSmsTo != null) setAlsoSmsTo(blob.alsoSmsTo);
    if (blob.noNotification != null) setNoNotification(blob.noNotification);
    if (Array.isArray(blob.attachments)) setAttachments(blob.attachments);
  }
  function restoreDraft() {
    if (draftFound) {
      applyDraft(draftFound.blob);
      setDraftFound(null);
      showToast("ok", "Draft restored");
    }
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch {}
    setDraftFound(null);
  }
  // On mount — check for an existing draft
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const blob = JSON.parse(raw);
      if (!blob?.savedAt) return;
      const ageMs = Date.now() - blob.savedAt;
      const ageMinutes = Math.max(1, Math.floor(ageMs / 60000));
      setDraftFound({ ageMinutes, blob });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "var(--preview-bg)", color: "var(--preview-text)", margin: "-20px", padding: "20px", minHeight: "100vh" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text)" }}>New Quote · 3-step flow · live catalog + mock pricing</span>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--preview-text-muted)" }}>Reference: <b style={{ color: GOLD, fontFamily: "monospace" }}>{quoteRefId}</b></span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3) : window.history.back()} style={backBtn}>← Back</button>
          <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>New Quote</h1>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {step === 3 && <button onClick={() => setPreviewOpen(true)} style={btnLight}>👁 Preview as customer</button>}
          <button onClick={saveDraft} style={btnLight}>💾 Save Draft</button>
          {step < 3
            ? <button onClick={tryAdvance} title={canAdvance ? undefined : `Missing: ${currentIssues.join(" · ")}`} style={{ ...btnPrimary, opacity: canAdvance ? 1 : 0.55, cursor: canAdvance ? "pointer" : "not-allowed" }}>Next: {step === 1 ? "Products" : "Review & Send"} →</button>
            : <button onClick={handleSendQuote} disabled={sending} style={{ ...btnPrimary, opacity: sending ? 0.5 : 1 }}>{sending ? "Sending…" : "✈ Save & Send Quote"}</button>}
        </div>
      </div>

      {sendResult && (
        <div style={{ margin: "12px 0", padding: "10px 14px", borderRadius: "8px", background: sendResult.ok ? "#dcfce7" : "#fee2e2", border: `1px solid ${sendResult.ok ? "#86efac" : "#fca5a5"}`, color: sendResult.ok ? "#166534" : "#991b1b", fontSize: "12.5px", fontWeight: 700 }}>
          {sendResult.ok ? "✓ " : "✗ "}{sendResult.msg}
        </div>
      )}

      {draftFound && (
        <div style={{ margin: "12px 0", padding: "10px 14px", borderRadius: "8px", background: "#fef9c3", border: "1px solid #fde68a", color: "#78350f", fontSize: "12.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "15px" }}>📝</span>
          <span>Draft from {draftFound.ageMinutes}m ago found.</span>
          <button onClick={restoreDraft} style={{ padding: "5px 12px", background: GOLD, color: "#171717", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Restore</button>
          <button onClick={discardDraft} style={{ padding: "5px 12px", background: "transparent", color: "#78350f", border: "1px solid #d97706", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Discard</button>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 200, padding: "12px 18px", borderRadius: "8px", background: toast.kind === "ok" ? "#dcfce7" : "#fee2e2", border: `1px solid ${toast.kind === "ok" ? "#86efac" : "#fca5a5"}`, color: toast.kind === "ok" ? "#166534" : "#991b1b", fontSize: "13px", fontWeight: 700, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {toast.kind === "ok" ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}

      {/* Stepper */}
      <Stepper step={step} />

      <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", gap: "16px", marginTop: "16px" }}>
        {/* LEFT — Customer card (persistent) */}
        <CustomerCard
          name={customerName}
          email={customerEmail}
          phone={customerPhone}
          salesRep={salesRep}
          leadId={prefillLeadId}
        />

        {/* RIGHT — step content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {step < 3 && currentIssues.length > 0 && (
            <div style={{ padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "10px", color: "#78350f", fontSize: "12.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "15px" }}>⚠</span>
              <span>Still needed before you can move on: <b>{currentIssues.join(" · ")}</b></span>
            </div>
          )}
          {step === 1 && (
            <Step1Info
              quoteRefId={quoteRefId}
              quoteName={quoteName} setQuoteName={setQuoteName}
              priority={priority} setPriority={setPriority}
              dueDate={dueDate} setDueDate={setDueDate}
              salesRep={salesRep} setSalesRep={setSalesRep}
              notes={notesToProduction} setNotes={setNotesToProduction}
              currentUserRole={currentUserRole}
              currentUserName={currentUserName}
              customerName={customerName}
              previousWorkOpen={previousWorkOpen}
              setPreviousWorkOpen={setPreviousWorkOpen}
            />
          )}
          {step === 2 && (
            <Step2LineItems
              lineItems={lineItems} setLineItems={setLineItems}
              categories={categories} products={products}
              quoteType={quoteType} setQuoteType={setQuoteType}
              subtotal={subtotal}
              previousOrdersCount={previousOrdersCount}
              pastOrderBannerDismissed={pastOrderBannerDismissed}
              setPastOrderBannerDismissed={setPastOrderBannerDismissed}
            />
          )}
          {step === 3 && (
            <Step3Review
              quoteRefId={quoteRefId}
              lineItems={lineItems}
              quoteType={quoteType}
              subtotal={subtotal} discountAmount={discountAmount} preTax={preTax} taxAmount={taxAmount} total={total} shipping={shipping}
              taxRate={taxRate} setTaxRate={setTaxRate}
              taxExempt={taxExempt} setTaxExempt={setTaxExempt}
              discountMode={discountMode} setDiscountMode={setDiscountMode}
              discountValue={discountValue} setDiscountValue={setDiscountValue}
              validForDays={validForDays} setValidForDays={setValidForDays}
              fulfillment={fulfillment} setFulfillment={setFulfillment}
              paymentStrategy={paymentStrategy} setPaymentStrategy={setPaymentStrategy}
              partialPct={partialPct} setPartialPct={setPartialPct}
              netTermsDays={netTermsDays} setNetTermsDays={setNetTermsDays}
              paymentMethods={paymentMethods} setPaymentMethods={setPaymentMethods}
              noteToCustomer={noteToCustomer} setNoteToCustomer={setNoteToCustomer}
              includeRepSignature={includeRepSignature} setIncludeRepSignature={setIncludeRepSignature}
              channel={channel} setChannel={setChannel}
              recipients={recipients} setRecipients={setRecipients}
              newRecipient={newRecipient} setNewRecipient={setNewRecipient}
              alsoSmsTo={alsoSmsTo} setAlsoSmsTo={setAlsoSmsTo}
              noNotification={noNotification} setNoNotification={setNoNotification}
              attachments={attachments} setAttachments={setAttachments}
            />
          )}

          {/* Footer nav */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", paddingTop: "16px", borderTop: "1px solid #eee" }}>
            <button onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3) : window.history.back()} style={backBtn}>← Back</button>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { if (confirm("Discard this quote?")) { discardDraft(); router.push("/preview/orders"); } }} style={btnLight}>Cancel</button>
              <button onClick={saveDraft} style={btnLight}>Save Draft</button>
              {step < 3
                ? <button onClick={tryAdvance} title={canAdvance ? undefined : `Missing: ${currentIssues.join(" · ")}`} style={{ ...btnPrimary, opacity: canAdvance ? 1 : 0.55, cursor: canAdvance ? "pointer" : "not-allowed" }}>{step === 1 ? "Continue" : "Next: Review Quote"} →</button>
                : <button onClick={handleSendQuote} disabled={sending} style={{ ...btnPrimary, opacity: sending ? 0.5 : 1 }}>{sending ? "Sending…" : "✈ Save & Send Quote"}</button>}
            </div>
          </div>
        </div>
      </div>

      {previewOpen && <PreviewModal onClose={() => setPreviewOpen(false)} quoteRefId={quoteRefId} quoteType={quoteType} noteToCustomer={noteToCustomer} lineItems={lineItems} total={total} validForDays={validForDays} />}
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────
function Stepper({ step }: { step: number }) {
  const steps = [
    { n: 1, label: "Overview", sub: "Job overview" },
    { n: 2, label: "Products", sub: "Add products & specs" },
    { n: 3, label: "Review & Send", sub: "Review and send quote" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px 20px" }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: step > s.n ? "#22c55e" : step === s.n ? GOLD : "#e5e5e5",
              color: step >= s.n ? "#fff" : "#888",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "13px", fontWeight: 800,
            }}>{step > s.n ? "✓" : s.n}</div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 800, color: step >= s.n ? "#171717" : "#999" }}>{s.label}</div>
              <div style={{ fontSize: "11px", color: "#888" }}>{s.sub}</div>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: "2px", background: step > s.n ? "#22c55e" : step > s.n - 1 ? GOLD : "#e5e5e5", margin: "0 12px" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Left: Customer card ────────────────────────────────────────
function CustomerCard({ name, email, phone, salesRep, leadId }: { name: string; email: string; phone: string; salesRep: string; leadId?: string }) {
  const initials = (name || "?")
    .split(/\s+/)
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const custQuery = leadId ? `customerId=${encodeURIComponent(leadId)}` : `customer=${encodeURIComponent(name)}`;
  const crmHref = `/preview/crm?${custQuery}`;
  const activeOrdersHref = `/preview/orders?${custQuery}&status=active`;
  const openQuotesHref = `/preview/quoted-requests?${custQuery}`;
  const lastOrderHref = `/preview/orders?${custQuery}&sort=recent`;
  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px", height: "fit-content", position: "sticky", top: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>Customer</div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--preview-chip-bg-strong)", color: "var(--preview-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800 }}>{initials || "?"}</div>
        <div>
          <Link
            href={crmHref}
            title="Click to open customer 360 profile"
            style={{ fontSize: "14px", fontWeight: 800, color: "var(--preview-text)", textDecoration: "none", cursor: "pointer", display: "inline-block" }}
          >
            {name || "New customer"} <span style={{ color: ACCENT, fontSize: "11px" }}>↗</span>
          </Link>
          <div>
            <span style={{ display: "inline-block", padding: "2px 8px", background: "#dcfce7", color: "#166534", fontSize: "10.5px", fontWeight: 700, borderRadius: "5px", marginTop: "2px" }}>Returning Customer <span style={{ color: GOLD }}>★</span></span>
          </div>
        </div>
      </div>

      <MiniField icon="🏢" label="Company" value="Cecile" />
      <MiniField icon="📞" label="Phone" value={phone || "—"} />
      <MiniField icon="✉" label="Email" value={email || "—"} />

      <div style={{ height: "1px", background: "var(--preview-border)", margin: "12px 0" }} />

      {/* NOTE: stats below are placeholder — real DB wiring needed (customer lifetime + orders) */}
      <MiniField icon="💰" label="Lifetime Sales" value="$148,250" valueColor="#16a34a" href={crmHref} tooltip="Click to see lifetime sales history" />
      <MiniField icon="📦" label="Active Orders" value="4" href={activeOrdersHref} tooltip="Click to see this customer's active orders" />
      <MiniField icon="📄" label="Open Quotes" value="2" href={openQuotesHref} tooltip="Click to see this customer's open quotes" />
      <MiniField icon="🕒" label="Last Order" value="5 days ago" href={lastOrderHref} tooltip="Click to open the most recent order" />
      <MiniField icon="💳" label="Preferred Payment" value="ACH" />
      <MiniField icon="👤" label="Sales Rep" value={salesRep || "—"} />

      <Link href={crmHref} style={{ display: "block", width: "100%", marginTop: "12px", padding: "8px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "var(--preview-text)", textDecoration: "none", textAlign: "center", boxSizing: "border-box" }}>↗ View Full Profile</Link>
    </div>
  );
}

function MiniField({ icon, label, value, valueColor, href, tooltip }: any) {
  const inner = (
    <>
      <span style={{ fontSize: "13px", opacity: 0.6 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: "12.5px", fontWeight: 700, color: valueColor || "var(--preview-text)" }}>
          {value}
          {href && <span style={{ color: ACCENT, fontSize: "10px", marginLeft: "4px" }}>↗</span>}
        </div>
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        title={tooltip || ""}
        style={{ padding: "6px 0", display: "flex", alignItems: "flex-start", gap: "8px", textDecoration: "none", color: "inherit", borderRadius: "6px" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div style={{ padding: "6px 0", display: "flex", alignItems: "flex-start", gap: "8px" }}>
      {inner}
    </div>
  );
}

// ─── STEP 1: Info ───────────────────────────────────────────
function Step1Info(props: any) {
  // Preview-only: role toggle isn't wired yet, so treat every SDR view as a mismatch to show the banner.
  const showRepMismatchBanner = props.currentUserRole === "SDR";
  // Sample "previous work" data — until real DB wiring is in place.
  const previousWork = [
    { ref: "QO-2026-172", product: "Roll Labels", total: "$2,100", status: "Won", statusColor: "#16a34a", date: "Mar 15, 2026" },
    { ref: "QO-2026-158", product: "Folding Cartons", total: "$8,450", status: "Won", statusColor: "#16a34a", date: "Feb 20, 2026" },
    { ref: "QO-2026-134", product: "Business Cards", total: "$340", status: "Lost", statusColor: "#dc2626", date: "Jan 8, 2026" },
  ];
  // Only Sales / Admin see the full history section.
  const canSeePreviousWork = props.currentUserRole === "Sales" || props.currentUserRole === "Admin" || props.currentUserRole === "SDR"; // shown as preview always

  return (
    <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "22px 26px" }}>
      {/* Quote reference header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid var(--preview-border)" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0, marginBottom: "4px" }}>Job Overview</h2>
          <div style={{ fontSize: "13px", color: "#666" }}>Tell us the basics about this quote so we can prepare everything perfectly.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Quote Reference</div>
          <div style={{ fontFamily: "monospace", fontSize: "18px", fontWeight: 800, color: GOLD, marginTop: "3px" }}>{props.quoteRefId}</div>
        </div>
      </div>

      <FieldWrap label="Quote Name" required>
        <input value={props.quoteName} onChange={e => props.setQuoteName(e.target.value)} placeholder="e.g. Trap Snacks Labels + Boxes" style={inp} maxLength={100} />
        <div style={{ textAlign: "right", fontSize: "10.5px", color: "#888", marginTop: "3px" }}>{props.quoteName.length} / 100</div>
      </FieldWrap>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <FieldWrap label="Priority">
          <div style={{ display: "flex", gap: "6px" }}>
            {(["Normal", "Rush", "Critical"] as const).map(p => (
              <button key={p} onClick={() => props.setPriority(p)} style={{
                flex: 1, padding: "8px 12px",
                background: props.priority === p ? (p === "Critical" ? "#fee2e2" : p === "Rush" ? "#fef3c7" : "#fef9c3") : "#fff",
                border: `1px solid ${props.priority === p ? (p === "Critical" ? "#dc2626" : p === "Rush" ? "#f59e0b" : GOLD) : "#e5e5e5"}`,
                color: props.priority === p ? (p === "Critical" ? "#dc2626" : "#171717") : "#333",
                borderRadius: "8px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer",
              }}>
                {p === "Normal" ? "✓" : p === "Rush" ? "⚡" : "⚠"} {p}
              </button>
            ))}
          </div>
        </FieldWrap>
        <FieldWrap label="Due Date">
          <input type="date" value={props.dueDate} onChange={e => props.setDueDate(e.target.value)} style={inp} />
        </FieldWrap>
      </div>

      <FieldWrap
        label={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span>Sales Rep</span>
            <span
              title={`This customer is assigned to ${props.salesRep}. Reps often have negotiated pricing with returning customers. SDRs cannot override the assigned rep — either get admin approval or route to the assigned rep.`}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", fontSize: "9.5px", fontWeight: 800, color: "var(--preview-text-muted)", cursor: "help" }}
            >
              i
            </span>
          </span>
        }
      >
        <select value={props.salesRep} onChange={e => props.setSalesRep(e.target.value)} style={inp}>
          <option>Ernesto</option><option>Maria Hakobyan</option><option>Manny Carlo</option><option>Gary Matevosyan</option>
        </select>
        {showRepMismatchBanner && (
          <div style={{ marginTop: "8px", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", fontSize: "11.5px", color: "#78350f", lineHeight: 1.5 }}>
            ⚠ This customer is assigned to <b>{props.salesRep}</b>. As an SDR, you'll need admin approval or route this quote to {props.salesRep} before it can be sent.
          </div>
        )}
      </FieldWrap>

      <FieldWrap label="Notes for Production" optional>
        <textarea value={props.notes} onChange={e => props.setNotes(e.target.value)} style={{ ...inp, minHeight: "90px", resize: "vertical", fontFamily: "inherit" }} maxLength={500} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px" }}>
          <span style={{ fontSize: "10.5px", color: "#888" }}>These notes will be visible to production team.</span>
          <span style={{ fontSize: "10.5px", color: "#888" }}>{props.notes.length} / 500</span>
        </div>
      </FieldWrap>

      {/* Previous work — collapsible, Sales/Admin only (preview always shows) */}
      {canSeePreviousWork && (
        <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid var(--preview-border)" }}>
          <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", marginBottom: "8px", fontStyle: "italic" }}>
            🔒 Visible to Sales &amp; Admin only — SDRs see this list ONLY for quotes they closed themselves.
          </div>
          <button
            onClick={() => props.setPreviousWorkOpen(!props.previousWorkOpen)}
            style={{ width: "100%", padding: "10px 14px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--preview-text)" }}
          >
            <span>📁 Previous work for {props.customerName || "this customer"} ({previousWork.length})</span>
            <span>{props.previousWorkOpen ? "▲" : "▼"}</span>
          </button>
          {props.previousWorkOpen && (
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {previousWork.map((row) => (
                <Link
                  key={row.ref}
                  href={`/preview/orders/${row.ref}`}
                  style={{ display: "grid", gridTemplateColumns: "120px 1fr 90px 70px 110px", gap: "10px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", textDecoration: "none", color: "var(--preview-text)", fontSize: "12.5px" }}
                >
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: ACCENT }}>{row.ref}</span>
                  <span style={{ fontWeight: 600 }}>{row.product}</span>
                  <span style={{ fontWeight: 700 }}>{row.total}</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: row.statusColor }}>{row.status}</span>
                  <span style={{ fontSize: "11px", color: "var(--preview-text-muted)", textAlign: "right" }}>{row.date}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── STEP 2: Line Items ───────────────────────────────────────
function Step2LineItems({ lineItems, setLineItems, categories, products, quoteType, setQuoteType, subtotal, previousOrdersCount, pastOrderBannerDismissed, setPastOrderBannerDismissed }: any) {
  // Show a "similar past order" heads-up whenever the customer has >2 prior orders.
  // Sample values shown until real order-history data is wired.
  const showSimilarOrderBanner = previousOrdersCount > 2 && !pastOrderBannerDismissed;
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const addLine = () => {
    setCollapsedIds(new Set(lineItems.map((l: LineItem) => l.id)));
    setLineItems([...lineItems, { id: `l${Date.now()}`, quantity: 1000, finishingIds: [], specialEffectIds: [] }]);
  };
  const duplicate = (id: string) => {
    const src = lineItems.find((l: LineItem) => l.id === id);
    if (!src) return;
    setCollapsedIds(new Set(lineItems.map((l: LineItem) => l.id)));
    setLineItems([...lineItems, { ...src, id: `l${Date.now()}`, unitPrice: undefined, extended: undefined, overrideEnabled: false, overrideUnitPrice: undefined, overrideExtended: undefined }]);
  };
  const remove = (id: string) => {
    setLineItems(lineItems.filter((l: LineItem) => l.id !== id));
    setCollapsedIds(s => { const n = new Set(s); n.delete(id); return n; });
  };
  const update = (id: string, patch: Partial<LineItem>) => setLineItems(lineItems.map((l: LineItem) => l.id === id ? { ...l, ...patch } : l));
  const toggleCollapse = (id: string) => setCollapsedIds(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
        {/* Quote type toggle */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>Quote Type</div>
            <div style={{ fontSize: "11.5px", color: "#888", marginTop: "2px" }}>
              {quoteType === "firm"
                ? "Firm — one price the customer accepts as-is"
                : "Comparison — variants of the same product; customer picks one, no grand total shown"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", background: "#f7f7f7", padding: "3px", borderRadius: "8px" }}>
            <button onClick={() => setQuoteType("firm")} style={{ padding: "6px 14px", background: quoteType === "firm" ? "#171717" : "transparent", color: quoteType === "firm" ? "#fff" : "#666", border: "none", borderRadius: "6px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Firm</button>
            <button onClick={() => setQuoteType("comparison")} style={{ padding: "6px 14px", background: quoteType === "comparison" ? "#171717" : "transparent", color: quoteType === "comparison" ? "#fff" : "#666", border: "none", borderRadius: "6px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>Comparison</button>
          </div>
        </div>

        {/* Similar past-order heads-up — sample data until real history wiring is in place */}
        {showSimilarOrderBanner && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <span style={{ fontSize: "16px", lineHeight: 1 }}>⚠</span>
            <div style={{ flex: 1, fontSize: "12.5px", color: "#78350f", lineHeight: 1.5 }}>
              <b>Heads up</b> — This customer ordered <b>"Roll Labels · Semi-Gloss Paper Label · 3×4" · 5,000 pcs"</b> on <b>Mar 15, 2026</b> for <b>$2,100 ($0.42/pc)</b>. Similar pricing recommended for consistency.
              <div style={{ fontSize: "10.5px", color: "#a16207", marginTop: "3px", fontStyle: "italic" }}>Sample data — real order-history wiring pending.</div>
            </div>
            <button
              onClick={() => setPastOrderBannerDismissed(true)}
              title="Dismiss"
              style={{ background: "transparent", border: "none", color: "#92400e", cursor: "pointer", fontSize: "16px", padding: "0 4px", lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Line Items */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "18px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "0.04em" }}>LINE ITEMS</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={btnLight}>↑ Import from Previous Quote</button>
              <button onClick={addLine} style={btnPrimarySmall}>+ Add Line Item ▾</button>
            </div>
          </div>

          {lineItems.map((line: LineItem, i: number) => (
            <LineItemEditor
              key={line.id}
              lineItem={line}
              index={i}
              categories={categories}
              products={products}
              onUpdate={(patch: any) => update(line.id, patch)}
              onDuplicate={() => duplicate(line.id)}
              onRemove={() => remove(line.id)}
              canRemove={lineItems.length > 1}
              collapsed={collapsedIds.has(line.id)}
              onToggleCollapse={() => toggleCollapse(line.id)}
            />
          ))}

          <button onClick={addLine} style={{ width: "100%", padding: "12px", background: "#fff", border: "1px dashed #e5e5e5", borderRadius: "8px", color: "#666", fontSize: "13px", fontWeight: 600, cursor: "pointer", marginTop: "10px" }}>+ Add Another Product</button>
        </div>
      </div>

      {/* Right: Quote Summary sticky */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", position: "sticky", top: "16px", height: "fit-content" }}>
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Quote Summary</div>
          <SumLine label="Subtotal" value={`$${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <SumLine label="Tax (0%)" value="$0.00" />
          <div style={{ height: "1px", background: "#f0f0f0", margin: "8px 0" }} />
          <SumLine label="Total" value={quoteType === "comparison" ? "See individual lines" : `$${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`} bold />

          <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #f0f0f0" }}>
            <div style={{ fontSize: "10.5px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: "6px" }}>Line Items</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
              <span>{lineItems.length} Item{lineItems.length !== 1 ? "s" : ""}</span>
              <span style={{ color: ACCENT, fontWeight: 700, cursor: "pointer" }}>View all →</span>
            </div>
          </div>
        </div>

        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Estimated Turnaround</div>
          <div style={{ fontSize: "16px", fontWeight: 800 }}>📅 Based on due date</div>
          <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>Production time</div>
        </div>

        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "12px 14px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#92400e", marginBottom: "4px" }}>💡 Tip</div>
          <div style={{ fontSize: "11.5px", color: "#78350f", lineHeight: 1.5 }}>Add more products or finishing options to get the most accurate pricing.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Product SVG mockup thumbnail ────────────────────
function ProductThumb({ subcategory }: { subcategory?: string | null }) {
  const s = subcategory || "";
  // Roll products → cylinder
  if (s === "labels-stickers" || s.startsWith("label-")) {
    return (
      <svg viewBox="0 0 80 60" width="80" height="60" role="img" aria-label="Roll">
        <ellipse cx="40" cy="18" rx="26" ry="8" fill="#fbbf24" stroke="var(--preview-border-strong)" />
        <path d="M14 18 L14 42 A26 8 0 0 0 66 42 L66 18" fill="#fef3c7" stroke="var(--preview-border-strong)" />
        <ellipse cx="40" cy="42" rx="26" ry="8" fill="none" stroke="var(--preview-border-strong)" />
        <ellipse cx="40" cy="30" rx="8" ry="3" fill="#171717" opacity="0.15" />
      </svg>
    );
  }
  // Boxes
  if (s === "packaging-boxes" || s === "packaging-supplies") {
    return (
      <svg viewBox="0 0 80 60" width="80" height="60" role="img" aria-label="Box">
        <polygon points="15,20 40,10 65,20 40,30" fill="#fff" stroke="var(--preview-border-strong)" />
        <polygon points="15,20 15,50 40,60 40,30" fill="#f7f7f7" stroke="var(--preview-border-strong)" />
        <polygon points="65,20 65,50 40,60 40,30" fill="#e5e5e5" stroke="var(--preview-border-strong)" />
      </svg>
    );
  }
  // Bags / pouches
  if (s === "bags-flexible-packaging") {
    return (
      <svg viewBox="0 0 80 60" width="80" height="60" role="img" aria-label="Pouch">
        <rect x="22" y="10" width="36" height="8" fill="#171717" opacity="0.2" />
        <path d="M20 18 L60 18 L58 55 L22 55 Z" fill="#fef3c7" stroke="var(--preview-border-strong)" />
        <line x1="30" y1="18" x2="30" y2="55" stroke="var(--preview-border-strong)" strokeDasharray="2,2" opacity="0.6" />
        <line x1="50" y1="18" x2="50" y2="55" stroke="var(--preview-border-strong)" strokeDasharray="2,2" opacity="0.6" />
      </svg>
    );
  }
  // Banners / signs
  if (s === "banners-signs" || s === "custom-vinyl-lettering") {
    return (
      <svg viewBox="0 0 80 60" width="80" height="60" role="img" aria-label="Banner">
        <rect x="8" y="18" width="64" height="24" fill="#fff" stroke="var(--preview-border-strong)" />
        <circle cx="12" cy="22" r="2" fill="var(--preview-border-strong)" />
        <circle cx="68" cy="22" r="2" fill="var(--preview-border-strong)" />
      </svg>
    );
  }
  // Trading cards
  if (s === "trading-cards" || s === "marketing-materials") {
    return (
      <svg viewBox="0 0 80 60" width="80" height="60" role="img" aria-label="Card">
        <rect x="24" y="10" width="32" height="44" rx="3" fill="#fff" stroke="var(--preview-border-strong)" />
        <rect x="28" y="14" width="24" height="14" fill="#fef3c7" />
      </svg>
    );
  }
  // Default
  return (
    <svg viewBox="0 0 80 60" width="80" height="60" role="img" aria-label="Product">
      <rect x="12" y="12" width="56" height="36" fill="#fff" stroke="var(--preview-border-strong)" />
      <line x1="12" y1="22" x2="68" y2="22" stroke="var(--preview-border)" />
    </svg>
  );
}
function isRollProduct(subcategory?: string | null) {
  const s = subcategory || "";
  return s === "labels-stickers" || s === "label-bag-combo" || s === "label-jar-combo" || s === "label-tube-combo";
}

// ─── Line Item Editor ────────────────────────────────
function LineItemEditor({ lineItem, index, categories, products, onUpdate, onDuplicate, onRemove, canRemove, collapsed, onToggleCollapse }: any) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [renamingName, setRenamingName] = useState(false);
  const [displayName, setDisplayName] = useState(`Line ${index + 1}`);

  // Filter products by chosen category
  const catProducts = useMemo(() => {
    const cat = categories.find((c: Category) => c.id === categoryId);
    if (!cat) return [];
    const catSubs: Record<string, string[]> = {
      "labels-stickers": ["labels-stickers"],
      "packaging-boxes": ["packaging-boxes", "packaging-supplies"],
      "bags-pouches": ["bags-flexible-packaging"],
      "banners-signs": ["banners-signs", "custom-vinyl-lettering", "fridge-magnets"],
      "marketing-materials": ["marketing-materials"],
      "trading-cards": ["trading-cards"],
      "wallpapers": ["wallpapers"],
      "combos": ["label-bag-combo", "label-jar-combo", "label-tube-combo"],
    };
    const subs = catSubs[categoryId] || [];
    return products.filter((p: Product) => subs.includes(p.subcategory ?? "")).sort((a: Product, b: Product) => a.name.localeCompare(b.name));
  }, [categoryId, products, categories]);

  const selectedProduct: Product | undefined = products.find((p: Product) => p.id === lineItem.productId);
  const availableMaterials = selectedProduct?.materials || [];
  const availableFinishing: number[] = (selectedProduct?.fields?.FINISHING as number[]) || [];
  const availableSpecialEffects: number[] = (selectedProduct?.fields?.SPECIAL_EFFECTS as number[]) || [];

  // Fetch price when relevant fields change
  useEffect(() => {
    if (!lineItem.productId || !lineItem.materialId || !lineItem.quantity) return;
    onUpdate({ pricingLoading: true, pricingError: undefined });
    fetch("/api/v1/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: lineItem.productId,
        materialId: lineItem.materialId,
        quantity: lineItem.quantity,
        finishingIds: lineItem.finishingIds,
        fields: {
          SPECIAL_EFFECTS: lineItem.specialEffectIds,
          SIDES: lineItem.sides,
          COLOR_MODE: lineItem.colorMode,
        },
        size: lineItem.widthIn && lineItem.heightIn ? { widthIn: lineItem.widthIn, heightIn: lineItem.heightIn } : undefined,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          onUpdate({
            unitPrice: data.unitPrice,
            extended: data.extended,
            quoteRefId: data.quoteRefId,
            frameTiersHash: data.frameTiersHash,
            pricingLoading: false,
            pricingError: undefined,
          });
        } else {
          onUpdate({ pricingLoading: false, pricingError: data.message || "Pricing failed" });
        }
      })
      .catch(e => onUpdate({ pricingLoading: false, pricingError: e.message }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItem.productId, lineItem.materialId, lineItem.quantity, JSON.stringify(lineItem.finishingIds), JSON.stringify(lineItem.specialEffectIds), lineItem.widthIn, lineItem.heightIn, lineItem.sides, lineItem.colorMode]);

  const toggleFinishing = (fid: number) => {
    const cur = lineItem.finishingIds || [];
    onUpdate({ finishingIds: cur.includes(fid) ? cur.filter((x: number) => x !== fid) : [...cur, fid] });
  };
  const toggleEffect = (eid: number) => {
    const cur = lineItem.specialEffectIds || [];
    onUpdate({ specialEffectIds: cur.includes(eid) ? cur.filter((x: number) => x !== eid) : [...cur, eid] });
  };

  // Collapsed summary strip — shown for prior line items once the user moves on to the next one.
  if (collapsed) {
    const sizeStr = lineItem.widthIn && lineItem.heightIn ? `${lineItem.widthIn}×${lineItem.heightIn}"` : null;
    const qtyStr = lineItem.quantity ? `${Number(lineItem.quantity).toLocaleString()} pcs` : null;
    const finCount = (lineItem.finishingIds?.length || 0) + (lineItem.specialEffectIds?.length || 0);
    const finStr = finCount > 0 ? `${finCount} finish${finCount === 1 ? "" : "es"}` : null;
    const priceShown = lineItem.overrideEnabled ? lineItem.overrideExtended : lineItem.extended;
    const artwork = lineItem.artworkFiles?.[0]?.name;
    return (
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "10px 14px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "6px", padding: "2px", lineHeight: 0, flexShrink: 0 }}>
          <div style={{ transform: "scale(0.55)", transformOrigin: "top left", width: "44px", height: "33px" }}>
            <ProductThumb subcategory={selectedProduct?.subcategory} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10.5px", fontWeight: 800, color: "var(--preview-text-muted)", letterSpacing: "0.05em" }}>LINE {index + 1}</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--preview-text)" }}>{lineItem.productName || displayName || "Untitled product"}</span>
            {lineItem.materialName && <span style={{ fontSize: "11.5px", color: "var(--preview-text-muted)" }}>· {lineItem.materialName}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", color: "var(--preview-text-muted)", flexWrap: "wrap" }}>
            {sizeStr && <span>{sizeStr}</span>}
            {qtyStr && <span>· {qtyStr}</span>}
            {lineItem.rollDirection && <span>· {lineItem.rollDirection}</span>}
            {finStr && <span>· {finStr}</span>}
            {artwork && <span title={artwork} style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· 📎 {artwork}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 800, color: lineItem.overrideEnabled ? ACCENT : "#16a34a" }}>
            {priceShown != null ? `$${Number(priceShown).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
          </div>
          {lineItem.overrideEnabled && <div style={{ fontSize: "9.5px", color: "#888" }}>overridden</div>}
        </div>
        <button onClick={onToggleCollapse} style={{ padding: "6px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", color: "var(--preview-text)" }}>✎ Edit</button>
        {canRemove && <button onClick={onRemove} style={{ padding: "6px 8px", background: "transparent", border: "1px solid #fca5a5", borderRadius: "6px", color: "#dc2626", fontSize: "12px", cursor: "pointer" }}>🗑</button>}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "14px 16px", marginBottom: "12px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "4px", lineHeight: 0 }}>
            <ProductThumb subcategory={selectedProduct?.subcategory} />
          </div>
          <span style={{ fontSize: "11px", fontWeight: 800, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>LINE {index + 1}</span>
          {renamingName
            ? <input autoFocus value={displayName} onChange={e => setDisplayName(e.target.value)} onBlur={() => setRenamingName(false)} onKeyDown={e => { if (e.key === "Enter") setRenamingName(false); }} style={{ ...inp, padding: "3px 8px", width: "180px" }} />
            : <span onClick={() => setRenamingName(true)} style={{ fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>{displayName} ✎</span>}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {selectedProduct && (
            <a
              href={`https://bazaarprinting.com/products/${slugify(selectedProduct.name)}`}
              target="_blank"
              rel="noreferrer"
              title={`Open ${selectedProduct.name} on bazaarprinting.com to double-check specs, pricing tiers, and options match the live site.`}
              style={{ padding: "5px 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", color: "#1e40af", textDecoration: "none" }}
            >↗ Verify on Bazaar site</a>
          )}
          <button onClick={onDuplicate} style={{ padding: "5px 10px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer" }}>⧉ Duplicate</button>
          {canRemove && <button onClick={onRemove} style={{ padding: "5px 8px", background: "#fff", border: "1px solid #fca5a5", borderRadius: "6px", color: "#dc2626", fontSize: "12px", cursor: "pointer" }}>🗑</button>}
        </div>
      </div>

      {/* Category → Product → Material → Quantity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
        <FieldWrap label="Category" required tight>
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); onUpdate({ productId: undefined, materialId: undefined }); }} style={inp}>
            <option value="">Select…</option>
            {categories.map((c: Category) => <option key={c.id} value={c.id}>{c.icon} {c.label} ({c.count})</option>)}
          </select>
        </FieldWrap>
        <FieldWrap label="Product" required tight>
          <select value={lineItem.productId || ""} onChange={e => {
            const p = products.find((x: Product) => x.id === Number(e.target.value));
            onUpdate({ productId: p?.id, productName: p?.name, materialId: undefined });
            if (p) setDisplayName(p.name);
          }} style={inp} disabled={!categoryId}>
            <option value="">{categoryId ? "Select product…" : "Pick category first"}</option>
            {catProducts.map((p: Product) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FieldWrap>
        <FieldWrap label="Material" required tight>
          <select value={lineItem.materialId || ""} onChange={e => {
            const m = availableMaterials.find((x: any) => x.id === Number(e.target.value));
            onUpdate({ materialId: m?.id, materialName: displayMaterialLabel(m) });
          }} style={inp} disabled={!selectedProduct}>
            <option value="">{selectedProduct ? "Select material…" : "Pick product first"}</option>
            {availableMaterials.map((m: any) => <option key={m.id} value={m.id}>{displayMaterialLabel(m)}</option>)}
          </select>
        </FieldWrap>
        <FieldWrap label="Quantity" required tight>
          <input type="number" value={lineItem.quantity} onChange={e => onUpdate({ quantity: Number(e.target.value) || 0 })} style={inp} />
        </FieldWrap>
      </div>

      {/* Size */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: "10px", marginBottom: "10px" }}>
        <FieldWrap label="Width (in)" tight>
          <input type="number" step="0.01" value={lineItem.widthIn ?? ""} onChange={e => onUpdate({ widthIn: Number(e.target.value) || undefined })} placeholder="e.g. 4.0" style={inp} />
        </FieldWrap>
        <FieldWrap label="Height (in)" tight>
          <input type="number" step="0.01" value={lineItem.heightIn ?? ""} onChange={e => onUpdate({ heightIn: Number(e.target.value) || undefined })} placeholder="e.g. 3.0" style={inp} />
        </FieldWrap>
        <FieldWrap label="Sides" tight>
          <select value={lineItem.sides || "S1"} onChange={e => onUpdate({ sides: e.target.value })} style={inp}>
            <option value="S1">Single Side</option>
            <option value="S2">Double Sided</option>
          </select>
        </FieldWrap>
        <FieldWrap label="Color Mode" tight>
          <select value={lineItem.colorMode || "CMYK"} onChange={e => onUpdate({ colorMode: e.target.value })} style={inp}>
            <option>CMYK</option>
            <option>Pantone</option>
          </select>
        </FieldWrap>
      </div>

      {/* Empty pouch/product-specific fields warning — these EXIST in the catalog but have no values yet.
          Surfaces the data quality gap so Hayk can flag it for Bazaar admin population. */}
      {selectedProduct && (() => {
        const fields = selectedProduct.fields || {};
        const emptyFields = ["GUSSET", "TEAR_NOTCH", "ZIPPER", "WINDOW", "CUSTOM_SIZE", "DOUBLE_SIDED", "DIE", "PERFORATION", "CONTAINER", "DESIGN_JOB_POSSIBLE"]
          .filter(k => k in fields && (fields as any)[k] == null);
        if (emptyFields.length === 0) return null;
        return (
          <div style={{ marginBottom: "10px", padding: "8px 12px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "6px", fontSize: "11.5px", color: "#78350f" }}>
            <b>⚠ Bazaar admin needs to populate these fields:</b> {emptyFields.join(" · ")} — defined in the product schema but no values on file.
          </div>
        );
      })()}

      {/* Finishing + Special Effects — 2 separate sections, side by side */}
      {(availableFinishing.length > 0 || availableSpecialEffects.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
          {availableFinishing.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#555", marginBottom: "6px" }}>Finishing / Lamination</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {availableFinishing.map(fid => {
                  const on = (lineItem.finishingIds || []).includes(fid);
                  return (
                    <label key={fid} onClick={() => toggleFinishing(fid)} style={{ padding: "5px 12px", background: on ? "#fef3c7" : "#fff", border: `1px solid ${on ? GOLD : "#e5e5e5"}`, borderRadius: "6px", fontSize: "12px", fontWeight: on ? 700 : 500, color: on ? "#78350f" : "#333", cursor: "pointer" }}>
                      <span style={{ marginRight: "4px" }}>{on ? "✓" : "☐"}</span>{finishLabel(fid)}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {availableSpecialEffects.length > 0 && (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#555", marginBottom: "6px" }}>Special Effects</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {availableSpecialEffects.map(eid => {
                  const on = (lineItem.specialEffectIds || []).includes(eid);
                  return (
                    <label key={eid} onClick={() => toggleEffect(eid)} style={{ padding: "5px 12px", background: on ? "#ede9fe" : "#fff", border: `1px solid ${on ? "#a78bfa" : "#e5e5e5"}`, borderRadius: "6px", fontSize: "12px", fontWeight: on ? 700 : 500, color: on ? "#5b21b6" : "#333", cursor: "pointer" }}>
                      <span style={{ marginRight: "4px" }}>{on ? "✓" : "☐"}</span>{effectLabel(eid)}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roll Specs — only for roll-based products (labels + combos) */}
      {isRollProduct(selectedProduct?.subcategory) && (
        <div style={{ marginBottom: "10px", padding: "10px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Roll Specs</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px", maxWidth: "260px" }}>
            <FieldWrap label="Roll Direction" tight>
              <select value={lineItem.rollDirection || ""} onChange={e => onUpdate({ rollDirection: e.target.value })} style={inp}>
                <option value="">Select…</option>
                <option>Top Out</option>
                <option>Bottom Out</option>
                <option>Left Out</option>
                <option>Right Out</option>
              </select>
            </FieldWrap>
          </div>
        </div>
      )}

      {/* Artwork uploader */}
      <div style={{ marginBottom: "10px", padding: "10px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Artwork</div>
          <select value={lineItem.designerName || ""} onChange={e => onUpdate({ designerName: e.target.value })} style={{ ...inp, width: "auto", padding: "5px 10px", fontSize: "11.5px" }}>
            <option value="">Designer: unassigned</option>
            <option>Naré</option>
            <option>Aramayis</option>
            <option>Client-provided</option>
          </select>
        </div>
        <label style={{ display: "block", padding: "16px", border: "1.5px dashed var(--preview-border-strong)", borderRadius: "8px", textAlign: "center", cursor: "pointer", background: "var(--preview-surface-2)" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--preview-text)" }}>📁 Drag &amp; drop artwork here</div>
          <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginTop: "3px" }}>or click to browse — PDF, AI, PNG, JPG</div>
          <input type="file" multiple style={{ display: "none" }} onChange={e => {
            if (!e.target.files) return;
            const added = Array.from(e.target.files).map(f => ({
              name: f.name,
              size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`,
            }));
            onUpdate({ artworkFiles: [...(lineItem.artworkFiles || []), ...added] });
            e.target.value = "";
          }} />
        </label>
        {lineItem.artworkFiles && lineItem.artworkFiles.length > 0 && (
          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {lineItem.artworkFiles.map((f: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", padding: "5px 8px", background: "var(--preview-surface-2)", borderRadius: "5px" }}>
                <span>📎</span>
                <span style={{ flex: 1, fontWeight: 600 }}>{f.name}</span>
                <span style={{ color: "var(--preview-text-muted)" }}>{f.size}</span>
                <button onClick={() => onUpdate({ artworkFiles: (lineItem.artworkFiles || []).filter((_: any, j: number) => j !== i) })} style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "13px" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comment + Pricing display (with team override) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "10px" }}>
        <FieldWrap label="Line Item Comment" tight optional>
          <input value={lineItem.comment || ""} onChange={e => onUpdate({ comment: e.target.value })} placeholder="Optional notes for this SKU..." style={inp} />
        </FieldWrap>
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <div style={{ fontSize: "10.5px", color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {lineItem.overrideEnabled ? "Override Unit Price" : "Estimated Price"}
            </div>
            <label style={{ fontSize: "10px", color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
              <input type="checkbox" checked={!!lineItem.overrideEnabled} onChange={e => onUpdate({ overrideEnabled: e.target.checked, overrideUnitPrice: e.target.checked ? lineItem.unitPrice : undefined, overrideExtended: e.target.checked ? lineItem.extended : undefined })} style={{ width: "12px", height: "12px" }} />
              Override
            </label>
          </div>
          {lineItem.overrideEnabled ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "16px", fontWeight: 800, color: ACCENT }}>$</span>
                <input type="number" step="0.0001" value={lineItem.overrideUnitPrice ?? ""} onChange={e => {
                  const v = Number(e.target.value) || 0;
                  onUpdate({ overrideUnitPrice: v, overrideExtended: (lineItem.quantity || 0) * v });
                }} style={{ ...inp, padding: "4px 8px", fontSize: "16px", fontWeight: 800, color: ACCENT, width: "120px" }} />
                <span style={{ fontSize: "10.5px", color: "#666" }}>/ unit</span>
              </div>
              <div style={{ fontSize: "11px", color: "#111", marginTop: "4px", fontWeight: 700 }}>
                = ${((lineItem.quantity || 0) * (lineItem.overrideUnitPrice || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
                <span style={{ fontWeight: 400, color: "#888" }}> ({(lineItem.quantity || 0).toLocaleString()} × ${(lineItem.overrideUnitPrice || 0).toFixed(4)})</span>
              </div>
              <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>
                was ${lineItem.extended?.toFixed(2) ?? "—"}
              </div>
              <input value={lineItem.overrideReason || ""} onChange={e => onUpdate({ overrideReason: e.target.value })} placeholder="Reason (optional): discount, negotiation..." style={{ ...inp, padding: "4px 8px", fontSize: "10.5px", marginTop: "4px" }} />
            </>
          ) : (
            <>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#16a34a" }}>
                {lineItem.pricingLoading
                  ? "Calculating…"
                  : lineItem.pricingError
                    ? <span style={{ color: "#dc2626", fontSize: "12px" }}>Error</span>
                    : lineItem.extended != null
                      ? `$${lineItem.extended.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
              </div>
              <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>
                {lineItem.unitPrice != null ? `$${lineItem.unitPrice.toFixed(4)} / unit` : "Fill in specs"}
              </div>
              {lineItem.extended != null && <div style={{ fontSize: "9.5px", color: "#b45309", fontStyle: "italic", marginTop: "3px" }}>⚠ Placeholder — real bazaarprinting.com pricing engine not wired yet</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STEP 3: Review ────────────────────────────────────────
function Step3Review(props: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Top row: Customer summary + Pricing summary + Fulfillment */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: "14px" }}>
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Customer</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px" }}>
            <div><b>Hayk Zohrabyan</b></div>
            <div style={{ color: "#666" }}>🏢 Cecile</div>
            <div style={{ color: "#666" }}>📞 (818) 927-7146</div>
            <div style={{ color: "#666" }}>✉ haykzoh@gmail.com</div>
          </div>
          <button style={{ width: "100%", marginTop: "12px", padding: "6px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>↗ View Full Profile</button>
        </div>

        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Pricing Summary</div>
          {props.quoteType === "comparison" ? (
            <div style={{ padding: "16px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "8px", fontSize: "12px", color: "#78350f", textAlign: "center", lineHeight: 1.6 }}>
              <b>Comparison quote</b><br />No grand total shown to customer. They pick a variant → we generate a firm quote.
            </div>
          ) : (
            <>
              <SumLine label="Subtotal" value={`$${props.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              <SumLine label="Shipping ⓘ" value={`$${props.shipping.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              <SumLine label="Discount ⓘ" value={props.discountAmount > 0 ? `− $${props.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"} />
              <SumLine label="Pre-tax Total" value={`$${props.preTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              <SumLine label={`Tax (${props.taxRate}%)`} value={props.taxExempt ? "Exempt" : `$${props.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              <div style={{ height: "1px", background: "#f0f0f0", margin: "8px 0" }} />
              <SumLine label="Total" value={`$${props.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`} bold />
            </>
          )}
        </div>

        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Fulfillment</div>
          <div style={{ display: "flex", gap: "6px", background: "#f7f7f7", padding: "3px", borderRadius: "8px", marginBottom: "14px" }}>
            <button onClick={() => props.setFulfillment("pickup")} style={{ flex: 1, padding: "8px", background: props.fulfillment === "pickup" ? GOLD : "transparent", color: props.fulfillment === "pickup" ? "#171717" : "#666", border: "none", borderRadius: "6px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>🏪 Pickup</button>
            <button onClick={() => props.setFulfillment("ship")} style={{ flex: 1, padding: "8px", background: props.fulfillment === "ship" ? GOLD : "transparent", color: props.fulfillment === "ship" ? "#171717" : "#666", border: "none", borderRadius: "6px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>🚚 Ship to customer</button>
          </div>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Estimated Turnaround</div>
          <div style={{ fontSize: "15px", fontWeight: 800 }}>📅 Based on due date</div>
          <div style={{ fontSize: "10.5px", color: "#888", marginTop: "2px" }}>Production time after artwork approval.</div>
        </div>
      </div>

      {/* Adjustments (with Valid For) */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>Adjustments</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr", gap: "12px" }}>
          <FieldWrap label="Tax Rate (%)" tight>
            <input type="number" step="0.01" value={props.taxRate} onChange={e => props.setTaxRate(Number(e.target.value))} style={inp} disabled={props.taxExempt} />
          </FieldWrap>
          <FieldWrap label="Discount" tight>
            <div style={{ display: "flex", gap: "4px" }}>
              {(["none", "percent", "flat"] as const).map(m => (
                <button key={m} onClick={() => props.setDiscountMode(m)} style={{
                  padding: "8px 12px",
                  background: props.discountMode === m ? "#fef3c7" : "#fff",
                  border: `1px solid ${props.discountMode === m ? GOLD : "#e5e5e5"}`,
                  color: "#171717",
                  borderRadius: "6px", fontSize: "12px", fontWeight: props.discountMode === m ? 700 : 500, cursor: "pointer",
                }}>{m === "none" ? "None" : m === "percent" ? "%" : "$"}</button>
              ))}
              <input type="number" step="0.01" value={props.discountValue} onChange={e => props.setDiscountValue(Number(e.target.value))} disabled={props.discountMode === "none"} style={{ ...inp, flex: 1 }} placeholder="0.00" />
            </div>
          </FieldWrap>
          <FieldWrap label="Valid for (days)" tight>
            <input type="number" value={props.validForDays} onChange={e => props.setValidForDays(Number(e.target.value) || 30)} style={inp} />
          </FieldWrap>
          <FieldWrap label="Tax" tight>
            <select value={props.taxExempt ? "Tax Exempt" : "Standard"} onChange={e => props.setTaxExempt(e.target.value === "Tax Exempt")} style={inp}>
              <option>Standard</option><option>Tax Exempt</option>
            </select>
          </FieldWrap>
        </div>
      </div>

      {/* Payment strategy */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>Payment Strategy</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          <StrategyCard active={props.paymentStrategy === "partial"} onClick={() => props.setPaymentStrategy("partial")} title="Partial payment" desc="Collect a deposit (% or fixed). Remainder can be paid via selected offline or online channels." />
          <StrategyCard active={props.paymentStrategy === "full"} onClick={() => props.setPaymentStrategy("full")} title="Pay in full" desc="Require 100% upfront before production. Order moves to production when payment clears." />
          <StrategyCard active={props.paymentStrategy === "netterms"} onClick={() => props.setPaymentStrategy("netterms")} title="$0 upfront / Net terms" desc="Start production without upfront payment. Reminders begin on the payment due date you select (10–60 days).">
            {props.paymentStrategy === "netterms" && (
              <div style={{ marginTop: "10px", padding: "10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px" }}>
                <div style={{ fontSize: "10.5px", color: "#78350f", fontWeight: 700, marginBottom: "4px" }}>Payment due in</div>
                <select value={props.netTermsDays} onChange={e => props.setNetTermsDays(Number(e.target.value))} style={{ ...inp, padding: "6px 10px" }}>
                  {[10, 15, 30, 45, 60].map(d => <option key={d} value={d}>{d} days from delivery</option>)}
                </select>
                <div style={{ marginTop: "6px", fontSize: "10.5px", color: "#166534" }}>✓ Tax Cert · ✓ 3+ orders · ✓ On-time payer</div>
              </div>
            )}
          </StrategyCard>
        </div>
        {props.paymentStrategy === "partial" && (
          <div style={{ marginTop: "10px", padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700 }}>Deposit</span>
            <input type="number" value={props.partialPct} onChange={e => props.setPartialPct(Number(e.target.value))} style={{ width: "80px", padding: "6px 10px", border: "1px solid var(--preview-border)", borderRadius: "6px" }} />
            <span>%</span>
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#78350f" }}>Customer pays <b>${(props.total * props.partialPct / 100).toFixed(2)}</b> now, <b>${(props.total * (1 - props.partialPct / 100)).toFixed(2)}</b> on delivery.</span>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", color: "#1e40af" }}>
        ℹ <b>With current settings:</b> Customer must confirm on the public quote link →{" "}
        {props.paymentStrategy === "full" ? `100% payment ($${props.total.toFixed(2)})` :
         props.paymentStrategy === "partial" ? `${props.partialPct}% deposit ($${(props.total * props.partialPct / 100).toFixed(2)})` :
         `Net ${props.netTermsDays} terms accepted`}
        {" "}→ production.
      </div>

      {/* Payment method */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Payment Method</div>
        <div style={{ fontSize: "11.5px", color: "#888", marginBottom: "10px" }}>Select one or more methods for full payment checkout.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
          {["Cash Terminal", "Wire", "ACH", "Zelle", "Check", "Card (online)"].map(m => {
            const on = props.paymentMethods.includes(m);
            return (
              <label key={m} onClick={() => props.setPaymentMethods(on ? props.paymentMethods.filter((x: string) => x !== m) : [...props.paymentMethods, m])} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", background: on ? "#fef3c7" : "#fff", border: `1px solid ${on ? GOLD : "#e5e5e5"}`, borderRadius: "8px", fontSize: "12px", fontWeight: on ? 700 : 500, cursor: "pointer" }}>
                <span style={{ width: "14px", height: "14px", border: `1.5px solid ${on ? GOLD : "#ccc"}`, borderRadius: "3px", background: on ? GOLD : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{on && <span style={{ color: "#171717", fontSize: "10px" }}>✓</span>}</span>
                {m}
              </label>
            );
          })}
        </div>
      </div>

      {/* Note to customer */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>Note to Customer (Optional)</div>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#666", cursor: "pointer" }}>
            <input type="checkbox" checked={props.includeRepSignature} onChange={e => props.setIncludeRepSignature(e.target.checked)} />
            Include my name as signature
          </label>
        </div>
        <textarea value={props.noteToCustomer} onChange={e => props.setNoteToCustomer(e.target.value)} maxLength={500} placeholder="Hey Luis, per our chat this AM — here's the quote for the folding cartons with UV. Let me know if you want to see a version without UV too." style={{ ...inp, minHeight: "80px", resize: "vertical", fontFamily: "inherit" }} />
        <div style={{ textAlign: "right", fontSize: "10.5px", color: "#888", marginTop: "3px" }}>{props.noteToCustomer.length} / 500</div>
      </div>

      {/* Attachments */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em" }}>Attachments</div>
          <label style={{ padding: "6px 12px", background: ACCENT, color: "#fff", borderRadius: "6px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>
            + Add file
            <input type="file" multiple style={{ display: "none" }} onChange={e => {
              if (!e.target.files) return;
              const added = Array.from(e.target.files).map(f => ({
                name: f.name,
                size: f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`,
                kind: f.type.startsWith("image") ? "image" : f.name.endsWith(".pdf") ? "pdf" : "file",
                included: true,
              }));
              props.setAttachments([...props.attachments, ...added]);
              e.target.value = "";
            }} />
          </label>
        </div>
        {props.attachments.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#aaa", fontSize: "12.5px", border: "1px dashed #ddd", borderRadius: "8px" }}>No attachments — files attached during line-item entry will show here.</div>
        ) : (
          <div style={{ fontSize: "11.5px", color: "#666", marginBottom: "8px" }}>{props.attachments.filter((a: any) => a.included).length} files will be included with this quote:</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {props.attachments.map((f: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: f.included ? "var(--preview-surface-2)" : "#fff", border: "1px solid var(--preview-border)", borderRadius: "6px", opacity: f.included ? 1 : 0.5 }}>
              <span>{f.kind === "pdf" ? "📄" : f.kind === "image" ? "🖼" : "📎"}</span>
              <span style={{ flex: 1, fontSize: "12px", fontWeight: 600 }}>{f.name}</span>
              <span style={{ fontSize: "10.5px", color: "#888" }}>{f.size}</span>
              <label style={{ fontSize: "11px", color: "#666", cursor: "pointer" }}>
                <input type="checkbox" checked={f.included} onChange={() => props.setAttachments(props.attachments.map((a: any, j: number) => j === i ? { ...a, included: !a.included } : a))} /> Include
              </label>
              <button onClick={() => props.setAttachments(props.attachments.filter((_: any, j: number) => j !== i))} style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Send quote via */}
      <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "16px 18px" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Send Quote Via</div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", cursor: "pointer" }}>
          <input type="checkbox" checked={props.noNotification} onChange={e => props.setNoNotification(e.target.checked)} />
          <div>
            <div style={{ fontSize: "12.5px", fontWeight: 700 }}>No customer notification</div>
            <div style={{ fontSize: "11px", color: "#888" }}>Quote is saved and the public link stays active, but no email or SMS is sent.</div>
          </div>
        </label>
        {!props.noNotification && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "12px", marginBottom: "10px" }}>
              <FieldWrap label="Channel" tight>
                <select value={props.channel} onChange={e => props.setChannel(e.target.value)} style={inp}>
                  <option>Email</option><option>SMS</option><option>Both</option>
                </select>
              </FieldWrap>
              <FieldWrap label="Recipients" tight>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {props.recipients.map((r: any, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "13px" }}>✉</span>
                      <input value={r.email} onChange={e => props.setRecipients(props.recipients.map((x: any, j: number) => j === i ? { ...x, email: e.target.value } : x))} style={{ ...inp, flex: 1, padding: "6px 10px" }} />
                      {r.primary && <span style={{ fontSize: "10px", color: "#666", padding: "2px 6px", background: "#f5f5f5", borderRadius: "4px", fontWeight: 700 }}>PRIMARY</span>}
                      {!r.primary && <button onClick={() => props.setRecipients(props.recipients.filter((_: any, j: number) => j !== i))} style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer" }}>✕</button>}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: "6px", marginTop: "3px" }}>
                    <input value={props.newRecipient} onChange={e => props.setNewRecipient(e.target.value)} placeholder="add another email..." style={{ ...inp, flex: 1, padding: "6px 10px" }} onKeyDown={e => { if (e.key === "Enter" && props.newRecipient.includes("@")) { props.setRecipients([...props.recipients, { email: props.newRecipient, primary: false }]); props.setNewRecipient(""); } }} />
                    <button onClick={() => { if (props.newRecipient.includes("@")) { props.setRecipients([...props.recipients, { email: props.newRecipient, primary: false }]); props.setNewRecipient(""); } }} style={btnLightSmall}>+ Add</button>
                  </div>
                </div>
              </FieldWrap>
            </div>
            {(props.channel === "SMS" || props.channel === "Both") && (
              <FieldWrap label="Send SMS to" tight>
                <input value={props.alsoSmsTo} onChange={e => props.setAlsoSmsTo(e.target.value)} style={inp} />
              </FieldWrap>
            )}
            <div style={{ padding: "10px 14px", background: "#dcfce7", border: "1px solid #86efac", borderRadius: "8px", marginTop: "10px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#166534" }}>✓ Customer will receive the quote link via {props.channel} with a secure checkout.</div>
              <div style={{ fontSize: "11px", color: "#166534", marginTop: "3px" }}>They can view, approve, and pay directly from their phone.</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modals ────────────────────────────────────────
function PreviewModal({ onClose, quoteRefId, quoteType, noteToCustomer, lineItems, total, validForDays }: any) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "14px", width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto", padding: "40px 48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>PREVIEW · CUSTOMER VIEW</div>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: "50%", width: "28px", height: "28px", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "12px", color: "#666" }}>Quote from Bazaar Printing</div>
          <div style={{ fontSize: "24px", fontWeight: 800, marginTop: "6px", fontFamily: "monospace" }}>{quoteRefId}</div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>Valid for {validForDays} days</div>
        </div>
        {noteToCustomer && <div style={{ padding: "12px 16px", background: "#fffbeb", borderRadius: "8px", marginBottom: "20px", fontSize: "13px", lineHeight: 1.6 }}>{noteToCustomer}</div>}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "20px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #171717" }}>
              <th style={{ textAlign: "left", padding: "8px 0" }}>Product</th>
              <th style={{ textAlign: "right", padding: "8px 0" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "8px 0" }}>{quoteType === "comparison" ? "Your price" : "Total"}</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((l: LineItem, i: number) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "10px 0" }}>
                  {quoteType === "comparison" && <div style={{ fontSize: "10px", color: "#888", fontWeight: 700 }}>Option {String.fromCharCode(65 + i)}</div>}
                  <div style={{ fontWeight: 700 }}>{l.productName || "—"}</div>
                  <div style={{ fontSize: "11px", color: "#888" }}>{l.materialName || ""}</div>
                </td>
                <td style={{ textAlign: "right", padding: "10px 0", fontWeight: 700 }}>{l.quantity.toLocaleString()}</td>
                <td style={{ textAlign: "right", padding: "10px 0", fontWeight: 800 }}>{l.extended != null ? `$${l.extended.toFixed(2)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
          {quoteType === "firm" && (
            <tfoot>
              <tr>
                <td colSpan={2} style={{ textAlign: "right", padding: "12px 0", fontSize: "14px", fontWeight: 800 }}>Total</td>
                <td style={{ textAlign: "right", padding: "12px 0", fontSize: "18px", fontWeight: 800, color: "#16a34a" }}>${total.toFixed(2)} USD</td>
              </tr>
            </tfoot>
          )}
        </table>
        {quoteType === "comparison" ? (
          <div style={{ padding: "16px", background: "#eff6ff", borderRadius: "8px", textAlign: "center", fontSize: "12.5px", color: "#1e40af" }}>
            Pick the option that works for you above — we'll send a firm quote for your choice.
          </div>
        ) : (
          <button style={{ width: "100%", padding: "16px", background: ACCENT, color: "#fff", border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: 800 }}>Approve & Pay ${total.toFixed(2)}</button>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────
function FieldWrap({ label, children, required, optional, tight }: any) {
  return (
    <div style={{ marginBottom: tight ? "0" : "14px" }}>
      <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#555", marginBottom: "5px" }}>
        {label} {required && <span style={{ color: "#dc2626" }}>*</span>}
        {optional && <span style={{ color: "#aaa", fontWeight: 400 }}> (Optional)</span>}
      </label>
      {children}
    </div>
  );
}
function StrategyCard({ active, onClick, title, desc, children }: any) {
  return (
    <div onClick={onClick} style={{ background: active ? "#fef3c7" : "#fff", border: `2px solid ${active ? GOLD : "#e5e5e5"}`, borderRadius: "10px", padding: "12px 14px", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
        <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${active ? GOLD : "#ccc"}`, background: active ? GOLD : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{active && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#171717" }} />}</span>
        <span style={{ fontSize: "13px", fontWeight: 800 }}>{title}</span>
      </div>
      <div style={{ fontSize: "11.5px", color: "#666", lineHeight: 1.5 }}>{desc}</div>
      {children}
    </div>
  );
}
function SumLine({ label, value, bold }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: bold ? "15px" : "13px", fontWeight: bold ? 800 : 500 }}>
      <span style={{ color: bold ? "#171717" : "#666" }}>{label}</span>
      <span style={{ color: bold ? "#16a34a" : "#171717" }}>{value}</span>
    </div>
  );
}
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { padding: "9px 18px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "9px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const btnPrimarySmall: React.CSSProperties = { padding: "6px 12px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" };
const btnLight: React.CSSProperties = { padding: "9px 14px", background: "#fff", color: "#333", border: "1px solid var(--preview-border)", borderRadius: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
const btnLightSmall: React.CSSProperties = { padding: "6px 12px", background: "#fff", color: "#333", border: "1px solid var(--preview-border)", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer" };
const backBtn: React.CSSProperties = { padding: "8px 12px", background: "transparent", border: "none", color: "#666", fontSize: "13px", fontWeight: 600, cursor: "pointer" };
