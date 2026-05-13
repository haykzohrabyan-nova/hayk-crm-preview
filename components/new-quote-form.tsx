"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  Zap,
  ChevronDown,
  User,
  Phone,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { computePricing, formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { LinkedLeadCard } from "@/components/ui/linked-lead-card";
import { createClient } from "@/lib/supabase/client";
import { DatePicker } from "@/components/ui/date-picker";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadInfo {
  id: string;
  status: string | null;
  sales_status: string | null;
  urgency: string | null;
  initial_interest: string | null;
  source: string | null;
  sdr_comment: string | null;
  is_returning_customer: boolean;
  interests: Record<string, boolean>;
  quantities: Record<string, string | number>;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
    industry: string | null;
    website: string | null;
  } | null;
}

interface ProductType {
  id: string;
  name: string;
  material_groups: {
    group: { id: string; name: string };
    materials: { id: string; name: string }[];
  }[];
}

interface CompanySettings {
  default_tax_rate: number | null;
  high_value_threshold: number | null;
}

type Tab = "customer" | "info" | "lines" | "quote";

const TABS: { id: Tab; label: string }[] = [
  { id: "customer", label: "Customer" },
  { id: "info", label: "Info" },
  { id: "lines", label: "Line Items" },
  { id: "quote", label: "Quote" },
];

type LookupOption = { value: string; label: string };
type SkuLookups = {
  lamination: LookupOption[];
  color_mode: LookupOption[];
  sides: LookupOption[];
  roll_direction: LookupOption[];
  finishing: LookupOption[];
};
type QuoteLookups = {
  ticket_priority: LookupOption[];
  quote_channel: LookupOption[];
  ticket_payment: LookupOption[];
  follow_up_freq: LookupOption[];
};

/**
 * Renders <option> elements for a lookup select.
 * If the currently saved value is no longer in the active list (deactivated or
 * hard-deleted by admin) it is re-injected so the select still shows the
 * correct value and the data is never silently wiped on save.
 * The option's HTML value stays as the original label so it keeps matching
 * the stored string; only the visible text shows "(inactive)".
 */
function renderLookupOptions(
  opts: LookupOption[],
  currentLabel: string | undefined,
): React.ReactElement[] {
  const activeSet = new Set(opts.map((o) => o.label));
  const nodes = opts.map((o) => (
    <option key={o.value} value={o.label}>{o.label}</option>
  ));
  if (currentLabel && !activeSet.has(currentLabel)) {
    nodes.push(
      <option key="__inactive__" value={currentLabel}>{currentLabel} (inactive)</option>
    );
  }
  return nodes;
}

function emptySkuRow(): QuoteSku {
  return {
    product_type: "",
    material: "",
    lamination: "None",
    width: undefined,
    height: undefined,
    quantity: undefined,
    unit_price: undefined,
    design_required: false,
    die_cut: false,
    spot_uv: false,
    foil: false,
    perforation: false,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewQuoteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get("lead_id");
  const hasCustomerParams = !!(searchParams.get("first_name") || searchParams.get("email") || searchParams.get("phone"));
  // Skip the Customer tab when context is already provided (lead or CRM customer)
  const skipCustomerTab = !!(leadId || hasCustomerParams);

  const [tab, setTab] = useState<Tab>(skipCustomerTab ? "info" : "customer");
  const [lead, setLead] = useState<LeadInfo | null>(null);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [companyCfg, setCompanyCfg] = useState<CompanySettings>({ default_tax_rate: null, high_value_threshold: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ── Current user role (to enforce high-value threshold for SDRs) ─────────
  const [userRole, setUserRole] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      if (uid) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("roles(name)")
          .eq("id", uid)
          .single();
        const roleName = (profile?.roles as unknown as { name: string } | null)?.name ?? null;
        setUserRole(roleName);
      }
    });
  }, []);

  // ── High-value threshold modal ───────────────────────────────────────────
  const [hvModal, setHvModal] = useState(false);
  const [hvCountdown, setHvCountdown] = useState(30);
  const hvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a stable ref to handleSave so the interval always calls the latest version
  const handleSaveRef = useRef<((status: "draft" | "sent" | "routed") => Promise<void>) | null>(null);

  // ── Customer step fields (pre-fill from CRM query params if present) ────────
  const [contactFirstName, setContactFirstName] = useState(searchParams.get("first_name") ?? "");
  const [contactLastName, setContactLastName] = useState(searchParams.get("last_name") ?? "");
  const [contactEmail, setContactEmail] = useState(searchParams.get("email") ?? "");
  const [contactPhone, setContactPhone] = useState(searchParams.get("phone") ?? "");
  const [contactCompany, setContactCompany] = useState(searchParams.get("company") ?? "");

  // ── Info tab fields ──────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [dueDate, setDueDate] = useState("");
  const [rush, setRush] = useState(false);
  const [orderSource, setOrderSource] = useState<"quoted" | "direct">("quoted");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [notes, setNotes] = useState("");

  // ── Line Items ────────────────────────────────────────────────────────────
  const [skus, setSkus] = useState<QuoteSku[]>([emptySkuRow()]);

  // ── Quote tab fields ──────────────────────────────────────────────────────
  const [shipping, setShipping] = useState(0);
  const [discountType, setDiscountType] = useState<"percent" | "fixed" | "">("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [taxExempt, setTaxExempt] = useState(false);
  const [salesPermit, setSalesPermit] = useState("");
  const [paymentTypes, setPaymentTypes] = useState<string[]>(["Card Payment"]);
  const [prepayType, setPrepayType] = useState<"percent" | "fixed">("percent");
  const [prepayValue, setPrepayValue] = useState("25");
  const [quoteChannel, setQuoteChannel] = useState("Email");
  const [quoteDestination, setQuoteDestination] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [followUpCycles, setFollowUpCycles] = useState(3);
  const [followUpFreq, setFollowUpFreq] = useState("Every 2 days");

  // ─── Load lead + products + company settings ────────────────────────────

  const fetchLead = useCallback(() => {
    if (!leadId) return;
    fetch(`/api/leads/${leadId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.lead) {
          const l: LeadInfo = d.lead;
          setLead(l);
          // Pre-fill destination from lead contact on first load only
          setQuoteDestination((prev) => prev || l.customer?.email || "");
        }
      })
      .catch(() => {});
  }, [leadId]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  // Silently refresh lead card if lead is updated elsewhere (another tab / another user)
  useEffect(() => {
    window.addEventListener("bazaar:leads-changed", fetchLead);
    return () => window.removeEventListener("bazaar:leads-changed", fetchLead);
  }, [fetchLead]);

  const [skuLookups, setSkuLookups] = useState<SkuLookups>({
    lamination: [], color_mode: [], sides: [], roll_direction: [], finishing: [],
  });
  const [quoteLookups, setQuoteLookups] = useState<QuoteLookups>({
    ticket_priority: [], quote_channel: [], ticket_payment: [], follow_up_freq: [],
  });

  useEffect(() => {
    fetch("/api/lookups/products")
      .then((r) => r.json())
      .then((d) => { if (d.products) setProducts(d.products); })
      .catch(() => {});

    fetch("/api/lookups?categories=lamination,color_mode,sides,roll_direction,finishing,ticket_priority,quote_channel,ticket_payment,follow_up_freq")
      .then((r) => r.json())
      .then((d: Record<string, LookupOption[]>) => {
        setSkuLookups({
          lamination:     d.lamination     ?? [],
          color_mode:     d.color_mode     ?? [],
          sides:          d.sides          ?? [],
          roll_direction: d.roll_direction ?? [],
          finishing:      d.finishing      ?? [],
        });
        setQuoteLookups({
          ticket_priority: d.ticket_priority ?? [],
          quote_channel:   d.quote_channel   ?? [],
          ticket_payment:  d.ticket_payment  ?? [],
          follow_up_freq:  d.follow_up_freq  ?? [],
        });
      })
      .catch(() => {});

    fetch("/api/admin/company")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setCompanyCfg(d.settings);
          if (d.settings.default_tax_rate != null) setTaxRate(d.settings.default_tax_rate);
        }
      })
      .catch(() => {});
  }, []);

  // ─── SKU helpers ─────────────────────────────────────────────────────────

  const updateSku = useCallback((idx: number, field: keyof QuoteSku, value: unknown) => {
    setFieldErrors((e) => ({ ...e, lineItems: "" }));
    setSkus((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [field]: value };
      // Auto-derive description from productType + material + lamination (shadow project rule)
      const parts = [updated.product_type, updated.material, updated.lamination !== "None" ? updated.lamination : ""].filter(Boolean);
      updated.description = parts.join(" – ");
      return updated;
    }));
  }, []);

  const removeSku = useCallback((idx: number) => {
    setSkus((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addSku = useCallback(() => {
    setSkus((prev) => [...prev, emptySkuRow()]);
  }, []);

  // ─── Pricing ─────────────────────────────────────────────────────────────

  const pricing = computePricing({
    skus,
    quote_shipping: shipping,
    discount_type: discountType || null,
    discount_value: discountValue || null,
    quote_tax_rate_percent: taxExempt ? 0 : taxRate,
    tax_exempt: taxExempt,
  });

  // ─── Save ─────────────────────────────────────────────────────────────────

  function validateAndAdvance(nextTab: Tab) {
    const errors: Record<string, string> = {};

    if (tab === "customer") {
      if (!contactFirstName.trim() && !contactLastName.trim()) {
        errors.customerName = "Please enter the customer's name.";
      }
      if (!contactEmail.trim() && !contactPhone.trim()) {
        errors.customerContact = "Please provide an email or phone number.";
      }
    }

    if (tab === "info") {
      if (!title.trim()) {
        errors.title = "A title is required.";
      }
    }

    if (tab === "lines") {
      const hasFullItem = skus.some(
        (s) => s.product_type?.trim() && (s.quantity ?? 0) > 0 && (s.unit_price ?? 0) > 0
      );
      if (!hasFullItem) {
        errors.lineItems = "Please fill in at least one complete line item (product, quantity, and unit price).";
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) {
      setFieldErrors({});

      // High-value threshold check: block SDR from entering the Quote tab
      if (
        nextTab === "quote" &&
        userRole === "sdr" &&
        companyCfg.high_value_threshold != null &&
        pricing.final_total > companyCfg.high_value_threshold
      ) {
        setHvCountdown(30);
        setHvModal(true);
        // Start countdown
        if (hvTimerRef.current) clearInterval(hvTimerRef.current);
        hvTimerRef.current = setInterval(() => {
          setHvCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(hvTimerRef.current!);
              hvTimerRef.current = null;
              // Call outside state updater to avoid React purity violation
              setTimeout(() => handleSaveRef.current?.("routed"), 0);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        return;
      }

      setTab(nextTab);
    }
  }

  async function handleSave(status: "draft" | "sent" | "routed") {
    // Keep the ref current so the HV countdown timer can always call the latest version
    handleSaveRef.current = handleSave;

    if (!title.trim()) {
      setError("Please add a title before saving.");
      setTab("info");
      return;
    }

    const hasFilledItem = skus.some((s) => s.product_type?.trim());
    if (!hasFilledItem) {
      setError("Please add at least one line item before saving.");
      setTab("lines");
      return;
    }

    setSaving(true);
    setError(null);

    const contactName = `${contactFirstName} ${contactLastName}`.trim();

    const body = {
      ticket_kind: "quote",
      ticket_status: status,
      title: title.trim(),
      linked_lead_id: leadId ?? undefined,
      customer_id: lead?.customer?.id ?? undefined,
      contact_name: contactName || (lead?.customer
        ? `${lead.customer.first_name ?? ""} ${lead.customer.last_name ?? ""}`.trim()
        : undefined),
      contact_email: contactEmail || lead?.customer?.email || undefined,
      contact_company: contactCompany || lead?.customer?.company || undefined,
      contact_phone: contactPhone || lead?.customer?.phone || undefined,
      quote_skus: skus,
      notes: notes || undefined,
      order_source: orderSource,
      priority,
      due_date: dueDate || undefined,
      rush,
      design_required: skus.some((s) => s.design_required),
      die_cut: skus.some((s) => s.die_cut),
      special_requirements: specialRequirements || undefined,
      quote_channel: quoteChannel,
      quote_destination: quoteDestination,
      quote_subtotal: pricing.subtotal,
      quote_shipping: shipping,
      discount_type: discountType || undefined,
      discount_value: discountValue || undefined,
      discount_reason: discountReason || undefined,
      quote_pre_tax_total: pricing.pre_tax_total,
      quote_tax_rate_percent: taxRate,
      quote_tax_amount: pricing.tax_amount,
      quote_final_total: pricing.final_total,
      tax_exempt: taxExempt,
      sales_permit_number: salesPermit || undefined,
      quote_payment_types: paymentTypes,
      prepayment_type: prepayType,
      prepayment_value: prepayValue,
      quote_reminder_date: reminderDate || undefined,
      follow_up_cycles: followUpCycles,
      follow_up_frequency: followUpFreq,
    };

    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save quote.");
        setSaving(false);
        return;
      }
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
      // Draft → back to list so user can see it in the queue
      // Sent  → open the detail page for immediate follow-up
      router.push("/quotes");
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  // ─── Payment toggle ───────────────────────────────────────────────────────

  function togglePayment(opt: string) {
    setPaymentTypes([opt]);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}
    >
      {/* ── Header ── */}
      <div
        className="sticky top-0 z-10 border-b flex items-center gap-3 px-6 py-4"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity"
          style={{ color: "var(--color-text-muted)" }}
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <div
          className="w-px h-5"
          style={{ background: "var(--color-border)" }}
        />
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          New Quote
        </h1>
        {title && (
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            — {title}
          </span>
        )}
      </div>

      <div className="w-full px-6 py-6 flex gap-6">

        {/* ── Left: Lead Info Card ── */}
        {lead && (
          <aside className="w-72 shrink-0">
            <LinkedLeadCard lead={lead} title="Lead Info" />
          </aside>
        )}

        {/* ── Left: CRM Customer Card (read-only, when arriving from CRM) ── */}
        {!lead && hasCustomerParams && (
          <aside className="w-72 shrink-0">
            <div
              className="rounded-xl p-5 sticky top-24"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-text-muted)" }}>
                Customer
              </h3>
              <div className="space-y-3">
                {(contactFirstName || contactLastName) && (
                  <div className="flex items-start gap-2">
                    <User size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {[contactFirstName, contactLastName].filter(Boolean).join(" ")}
                      </p>
                      {contactCompany && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{contactCompany}</p>
                      )}
                    </div>
                  </div>
                )}
                {contactPhone && (
                  <a href={`tel:${contactPhone}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                    <Phone size={14} style={{ color: "var(--color-text-muted)" }} />
                    <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{contactPhone}</span>
                  </a>
                )}
                {contactEmail && (
                  <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                    <Mail size={14} style={{ color: "var(--color-text-muted)" }} />
                    <span className="text-sm break-all" style={{ color: "var(--color-text-primary)" }}>{contactEmail}</span>
                  </a>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* ── Right: Form ── */}
        <div className="flex-1 min-w-0">
          {/* Error banner */}
          {error && (
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-3 mb-4 text-sm"
              style={{
                background: "var(--color-danger-bg)",
                color: "var(--color-danger)",
                border: "1px solid var(--color-danger-border)",
              }}
            >
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          {/* Tabs */}
          <div
            className="flex border-b mb-6"
            style={{ borderColor: "var(--color-border)" }}
          >
            {TABS.filter((t) => !(skipCustomerTab && t.id === "customer")).map((t, i) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-sm font-medium transition-colors relative"
                style={{
                  color: tab === t.id ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
                  fontWeight: tab === t.id ? 500 : 400,
                }}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{
                      background: tab === t.id ? "var(--color-accent)" : "var(--color-neutral-bg)",
                      color: tab === t.id ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
                    }}
                  >
                    {i + 1}
                  </span>
                  {t.label}
                </span>
                {tab === t.id && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                    style={{ background: "var(--color-tab-underline)" }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div
            className="rounded-xl p-6"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            {tab === "customer" && (
              <CustomerTab
                firstName={contactFirstName} setFirstName={(v) => { setContactFirstName(v); setFieldErrors((e) => ({ ...e, customerName: "", customerContact: "" })); }}
                lastName={contactLastName} setLastName={(v) => { setContactLastName(v); setFieldErrors((e) => ({ ...e, customerName: "" })); }}
                email={contactEmail} setEmail={(v) => { setContactEmail(v); setFieldErrors((e) => ({ ...e, customerContact: "" })); }}
                phone={contactPhone} setPhone={(v) => { setContactPhone(v); setFieldErrors((e) => ({ ...e, customerContact: "" })); }}
                company={contactCompany} setCompany={setContactCompany}
                errors={fieldErrors}
              />
            )}

            {tab === "info" && (
              <InfoTab
                title={title} setTitle={(v) => { setTitle(v); setFieldErrors((e) => ({ ...e, title: "" })); }}
                priority={priority} setPriority={setPriority}
                dueDate={dueDate} setDueDate={setDueDate}
                rush={rush} setRush={setRush}
                specialRequirements={specialRequirements} setSpecialRequirements={setSpecialRequirements}
                notes={notes} setNotes={setNotes}
                priorityOpts={quoteLookups.ticket_priority}
                titleError={fieldErrors.title}
              />
            )}

            {tab === "lines" && (
              <LineItemsTab
                skus={skus}
                products={products}
                skuLookups={skuLookups}
                onUpdate={updateSku}
                onRemove={removeSku}
                onAdd={addSku}
                error={fieldErrors.lineItems}
              />
            )}

            {tab === "quote" && (
              <QuoteTab
                pricing={pricing}
                orderSource={orderSource} setOrderSource={setOrderSource}
                shipping={shipping} setShipping={setShipping}
                discountType={discountType} setDiscountType={setDiscountType}
                discountValue={discountValue} setDiscountValue={setDiscountValue}
                discountReason={discountReason} setDiscountReason={setDiscountReason}
                taxRate={taxRate} setTaxRate={setTaxRate}
                taxExempt={taxExempt} setTaxExempt={setTaxExempt}
                salesPermit={salesPermit} setSalesPermit={setSalesPermit}
                paymentTypes={paymentTypes} togglePayment={togglePayment}
                prepayType={prepayType} setPrepayType={setPrepayType}
                prepayValue={prepayValue} setPrepayValue={setPrepayValue}
                quoteChannel={quoteChannel} setQuoteChannel={setQuoteChannel}
                quoteDestination={quoteDestination} setQuoteDestination={setQuoteDestination}
                reminderDate={reminderDate} setReminderDate={setReminderDate}
                followUpCycles={followUpCycles} setFollowUpCycles={setFollowUpCycles}
                followUpFreq={followUpFreq} setFollowUpFreq={setFollowUpFreq}
                channelOpts={quoteLookups.quote_channel}
                paymentOpts={quoteLookups.ticket_payment}
                followUpFreqOpts={quoteLookups.follow_up_freq}
              />
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between mt-6">
            <div className="flex gap-2">
              {/* Back button: hide when on customer tab, and hide on info tab if arriving from CRM */}
              {tab !== "customer" && !(skipCustomerTab && tab === "info") && (
                <button
                  onClick={() => {
                    setFieldErrors({});
                    if (tab === "quote") setTab("lines");
                    else if (tab === "lines") setTab("info");
                    else setTab("customer");
                  }}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md border transition-opacity hover:opacity-70"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-muted)",
                    background: "var(--color-surface)",
                  }}
                >
                  <ChevronLeft size={14} /> Back
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => router.back()}
                className="px-4 py-2 text-sm font-medium rounded-md border transition-opacity hover:opacity-70"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-muted)",
                  background: "var(--color-surface)",
                }}
              >
                Cancel
              </button>

              {tab !== "quote" && (
                <button
                  onClick={() => validateAndAdvance(tab === "customer" ? "info" : tab === "info" ? "lines" : "quote")}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80"
                  style={{
                    background: "var(--color-btn-verify-bg)",
                    color: "var(--color-btn-verify-text)",
                  }}
                >
                  Next <ChevronRight size={14} />
                </button>
              )}

              {(tab === "lines" || tab === "quote") && (
                <button
                  disabled={saving}
                  onClick={() => handleSave("draft")}
                  className="px-4 py-2 text-sm font-medium rounded-md border transition-opacity hover:opacity-70 disabled:opacity-50"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                    background: "var(--color-surface)",
                  }}
                >
                  {saving ? "Saving…" : "Save Draft"}
                </button>
              )}

              {tab === "quote" && (
                <button
                  disabled={saving}
                  onClick={() => handleSave("sent")}
                  className="px-5 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{
                    background: "var(--color-btn-primary-bg)",
                    color: "var(--color-btn-primary-text)",
                  }}
                >
                  {saving ? "Saving…" : "Save & Send Quote"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* High-Value Threshold Modal */}
      {hvModal && (
        <HighValueModal
          threshold={companyCfg.high_value_threshold ?? 0}
          total={pricing.final_total}
          countdown={hvCountdown}
          onOk={() => {
            if (hvTimerRef.current) { clearInterval(hvTimerRef.current); hvTimerRef.current = null; }
            setHvModal(false);
            handleSaveRef.current?.("routed");
          }}
        />
      )}
    </div>
  );
}

// ─── High-Value Threshold Modal ──────────────────────────────────────────────

interface HighValueModalProps {
  threshold: number;
  total: number;
  countdown: number;
  onOk: () => void;
}

function HighValueModal({ threshold, total, countdown, onOk }: HighValueModalProps) {
  const circumference = 2 * Math.PI * 20; // r=20
  const progress = (countdown / 30) * circumference;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {/* Icon + countdown ring */}
        <div className="flex flex-col items-center gap-5 mb-6">
          <div className="relative flex items-center justify-center">
            <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
              <circle cx="28" cy="28" r="20" fill="none" stroke="var(--color-border)" strokeWidth="4" />
              <circle
                cx="28" cy="28" r="20" fill="none"
                stroke="var(--color-warning)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - progress}
                style={{ transition: "stroke-dashoffset 0.9s linear" }}
              />
            </svg>
            <span
              className="absolute text-sm font-semibold"
              style={{ color: "var(--color-warning)" }}
            >
              {countdown}s
            </span>
          </div>

          <div className="flex items-center gap-2">
            <AlertTriangle size={20} style={{ color: "var(--color-warning)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Quote Exceeds Your Limit
            </h2>
          </div>
        </div>

        <div className="space-y-3 mb-8 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
          <p>
            This quote totals <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(total)}</strong>,
            which exceeds the high-value threshold of{" "}
            <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(threshold)}</strong>.
          </p>
          <p>
            Quotes above this limit are handled by the Sales team. Your draft will be saved and routed to the
            Quotes list so a Sales rep can claim and complete it.
          </p>
          <p style={{ color: "var(--color-warning)" }}>
            Auto-routing in <strong>{countdown}s</strong> if no action is taken.
          </p>
        </div>

        <button
          onClick={onOk}
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
        >
          OK — Route to Sales
        </button>
      </div>
    </div>
  );
}

// ─── Lead Info Card ───────────────────────────────────────────────────────────
// Delegated to shared LinkedLeadCard component

// ─── Info Tab ─────────────────────────────────────────────────────────────────

// ─── Info Tab ─────────────────────────────────────────────────────────────────

function priorityStyle(opt: string, active: boolean): React.CSSProperties {
  if (active) {
    if (opt === "Urgent") return { background: "var(--color-danger)", color: "#fff", borderColor: "var(--color-danger)" };
    if (opt === "High")   return { background: "#7C3AED", color: "#fff", borderColor: "#7C3AED" };
    if (opt === "Low")    return { background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)", borderColor: "var(--color-neutral-border)" };
    return { background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)", borderColor: "var(--color-btn-verify-bg)" };
  }
  if (opt === "Urgent") return { background: "transparent", color: "var(--color-danger)", borderColor: "var(--color-danger-border)" };
  if (opt === "High")   return { background: "transparent", color: "#7C3AED", borderColor: "#DDD6FE" };
  return { background: "transparent", color: "var(--color-text-muted)", borderColor: "var(--color-border)" };
}

function quickDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ─── Customer Tab ─────────────────────────────────────────────────────────────

interface CustomerTabProps {
  firstName: string; setFirstName: (v: string) => void;
  lastName: string; setLastName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  company: string; setCompany: (v: string) => void;
  errors?: Record<string, string>;
}

function CustomerTab(p: CustomerTabProps) {
  const fieldStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" };
  const errStyle = (key: string) => p.errors?.[key] ? { border: "1px solid var(--color-danger)" } : {};

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
          Who is this quote for?
        </h3>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Fill in the customer&apos;s details. For existing CRM contacts, create quotes from the CRM page.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            First Name <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <input value={p.firstName} onChange={(e) => p.setFirstName(e.target.value)} placeholder="Jane" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={{ ...fieldStyle, ...errStyle("customerName") }} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Last Name <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <input value={p.lastName} onChange={(e) => p.setLastName(e.target.value)} placeholder="Smith" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={{ ...fieldStyle, ...errStyle("customerName") }} />
        </div>
      </div>
      {p.errors?.customerName && (
        <p className="text-xs -mt-3" style={{ color: "var(--color-danger)" }}>{p.errors.customerName}</p>
      )}

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Company</label>
        <input value={p.company} onChange={(e) => p.setCompany(e.target.value)} placeholder="ACME Corp" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Email <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <div style={errStyle("customerContact") ? { borderRadius: "6px", ...errStyle("customerContact") } : {}}>
            <EmailInput value={p.email} onChange={(e) => p.setEmail(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Phone <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <div style={errStyle("customerContact") ? { borderRadius: "6px", ...errStyle("customerContact") } : {}}>
            <PhoneInput value={p.phone} onChange={(v) => p.setPhone(v)} />
          </div>
        </div>
      </div>
      {p.errors?.customerContact && (
        <p className="text-xs -mt-3" style={{ color: "var(--color-danger)" }}>{p.errors.customerContact}</p>
      )}
    </div>
  );
}

interface InfoTabProps {
  title: string; setTitle: (v: string) => void;
  priority: string; setPriority: (v: string) => void;
  dueDate: string; setDueDate: (v: string) => void;
  rush: boolean; setRush: (v: boolean) => void;
  specialRequirements: string; setSpecialRequirements: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  priorityOpts: LookupOption[];
  titleError?: string;
}

function InfoTab(p: InfoTabProps) {
  const [notesOpen, setNotesOpen] = useState(!!p.notes);
  const fieldStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" };
  const PRIORITY_OPTS = (p.priorityOpts.length ? p.priorityOpts.map((o) => o.label) : ["Low", "Normal", "High"]).filter((o) => o.toLowerCase() !== "urgent");

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
          Title <span style={{ color: "var(--color-danger)" }}>*</span>
        </label>
        <input
          value={p.title}
          onChange={(e) => p.setTitle(e.target.value)}
          placeholder="e.g. 500 Diecut Stickers — ACME Corp"
          className="w-full px-3 py-2 rounded-md text-sm border outline-none"
          style={{ ...fieldStyle, ...(p.titleError ? { border: "1px solid var(--color-danger)" } : {}) }}
        />
        {p.titleError && (
          <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.titleError}</p>
        )}
      </div>

      {/* Priority pill group */}
      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>Priority</label>
        <div className="flex gap-2 flex-wrap">
          {PRIORITY_OPTS.map((opt) => {
            const active = p.priority === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => p.setPriority(opt)}
                className="px-4 py-1.5 rounded-full text-sm font-medium border transition-all"
                style={priorityStyle(opt, active)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Due Date with quick-pick buttons */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Due Date</label>
        <div className="flex gap-2 items-center">
          <DatePicker
            value={p.dueDate}
            onChange={p.setDueDate}
            placeholder="Select due date"
            className="flex-1"
          />
          {[
            { label: "Today",    days: 0 },
            { label: "Tomorrow", days: 1 },
            { label: "+3d",      days: 3 },
            { label: "+1w",      days: 7 },
          ].map(({ label, days }) => (
            <button
              key={label}
              type="button"
              onClick={() => p.setDueDate(quickDate(days))}
              className="px-3 py-2 rounded-md text-xs font-medium border whitespace-nowrap transition-opacity hover:opacity-70"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Rush Order toggle card */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer select-none"
        style={{
          background: p.rush ? "var(--color-warning-bg)" : "var(--color-surface)",
          border: `1px solid ${p.rush ? "var(--color-warning-border)" : "var(--color-border)"}`,
          transition: "background 0.15s, border-color 0.15s",
        }}
        onClick={() => p.setRush(!p.rush)}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: p.rush ? "var(--color-warning)" : "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            <Zap size={16} style={{ color: p.rush ? "#fff" : "var(--color-text-muted)" }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Rush Order</p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Prioritize this order for faster processing</p>
          </div>
        </div>
        <div
          className="relative w-11 h-6 rounded-full transition-colors shrink-0"
          style={{ background: p.rush ? "var(--color-warning)" : "var(--color-border)" }}
        >
          <div
            className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
            style={{
              background: "#fff",
              left: p.rush ? "calc(100% - 22px)" : "2px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          />
        </div>
      </div>

      {/* Special Requirements */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Special Requirements</label>
        <textarea
          value={p.specialRequirements}
          onChange={(e) => p.setSpecialRequirements(e.target.value)}
          rows={3}
          placeholder="Any special printing or finishing requirements…"
          className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-y"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        />
      </div>

      {/* Internal Notes — collapsible */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left"
          style={{ background: "var(--color-surface)", color: "var(--color-text-primary)" }}
        >
          <span>Internal Notes</span>
          <ChevronDown
            size={16}
            style={{
              color: "var(--color-text-muted)",
              transform: notesOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          />
        </button>
        {notesOpen && (
          <div className="px-4 pb-4 pt-1" style={{ background: "var(--color-surface)" }}>
            <textarea
              value={p.notes}
              onChange={(e) => p.setNotes(e.target.value)}
              rows={3}
              placeholder="Notes visible to staff only…"
              className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-y"
              style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Line Items Tab ───────────────────────────────────────────────────────────

interface LineItemsTabProps {
  skus: QuoteSku[];
  products: ProductType[];
  skuLookups: SkuLookups;
  onUpdate: (idx: number, field: keyof QuoteSku, value: unknown) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  error?: string;
}

function LineItemsTab({ skus, products, skuLookups, onUpdate, onRemove, onAdd, error }: LineItemsTabProps) {
  return (
    <div>
      {error && (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3 mb-4 text-sm"
          style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      <div className="space-y-4">
        {skus.map((sku, idx) => (
          <SkuRow
            key={idx}
            idx={idx}
            sku={sku}
            products={products}
            skuLookups={skuLookups}
            onUpdate={onUpdate}
            onRemove={onRemove}
            canRemove={skus.length > 1}
          />
        ))}
      </div>

      <button
        onClick={onAdd}
        className="mt-4 w-full py-3 text-sm font-medium rounded-lg border-2 border-dashed transition-colors hover:opacity-80"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-text-muted)",
          background: "transparent",
        }}
      >
        Add Line Item
      </button>
    </div>
  );
}

function SkuRow({
  idx, sku, products, skuLookups, onUpdate, onRemove, canRemove,
}: {
  idx: number;
  sku: QuoteSku;
  products: ProductType[];
  skuLookups: SkuLookups;
  onUpdate: (i: number, f: keyof QuoteSku, v: unknown) => void;
  onRemove: (i: number) => void;
  canRemove: boolean;
}) {
  const selectedProduct = products.find((p) => p.name === sku.product_type);
  const allMaterials = selectedProduct?.material_groups.flatMap((g) => g.materials) ?? [];
  const lineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);

  return (
    <div
      className="rounded-lg p-4 border"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Line {idx + 1}
        </span>
        {canRemove && (
          <button
            onClick={() => onRemove(idx)}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-danger)" }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Row 1: Product Type | Material */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Product Type *</label>
          <select
            value={sku.product_type}
            onChange={(e) => {
              onUpdate(idx, "product_type", e.target.value);
              onUpdate(idx, "material", "");
            }}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <option value="">Select product…</option>
            {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Material *</label>
          <select
            value={sku.material ?? ""}
            onChange={(e) => onUpdate(idx, "material", e.target.value)}
            disabled={!selectedProduct}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none disabled:opacity-50"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <option value="">Select material…</option>
            {allMaterials.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>

        {/* Row 2: Width | Height */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Width (in) *</label>
          <input
            type="number" min={0} placeholder="e.g. 4"
            value={sku.width ?? ""}
            onChange={(e) => onUpdate(idx, "width", e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Height (in) *</label>
          <input
            type="number" min={0} placeholder="e.g. 3"
            value={sku.height ?? ""}
            onChange={(e) => onUpdate(idx, "height", e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
        </div>

        {/* Row 3: Color Mode | Sides */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Color Mode</label>
          <select
            value={sku.color_mode ?? ""}
            onChange={(e) => onUpdate(idx, "color_mode", e.target.value || undefined)}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <option value="">None</option>
            {renderLookupOptions(skuLookups.color_mode, sku.color_mode)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Sides</label>
          <select
            value={sku.sides ?? ""}
            onChange={(e) => onUpdate(idx, "sides", e.target.value || undefined)}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <option value="">None</option>
            {renderLookupOptions(skuLookups.sides, sku.sides)}
          </select>
        </div>

        {/* Row 4: Quantity | Unit Price */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Quantity *</label>
          <input
            type="number" min={1} placeholder="e.g. 1000"
            value={sku.quantity ?? ""}
            onChange={(e) => onUpdate(idx, "quantity", e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Unit Price ($) *</label>
          <input
            type="number" min={0} step={0.01} placeholder="0.00"
            value={sku.unit_price ?? ""}
            onChange={(e) => onUpdate(idx, "unit_price", e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          />
        </div>

        {/* Row 5: Lamination | Roll Direction */}
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Lamination</label>
          <select
            value={sku.lamination ?? "None"}
            onChange={(e) => onUpdate(idx, "lamination", e.target.value)}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          >
            {renderLookupOptions(skuLookups.lamination, sku.lamination)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Roll Direction</label>
          <select
            value={sku.roll_direction ?? ""}
            onChange={(e) => onUpdate(idx, "roll_direction", e.target.value || undefined)}
            className="w-full px-2.5 py-1.5 rounded text-sm border outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
          >
            <option value="">None</option>
            {renderLookupOptions(skuLookups.roll_direction, sku.roll_direction)}
          </select>
        </div>
      </div>

      {/* Line price banner */}
      {lineTotal > 0 && (
        <div className="mb-3 px-3 py-2 rounded text-sm font-medium" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
          Line price: {formatCurrency(lineTotal)} <span className="font-normal opacity-70">qty × unit</span>
        </div>
      )}

      {/* Add-on finishings */}
      <div className="pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Add-on Finishings</p>
        <div className="flex flex-wrap gap-2">
          {(skuLookups.finishing.length
            ? skuLookups.finishing.map((o) => ({ key: o.value as keyof QuoteSku, label: o.label }))
            : [{ key: "spot_uv" as keyof QuoteSku, label: "Spot UV" }, { key: "foil" as keyof QuoteSku, label: "Foil" }, { key: "perforation" as keyof QuoteSku, label: "Perforation" }]
          ).concat([
            { key: "design_required" as keyof QuoteSku, label: "Design on file" },
            { key: "die_cut" as keyof QuoteSku, label: "Die Cut" },
          ]).map(({ key, label }) => {
            const checked = !!sku[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onUpdate(idx, key, !checked)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all"
                style={checked
                  ? { background: "var(--color-badge-bg)", color: "var(--color-badge-text)", borderColor: "var(--color-accent)" }
                  : { background: "transparent", color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
                }
              >
                <span
                  className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0"
                  style={checked
                    ? { background: "var(--color-accent)", borderColor: "var(--color-accent)" }
                    : { borderColor: "var(--color-border)" }
                  }
                >
                  {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="var(--color-btn-primary-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Line item comment */}
      <div className="mt-3">
        <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Line Item Comment</label>
        <textarea
          rows={2}
          placeholder="Optional notes for this SKU"
          value={sku.comment ?? ""}
          onChange={(e) => onUpdate(idx, "comment", e.target.value || undefined)}
          className="w-full px-2.5 py-1.5 rounded text-sm border outline-none resize-none"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        />
      </div>
    </div>
  );
}

// ─── Quote Tab ────────────────────────────────────────────────────────────────

interface QuoteTabProps {
  pricing: ReturnType<typeof computePricing>;
  orderSource: "quoted" | "direct"; setOrderSource: (v: "quoted" | "direct") => void;
  shipping: number; setShipping: (v: number) => void;
  discountType: "percent" | "fixed" | ""; setDiscountType: (v: "percent" | "fixed" | "") => void;
  discountValue: string; setDiscountValue: (v: string) => void;
  discountReason: string; setDiscountReason: (v: string) => void;
  taxRate: number; setTaxRate: (v: number) => void;
  taxExempt: boolean; setTaxExempt: (v: boolean) => void;
  salesPermit: string; setSalesPermit: (v: string) => void;
  paymentTypes: string[]; togglePayment: (opt: string) => void;
  prepayType: "percent" | "fixed"; setPrepayType: (v: "percent" | "fixed") => void;
  prepayValue: string; setPrepayValue: (v: string) => void;
  quoteChannel: string; setQuoteChannel: (v: string) => void;
  quoteDestination: string; setQuoteDestination: (v: string) => void;
  reminderDate: string; setReminderDate: (v: string) => void;
  followUpCycles: number; setFollowUpCycles: (v: number) => void;
  followUpFreq: string; setFollowUpFreq: (v: string) => void;
  channelOpts: LookupOption[];
  paymentOpts: LookupOption[];
  followUpFreqOpts: LookupOption[];
}

function QuoteTab(p: QuoteTabProps) {
  const fieldStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text-primary)",
  };

  return (
    <div className="space-y-6">
      {/* Pricing summary */}
      <div
        className="rounded-lg p-4 space-y-2"
        style={{ background: "var(--color-badge-bg)", border: "1px solid var(--color-border)" }}
      >
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
          Pricing Summary
        </h4>
        {[
          ["Subtotal", p.pricing.subtotal],
          ["Shipping", p.pricing.shipping],
          ["Discount", -p.pricing.discount_amount],
          ["Pre-tax Total", p.pricing.pre_tax_total],
          ["Tax", p.pricing.tax_amount],
        ].map(([label, val]) => (
          <div key={label as string} className="flex justify-between text-sm">
            <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
            <span style={{ color: (val as number) < 0 ? "var(--color-danger)" : "var(--color-text-primary)" }}>
              {val !== 0 ? formatCurrency(Math.abs(val as number)) : "—"}
            </span>
          </div>
        ))}
        <div
          className="flex justify-between font-semibold text-base pt-2 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span style={{ color: "var(--color-text-primary)" }}>Total</span>
          <span style={{ color: "var(--color-accent)" }}>{formatCurrency(p.pricing.final_total)}</span>
        </div>
      </div>

      {/* Pricing Adjustments card */}
      <div className="rounded-lg p-4 space-y-4 border" style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Adjustments</h4>

        {/* Row 1: Shipping + Tax Rate inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Shipping ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={p.shipping}
              onChange={(e) => p.setShipping(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-md text-sm border outline-none"
              style={fieldStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Tax Rate (%)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={p.taxRate}
              disabled={p.taxExempt}
              onChange={(e) => p.setTaxRate(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-md text-sm border outline-none disabled:opacity-40"
              style={fieldStyle}
            />
          </div>
        </div>

        {/* Row 2: Discount selector + Tax Exempt toggle */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Discount</label>
            <div className="grid grid-cols-3 rounded-md overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
              {(["", "percent", "fixed"] as const).map((opt, i) => {
                const active = p.discountType === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => p.setDiscountType(opt)}
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
            <button
              type="button"
              onClick={() => p.setTaxExempt(!p.taxExempt)}
              className="w-full py-2 rounded-md text-sm font-medium border transition-all"
              style={p.taxExempt ? {
                background: "var(--color-accent)",
                color: "var(--color-btn-primary-text)",
                borderColor: "var(--color-accent)",
              } : {
                background: "var(--color-surface)",
                color: "var(--color-text-muted)",
                borderColor: "var(--color-border)",
              }}
            >
              Tax Exempt
            </button>
          </div>
        </div>

        {/* Row 3: conditional inputs */}
        {(p.discountType || p.taxExempt) && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              {p.discountType ? (
                <>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                    {p.discountType === "percent" ? "Discount %" : "Discount ($)"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={p.discountType === "percent" ? 1 : 0.01}
                    value={p.discountValue}
                    onChange={(e) => p.setDiscountValue(e.target.value)}
                    placeholder={p.discountType === "percent" ? "0" : "0.00"}
                    className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                    style={fieldStyle}
                  />
                </>
              ) : <div />}
            </div>
            <div>
              {p.taxExempt ? (
                <>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Sales Permit #</label>
                  <input
                    value={p.salesPermit}
                    onChange={(e) => p.setSalesPermit(e.target.value)}
                    placeholder="Permit number…"
                    className="w-full px-3 py-2 rounded-md text-sm border outline-none"
                    style={fieldStyle}
                  />
                </>
              ) : <div />}
            </div>
          </div>
        )}

        {/* Discount reason */}
        {p.discountType && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Discount Reason</label>
            <input
              value={p.discountReason}
              onChange={(e) => p.setDiscountReason(e.target.value)}
              className="w-full px-3 py-2 rounded-md text-sm border outline-none"
              style={fieldStyle}
              placeholder="Reason for discount…"
            />
          </div>
        )}
      </div>

      {/* Order Flow — segmented control */}
      <div className="rounded-lg p-4 border" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>Order Flow</label>
        <div className="grid grid-cols-2 rounded-md overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          {(["quoted", "direct"] as const).map((opt, i) => {
            const active = p.orderSource === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => p.setOrderSource(opt)}
                className={`py-2.5 text-sm font-medium transition-all${i === 0 ? " border-r" : ""}`}
                style={{
                  background: active ? "var(--color-accent)" : "var(--color-bg)",
                  color: active ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
                  borderColor: "var(--color-border)",
                }}
              >
                {opt === "quoted" ? "Quote First" : "Direct Order"}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
          {p.orderSource === "quoted"
            ? "Send a quote for customer approval before payment"
            : "Collect payment immediately — no quote step needed"}
        </p>
      </div>

      {p.orderSource === "direct" ? (
        /* ── Direct order flow ── */
        <>
          {/* Payment Methods first */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Payment Methods</h4>
            <div className="flex flex-wrap gap-2">
              {(p.paymentOpts.length ? p.paymentOpts.map((o) => o.label) : ["Card Payment", "Zelle", "Offline"]).map((opt) => {
                const checked = p.paymentTypes.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => p.togglePayment(opt)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all"
                    style={checked
                      ? { background: "var(--color-badge-bg)", color: "var(--color-badge-text)", borderColor: "var(--color-accent)" }
                      : { background: "transparent", color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
                    }
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                      style={checked
                        ? { background: "var(--color-accent)", borderColor: "var(--color-accent)" }
                        : { borderColor: "var(--color-border)" }
                      }
                    >
                      {checked && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-btn-primary-text)" }} />}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {/* Prepayment */}
            <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Prepayment</label>
              <div className="flex gap-2">
                <select value={p.prepayType} onChange={(e) => p.setPrepayType(e.target.value as "percent" | "fixed")} className="px-2.5 py-2 rounded-md text-sm border outline-none" style={fieldStyle}>
                  <option value="percent">%</option>
                  <option value="fixed">$</option>
                </select>
                <input type="number" min={0} step={p.prepayType === "percent" ? 1 : 0.01} value={p.prepayValue} onChange={(e) => p.setPrepayValue(e.target.value)} className="w-28 px-2.5 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
                <span className="text-sm self-center" style={{ color: "var(--color-text-muted)" }}>
                  = {p.prepayType === "percent" ? formatCurrency(p.pricing.final_total * (parseFloat(p.prepayValue) / 100 || 0)) : formatCurrency(parseFloat(p.prepayValue) || 0)}
                </span>
              </div>
              {p.pricing.final_total > 0 && (() => {
                const dueNow = p.prepayType === "percent" ? Math.round(p.pricing.final_total * (parseFloat(p.prepayValue) / 100 || 0) * 100) / 100 : Math.round(Math.min(parseFloat(p.prepayValue) || 0, p.pricing.final_total) * 100) / 100;
                const balance = Math.max(Math.round((p.pricing.final_total - dueNow) * 100) / 100, 0);
                return <div className="flex gap-6 mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}><span>Due now: <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(dueNow)}</strong></span><span>Balance: <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(balance)}</strong></span></div>;
              })()}
            </div>
          </div>

          {/* Send payment link */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Send Payment Link</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Send Via</label>
                <select value={p.quoteChannel} onChange={(e) => p.setQuoteChannel(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle}>
                  {renderLookupOptions(
                    p.channelOpts.length ? p.channelOpts : [{ value: "email", label: "Email" }, { value: "sms", label: "SMS" }, { value: "whatsapp", label: "WhatsApp" }, { value: "in_person", label: "In-person" }],
                    p.quoteChannel
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                  {p.quoteChannel === "Email" ? "Email Address" : p.quoteChannel === "In-person" ? "Location" : "Phone / Contact"}
                </label>
                {p.quoteChannel === "Email" ? (
                  <EmailInput value={p.quoteDestination} onChange={(e) => p.setQuoteDestination(e.target.value)} showAction />
                ) : p.quoteChannel === "SMS" || p.quoteChannel === "WhatsApp" ? (
                  <PhoneInput value={p.quoteDestination} onChange={(val) => p.setQuoteDestination(val)} />
                ) : (
                  <input value={p.quoteDestination} onChange={(e) => p.setQuoteDestination(e.target.value)} type="text" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ── Quote first flow ── */
        <>
          {/* Send quote to customer */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Send Quote to Customer</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Send Via</label>
                <select value={p.quoteChannel} onChange={(e) => p.setQuoteChannel(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle}>
                  {renderLookupOptions(
                    p.channelOpts.length ? p.channelOpts : [{ value: "email", label: "Email" }, { value: "sms", label: "SMS" }, { value: "whatsapp", label: "WhatsApp" }, { value: "in_person", label: "In-person" }],
                    p.quoteChannel
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                  {p.quoteChannel === "Email" ? "Email Address" : p.quoteChannel === "In-person" ? "Location" : "Phone / Contact"}
                </label>
                {p.quoteChannel === "Email" ? (
                  <EmailInput value={p.quoteDestination} onChange={(e) => p.setQuoteDestination(e.target.value)} showAction />
                ) : p.quoteChannel === "SMS" || p.quoteChannel === "WhatsApp" ? (
                  <PhoneInput value={p.quoteDestination} onChange={(val) => p.setQuoteDestination(val)} />
                ) : (
                  <input value={p.quoteDestination} onChange={(e) => p.setQuoteDestination(e.target.value)} type="text" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
                )}
              </div>
            </div>
          </div>

          {/* Follow-up schedule */}
          <div
            className="rounded-lg p-4 space-y-4"
            style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Follow-up Schedule
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>First Reminder</label>
                <input type="date" value={p.reminderDate} onChange={(e) => p.setReminderDate(e.target.value)} onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} className="w-full px-2.5 py-1.5 rounded text-sm border outline-none cursor-pointer" style={fieldStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Cycles</label>
                <input type="number" min={1} max={10} value={p.followUpCycles} onChange={(e) => p.setFollowUpCycles(parseInt(e.target.value) || 3)} className="w-full px-2.5 py-1.5 rounded text-sm border outline-none" style={fieldStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Frequency</label>
                <select value={p.followUpFreq} onChange={(e) => p.setFollowUpFreq(e.target.value)} className="w-full px-2.5 py-1.5 rounded text-sm border outline-none" style={fieldStyle}>
                  {renderLookupOptions(
                    p.followUpFreqOpts.length ? p.followUpFreqOpts : [{ value: "daily", label: "Daily" }, { value: "every_2days", label: "Every 2 days" }, { value: "weekly", label: "Weekly" }],
                    p.followUpFreq
                  )}
                </select>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
