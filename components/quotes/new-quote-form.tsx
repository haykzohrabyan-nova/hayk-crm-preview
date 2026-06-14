"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { computePricing, formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { validatePhone } from "@/lib/utils/phone";
import { validateEmail } from "@/lib/utils/email";
import { validateWebsite, WEBSITE_FIELD_PLACEHOLDER } from "@/lib/utils/website";
import { validateShippingDestinationZips } from "@/lib/utils/address";
import {
  emptyShippingDestination,
  shippingDestinationsToApiFields,
  sumShippingAmounts,
  type ShippingDestinationDraft,
} from "@/lib/utils/ticket-shipping-destinations";
import { scrollToFirstFormField, scrollToFormField } from "@/lib/utils/scroll-field-into-view";
import { seedTicketFormBootstrapFromQuotesBootstrap } from "@/lib/client/ticket-form-bootstrap-cache";
import {
  formatQuoteSendMissingMessage,
  getQuoteSendMissingFields,
} from "@/lib/utils/validate-quote-send";
import { resolveQuoteDeliveryFromContact } from "@/lib/utils/resolve-quote-delivery-from-contact";
import {
  customerHasTaxExemptOnFile,
  type CustomerTaxExemptLastFields,
} from "@/lib/utils/customer-tax-exempt";
import { LinkedLeadCard } from "@/components/ui/linked-lead-card";
import { CustomerSidebarCard } from "@/components/quotes/customer-sidebar-card";
import {
  GLOBAL_LOADING_MESSAGES,
  useGlobalLoading,
} from "@/components/layout/global-loading-provider";
import { createClient } from "@/lib/supabase/client";

import { type TicketPaymentDraft, PAYMENT_CONFIG_DEFAULTS } from "@/components/quotes/quote-payment-config";
import { minDueDateForNewTicket, validateDueDateAgainstCreated } from "@/lib/utils/due-date";
import { InfoForm } from "@/components/quotes/shared/info-form";
import { LineItemsForm } from "@/components/quotes/shared/line-items-form";
import {
  emptyFormLineItem,
  type FormLineItem,
} from "@/components/quotes/shared/utils";
import {
  lineItemsToApiPayload,
  uploadPendingVariantFiles,
} from "@/components/quotes/shared/line-item-variants";
import { QuoteForm } from "@/components/quotes/shared/quote-form";
import { RouteToSalesModal, type RouteToSalesForm } from "@/components/quotes/route-to-sales-modal";
import type { LookupOption as SharedLookupOption, SkuLookups as SharedSkuLookups } from "@/components/quotes/shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadInfo {
  id: string;
  status: string | null;
  sales_status: string | null;
  urgency: string | null;
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
    authority?: string | null;
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

type LookupOption = SharedLookupOption;
type SkuLookups = SharedSkuLookups;
type QuoteLookups = {
  ticket_priority: LookupOption[];
  quote_channel: LookupOption[];
  ticket_payment: LookupOption[];
  follow_up_freq: LookupOption[];
};


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
  const { showLoading, hideLoading } = useGlobalLoading();
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
  // Clear countdown timer on unmount to prevent state updates on an unmounted component.
  useEffect(() => () => { if (hvTimerRef.current) clearInterval(hvTimerRef.current); }, []);
  // Keep a stable ref to handleSave so the interval always calls the latest version
  const handleSaveRef = useRef<
    ((
      status: "draft" | "sent" | "routed",
      options?: { routedReason?: string; routedNotes?: string },
    ) => Promise<void>) | null
  >(null);
  const tabContentRef = useRef<HTMLDivElement>(null);

  // ── Manual route-to-sales modal (SDR, Line Items + Quote tabs) ───────────
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeForm, setRouteForm] = useState<RouteToSalesForm>({
    routed_reason: "",
    routed_notes: "",
  });
  const [routeReasons, setRouteReasons] = useState<LookupOption[]>([]);

  function scrollToValidationError(errors: Record<string, string>, activeTab: Tab) {
    const TAB_FIELD_PRIORITY: Record<Tab, string[]> = {
      customer: ["customerName", "customerContact", "customerSource", "customerIndustry", "customerWebsite"],
      info: ["customerSource", "title", "dueDate"],
      lines: ["lineItems", ...skus.map((_, i) => `lineItem-${i}`), ...skus.map((_, i) => `lineVariants-${i}`)],
      quote: ["salesPermit"],
    };
    scrollToFirstFormField(tabContentRef, errors, TAB_FIELD_PRIORITY[activeTab]);
  }

  // ── Customer step fields (pre-fill from CRM query params if present) ────────
  const [contactFirstName, setContactFirstName] = useState(searchParams.get("first_name") ?? "");
  const [contactLastName, setContactLastName] = useState(searchParams.get("last_name") ?? "");
  const [contactEmail, setContactEmail] = useState(searchParams.get("email") ?? "");
  const [contactPhone, setContactPhone] = useState(searchParams.get("phone") ?? "");
  const [contactCompany, setContactCompany] = useState(searchParams.get("company") ?? "");
  const [contactSource, setContactSource] = useState("");
  const [contactIndustry, setContactIndustry] = useState(searchParams.get("industry") ?? "");
  const [contactWebsite, setContactWebsite] = useState(searchParams.get("website") ?? "");
  const [contactAuthority, setContactAuthority] = useState(searchParams.get("authority") ?? "");
  // Lifted from CustomerTab so lock state survives tab navigation
  const [customerLocked, setCustomerLocked] = useState(false);
  const [customerFoundName, setCustomerFoundName] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(searchParams.get("customer_id"));

  // ── Info tab fields ──────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [dueDate, setDueDate] = useState("");
  const [rush, setRush] = useState(false);
  const [orderSource, setOrderSource] = useState<"quoted" | "direct">("quoted");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [notes, setNotes] = useState("");

  // ── Line Items ────────────────────────────────────────────────────────────
  const [skus, setSkus] = useState<FormLineItem[]>([emptyFormLineItem()]);

  // ── Quote tab fields ──────────────────────────────────────────────────────
  const [requiresShipping, setRequiresShipping] = useState(false);
  const [shippingDestinations, setShippingDestinations] = useState<ShippingDestinationDraft[]>([
    emptyShippingDestination(),
  ]);
  const [discountType, setDiscountType] = useState<"percent" | "fixed" | "">("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [taxExempt, setTaxExempt] = useState(false);
  const [salesPermit, setSalesPermit] = useState("");
  const [salesPermitFile, setSalesPermitFile] = useState<File | null>(null);
  const [customerTaxExemptLast, setCustomerTaxExemptLast] = useState<CustomerTaxExemptLastFields | null>(null);
  const [taxExemptReuseChoice, setTaxExemptReuseChoice] = useState<"none" | "reuse" | "upload" | "ignore">("none");
  const [paymentDraft, setPaymentDraft] = useState<TicketPaymentDraft>(PAYMENT_CONFIG_DEFAULTS);

  // ─── Load lead + products + company settings ────────────────────────────

  const fetchLead = useCallback(() => {
    if (!leadId) return;
    fetch(`/api/leads/${leadId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.lead) {
          const l: LeadInfo = d.lead;
          setLead(l);
          if (l.source) setContactSource(l.source);
          if (l.customer?.phone) setContactPhone((prev) => prev || l.customer!.phone || "");
          if (l.customer?.email) setContactEmail((prev) => prev || l.customer!.email || "");
          if (l.customer?.industry) setContactIndustry((prev) => prev || l.customer!.industry || "");
          if (l.customer?.website) setContactWebsite((prev) => prev || l.customer!.website || "");
          if (l.customer?.authority) setContactAuthority((prev) => prev || l.customer!.authority || "");
        }
      })
      .catch(() => {});
  }, [leadId]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  useEffect(() => {
    const id = selectedCustomerId ?? lead?.customer?.id ?? null;
    if (!id) {
      setCustomerTaxExemptLast(null);
      setTaxExemptReuseChoice("none");
      return;
    }
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const c = d.customer;
        if (!c) return;
        if (c.company) setContactCompany((prev) => prev || c.company || "");
        if (c.website) setContactWebsite((prev) => prev || c.website || "");
        if (c.authority) setContactAuthority((prev) => prev || c.authority || "");
        const last: CustomerTaxExemptLastFields = {
          tax_exempt_last_permit_number: c.tax_exempt_last_permit_number,
          tax_exempt_last_storage_path: c.tax_exempt_last_storage_path,
          tax_exempt_last_file_name: c.tax_exempt_last_file_name,
          tax_exempt_last_mime_type: c.tax_exempt_last_mime_type,
          tax_exempt_last_reviewed_at: c.tax_exempt_last_reviewed_at,
        };
        setCustomerTaxExemptLast(last);
        if (!customerHasTaxExemptOnFile(last)) {
          setTaxExemptReuseChoice("none");
        }
      })
      .catch(() => {});
  }, [selectedCustomerId, lead?.customer?.id]);

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
  const [customerLookups, setCustomerLookups] = useState<{ source: LookupOption[]; industry: LookupOption[] }>({
    source: [],
    industry: [],
  });

  useEffect(() => {
    fetch("/api/quotes/form-bootstrap")
      .then((r) => r.json())
      .then((d) => {
        const lookups = d.lookups as Record<string, LookupOption[]> | undefined;
        if (lookups && d.company && d.products) {
          seedTicketFormBootstrapFromQuotesBootstrap({
            company: d.company,
            lookups: lookups as Record<string, unknown[]>,
            products: d.products,
          });
        }
        if (d.products) setProducts(d.products);
        if (d.company?.settings) {
          setCompanyCfg(d.company.settings);
          if (d.company.settings.default_tax_rate != null) {
            setTaxRate(d.company.settings.default_tax_rate);
          }
        }
        if (lookups) {
          setSkuLookups({
            lamination: lookups.lamination ?? [],
            color_mode: lookups.color_mode ?? [],
            sides: lookups.sides ?? [],
            roll_direction: lookups.roll_direction ?? [],
            finishing: lookups.finishing ?? [],
          });
          setQuoteLookups({
            ticket_priority: lookups.ticket_priority ?? [],
            quote_channel: lookups.quote_channel ?? [],
            ticket_payment: lookups.ticket_payment ?? [],
            follow_up_freq: lookups.follow_up_freq ?? [],
          });
          setCustomerLookups({
            source: lookups.source ?? [],
            industry: lookups.industry ?? [],
          });
          setRouteReasons(lookups.route_reason ?? []);
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

  const updateVariants = useCallback((idx: number, variants: FormLineItem["variants"]) => {
    setSkus((prev) => prev.map((s, i) => (i === idx ? { ...s, variants } : s)));
  }, []);

  const updateLineAttachment = useCallback(
    (idx: number, attachment: FormLineItem["lineAttachment"]) => {
      setSkus((prev) => prev.map((s, i) => (i === idx ? { ...s, lineAttachment: attachment } : s)));
    },
    [],
  );

  const addSku = useCallback(() => {
    setSkus((prev) => [...prev, emptyFormLineItem()]);
  }, []);

  // ─── Pricing ─────────────────────────────────────────────────────────────

  const pricing = computePricing({
    skus,
    quote_shipping: requiresShipping ? sumShippingAmounts(shippingDestinations) : 0,
    discount_type: discountType || null,
    discount_value: discountValue || null,
    quote_tax_rate_percent: taxExempt ? 0 : taxRate,
    tax_exempt: taxExempt,
  });

  const reusingCustomerPermit = taxExemptReuseChoice === "reuse";
  const hasSalesPermitFile = !!salesPermitFile || reusingCustomerPermit;
  const showCustomerTaxExemptBanner =
    taxExempt &&
    customerTaxExemptLast != null &&
    customerHasTaxExemptOnFile(customerTaxExemptLast) &&
    taxExemptReuseChoice !== "ignore";

  // ─── Save ─────────────────────────────────────────────────────────────────

  function validateAndAdvance(nextTab: Tab) {
    const errors: Record<string, string> = {};

    if (tab === "customer") {
      if (!contactFirstName.trim() && !contactLastName.trim()) {
        errors.customerName = "Please enter the customer's name.";
      }
      if (!contactEmail.trim() && !contactPhone.trim()) {
        errors.customerContact = "Please provide an email or phone number.";
      } else {
        if (contactPhone.trim()) {
          const pErr = validatePhone(contactPhone);
          if (pErr) errors.customerContact = `Phone: ${pErr}`;
        }
        if (contactEmail.trim() && !errors.customerContact) {
          const eErr = validateEmail(contactEmail);
          if (eErr) errors.customerContact = `Email: ${eErr}`;
        }
      }
      if (!contactSource) {
        errors.customerSource = "Source is required.";
      }
      if (!contactIndustry) {
        errors.customerIndustry = "Industry is required.";
      }
    }

    if (tab === "info") {
      if (!title.trim()) {
        errors.title = "A title is required.";
      }
      if (dueDate) {
        const dueErr = validateDueDateAgainstCreated(dueDate, new Date().toISOString());
        if (dueErr) errors.dueDate = dueErr;
      }
      if (skipCustomerTab && !leadId && !contactSource.trim()) {
        errors.customerSource = "Source is required.";
      }
    }

    if (tab === "lines") {
      const hasFullItem = skus.some(
        (s) => s.product_type?.trim() && (s.quantity ?? 0) > 0 && (s.unit_price ?? 0) > 0
      );
      if (!hasFullItem) {
        errors.lineItems = "Please fill in at least one complete line item (product, quantity, and unit price).";
      }
      for (let i = 0; i < skus.length; i++) {
        const s = skus[i];
        const missing: string[] = [];
        if (!s.product_type?.trim()) missing.push("product type");
        if (!s.material?.trim()) missing.push("material");
        if (!(s.width != null && s.width > 0)) missing.push("width");
        if (!(s.height != null && s.height > 0)) missing.push("height");
        if (!((s.quantity ?? 0) > 0)) missing.push("quantity");
        if (!((s.unit_price ?? 0) > 0)) missing.push("unit price");
        if (missing.length > 0) {
          errors[`lineItem-${i}`] = `Line ${i + 1}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.`;
        }
      }
      for (let i = 0; i < skus.length; i++) {
        const formSku = skus[i] as FormLineItem;
        const variants = formSku.variants ?? [];
        for (let j = 0; j < variants.length; j++) {
          const v = variants[j];
          if (!String(v.name ?? "").trim()) {
            errors[`lineVariants-${i}`] = `Additional SKU ${j + 1}: name is required.`;
            break;
          }
          const qty = Number(v.quantity);
          if (!Number.isFinite(qty) || qty <= 0) {
            errors[`lineVariants-${i}`] = `Additional SKU ${j + 1}: quantity must be greater than 0.`;
            break;
          }
        }
      }
    }

    if (tab === "quote") {
      if (taxExempt && !salesPermit.trim()) {
        errors.salesPermit = "Sales Permit # is required when Tax Exempt is selected.";
      }
      if (taxExempt && !hasSalesPermitFile) {
        errors.salesPermitFile = "Permit file is required when Tax Exempt is selected.";
      }
      const zipErr = validateShippingDestinationZips(
        requiresShipping ? shippingDestinations : [],
      );
      if (zipErr) errors.shipToZip = zipErr;
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      scrollToValidationError(errors, tab);
      return;
    }

    setFieldErrors({});

    // High-value threshold check: block SDR from entering the Quote tab
    if (
        nextTab === "quote" &&
        userRole === "sdr" &&
        companyCfg.high_value_threshold != null &&
        pricing.final_total > companyCfg.high_value_threshold
      ) {
        // Set the ref NOW so the timer and OK button can call the latest handleSave
        handleSaveRef.current = handleSave;
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

  async function handleSave(
    status: "draft" | "sent" | "routed",
    options?: { routedReason?: string; routedNotes?: string },
  ) {
    // Keep the ref current so the HV countdown timer can always call the latest version
    handleSaveRef.current = handleSave;

    if (!title.trim()) {
      setFieldErrors({ title: "A title is required." });
      setTab("info");
      scrollToFormField(tabContentRef, "title");
      return;
    }

    if (dueDate) {
      const dueErr = validateDueDateAgainstCreated(dueDate, new Date().toISOString());
      if (dueErr) {
        setFieldErrors({ dueDate: dueErr });
        setTab("info");
        scrollToFormField(tabContentRef, "dueDate");
        return;
      }
    }

    const hasFilledItem = skus.some((s) => s.product_type?.trim());
    if (!hasFilledItem) {
      setFieldErrors({ lineItems: "Please add at least one line item before saving." });
      setTab("lines");
      scrollToFormField(tabContentRef, "lineItems");
      return;
    }

    if (status === "sent") {
      const missing = getQuoteSendMissingFields({
        title,
        dueDate,
        skus,
        taxExempt,
        salesPermit,
        hasSalesPermitFile,
        requiresShipping,
        shipToDestinations: shippingDestinations,
        paymentDraft,
      });
      if (missing.length > 0) {
        setError(formatQuoteSendMissingMessage(missing));
        setTab("quote");
        return;
      }
    }

    if (taxExempt && (!salesPermit.trim() || !hasSalesPermitFile)) {
      setFieldErrors({
        ...(!salesPermit.trim() ? { salesPermit: "Sales Permit # is required when Tax Exempt is selected." } : {}),
        ...(!hasSalesPermitFile ? { salesPermitFile: "Permit file is required when Tax Exempt is selected." } : {}),
      });
      setTab("quote");
      scrollToFormField(tabContentRef, "salesPermit");
      return;
    }

    const zipErr = validateShippingDestinationZips(
      requiresShipping ? shippingDestinations : [],
    );
    if (zipErr) {
      setFieldErrors({ shipToZip: zipErr });
      setTab("quote");
      scrollToFormField(tabContentRef, "shipToZip");
      return;
    }

    if (skipCustomerTab && !leadId && !contactSource.trim()) {
      setFieldErrors({ customerSource: "Source is required." });
      setTab("info");
      scrollToFormField(tabContentRef, "customerSource");
      return;
    }

    const websiteToValidate = contactWebsite || lead?.customer?.website || "";
    const websiteErr = validateWebsite(websiteToValidate);
    if (websiteErr) {
      setFieldErrors({ customerWebsite: websiteErr });
      setTab("info");
      scrollToFormField(tabContentRef, "customerWebsite");
      return;
    }

    setSaving(true);
    setError(null);
    const loadingMessage =
      status === "sent"
        ? GLOBAL_LOADING_MESSAGES.sendingQuote
        : status === "routed"
          ? GLOBAL_LOADING_MESSAGES.routingQuote
          : GLOBAL_LOADING_MESSAGES.savingDraft;
    showLoading(loadingMessage);

    const contactName = `${contactFirstName} ${contactLastName}`.trim();
    const resolvedContactPhone = contactPhone || lead?.customer?.phone || "";
    const resolvedContactEmail = contactEmail || lead?.customer?.email || "";
    const effectivePaymentDraft = resolveQuoteDeliveryFromContact(
      paymentDraft,
      resolvedContactPhone,
      resolvedContactEmail,
    );

    const body = {
      ticket_kind: "quote",
      ticket_status: status,
      title: title.trim(),
      linked_lead_id: leadId ?? undefined,
      customer_id: selectedCustomerId ?? lead?.customer?.id ?? undefined,
      contact_name: contactName || (lead?.customer
        ? `${lead.customer.first_name ?? ""} ${lead.customer.last_name ?? ""}`.trim()
        : undefined),
      contact_email: resolvedContactEmail || undefined,
      contact_company: contactCompany || lead?.customer?.company || undefined,
      contact_phone: resolvedContactPhone || undefined,
      industry: contactIndustry || lead?.customer?.industry || undefined,
      website: contactWebsite || lead?.customer?.website || undefined,
      ...(leadId
        ? {}
        : {
            from_quote_page: true,
            quote_source: contactSource || undefined,
          }),
      line_items: lineItemsToApiPayload(skus),
      notes: notes || undefined,
      order_source: orderSource,
      priority,
      due_date: dueDate || undefined,
      rush,
      special_requirements: specialRequirements || undefined,
      quote_channel: effectivePaymentDraft.ticket_quote_channel,
      quote_destination:
        effectivePaymentDraft.ticket_quote_channel === "email"
          ? effectivePaymentDraft.ticket_dest_email
          : effectivePaymentDraft.ticket_dest_phone,
      quote_subtotal: pricing.subtotal,
      ...shippingDestinationsToApiFields(requiresShipping, shippingDestinations),
      discount_type: discountType || undefined,
      discount_value: discountValue || undefined,
      discount_reason: discountReason || undefined,
      quote_pre_tax_total: pricing.pre_tax_total,
      quote_tax_rate_percent: taxRate,
      quote_tax_amount: pricing.tax_amount,
      quote_final_total: pricing.final_total,
      tax_exempt: taxExempt,
      sales_permit_number: salesPermit || undefined,
      prepayment_type:
        effectivePaymentDraft.ticket_payment_strategy === "full" ? "full"
        : effectivePaymentDraft.ticket_payment_strategy === "net"  ? null
        : effectivePaymentDraft.ticket_deposit_type ?? null,
      prepayment_value:
        effectivePaymentDraft.ticket_payment_strategy === "full" ? "100"
        : effectivePaymentDraft.ticket_payment_strategy === "net"  ? null
        : String(effectivePaymentDraft.ticket_deposit_value ?? ""),
      // Per-ticket payment config (migration 066) + reminder start date
      ...effectivePaymentDraft,
      quote_reminder_date: effectivePaymentDraft.quote_reminder_date || undefined,
      ...(status === "routed" && options?.routedReason
        ? {
            routed_reason: options.routedReason,
            ...(options.routedNotes ? { routed_notes: options.routedNotes } : {}),
          }
        : {}),
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
        return;
      }

      const savedTicket = json.ticket;
      const ref = savedTicket?.reference_code as string | undefined;
      const ticketRef = ref ?? savedTicket?.id;
      if (ticketRef) {
        const uploadErr = await uploadPendingVariantFiles(ticketRef, skus);
        if (uploadErr) {
          setError(uploadErr);
          return;
        }

        if (reusingCustomerPermit) {
          const reuseRes = await fetch(`/api/tickets/${ticketRef}/sales-permit/reuse-from-customer`, {
            method: "POST",
          });
          if (!reuseRes.ok) {
            const reuseJson = await reuseRes.json().catch(() => ({}));
            setError(reuseJson.error ?? "Failed to copy customer tax-exempt permit.");
            return;
          }
        } else if (salesPermitFile) {
          const fd = new FormData();
          fd.append("file", salesPermitFile);
          const permitRes = await fetch(`/api/tickets/${ticketRef}/sales-permit`, { method: "POST", body: fd });
          if (!permitRes.ok) {
            const permitJson = await permitRes.json().catch(() => ({}));
            setError(permitJson.error ?? "Failed to upload sales permit file.");
            return;
          }
        }
      }

      window.dispatchEvent(new Event("bazaar:refresh-counts"));
      if (status === "routed" || status === "sent") {
        window.dispatchEvent(new Event("bazaar:tickets-changed"));
      }
      if (status === "sent" && ref) {
        router.push(`/quotes/${ref}`);
      } else {
        router.push("/quotes");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
      hideLoading();
    }
  }

  function handleRouteToSalesClick() {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = "A title is required.";
    }
    if (dueDate) {
      const dueErr = validateDueDateAgainstCreated(dueDate, new Date().toISOString());
      if (dueErr) errors.dueDate = dueErr;
    }
    if (skipCustomerTab && !leadId && !contactSource.trim()) {
      errors.customerSource = "Source is required.";
    }

    const hasFullItem = skus.some(
      (s) => s.product_type?.trim() && (s.quantity ?? 0) > 0 && (s.unit_price ?? 0) > 0,
    );
    if (!hasFullItem) {
      errors.lineItems = "Please fill in at least one complete line item (product, quantity, and unit price).";
    }

    for (let i = 0; i < skus.length; i++) {
      const s = skus[i];
      const missing: string[] = [];
      if (!s.product_type?.trim()) missing.push("product type");
      if (!s.material?.trim()) missing.push("material");
      if (!(s.width != null && s.width > 0)) missing.push("width");
      if (!(s.height != null && s.height > 0)) missing.push("height");
      if (!((s.quantity ?? 0) > 0)) missing.push("quantity");
      if (!((s.unit_price ?? 0) > 0)) missing.push("unit price");
      if (missing.length > 0) {
        errors[`lineItem-${i}`] = `Line ${i + 1}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.`;
      }
    }

    for (let i = 0; i < skus.length; i++) {
      const formSku = skus[i] as FormLineItem;
      const variants = formSku.variants ?? [];
      for (let j = 0; j < variants.length; j++) {
        const v = variants[j];
        if (!String(v.name ?? "").trim()) {
          errors[`lineVariants-${i}`] = `Additional SKU ${j + 1}: name is required.`;
          break;
        }
        const qty = Number(v.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          errors[`lineVariants-${i}`] = `Additional SKU ${j + 1}: quantity must be greater than 0.`;
          break;
        }
      }
    }

    if (tab === "quote") {
      if (taxExempt && !salesPermit.trim()) {
        errors.salesPermit = "Sales Permit # is required when Tax Exempt is selected.";
      }
      if (taxExempt && !hasSalesPermitFile) {
        errors.salesPermitFile = "Permit file is required when Tax Exempt is selected.";
      }
      const zipErr = validateShippingDestinationZips(
        requiresShipping ? shippingDestinations : [],
      );
      if (zipErr) errors.shipToZip = zipErr;
    }

    const websiteToValidate = contactWebsite || lead?.customer?.website || "";
    const websiteErr = validateWebsite(websiteToValidate);
    if (websiteErr) {
      errors.customerWebsite = websiteErr;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.salesPermit || errors.shipToZip) {
        setTab("quote");
      } else if (errors.lineItems) {
        setTab("lines");
      } else if (errors.customerWebsite) {
        setTab(skipCustomerTab ? "info" : "customer");
      } else if (errors.title || errors.dueDate || errors.customerSource) {
        setTab("info");
      }
      const errorTab: Tab =
        errors.salesPermit || errors.salesPermitFile || errors.shipToZip
          ? "quote"
          : errors.lineItems
            ? "lines"
            : errors.customerWebsite
              ? skipCustomerTab
                ? "info"
                : "customer"
              : "info";
      scrollToValidationError(errors, errorTab);
      return;
    }

    setFieldErrors({});
    setRouteForm({ routed_reason: "", routed_notes: "" });
    setRouteModalOpen(true);
  }

  const sendMissingFields = useMemo(
    () =>
      getQuoteSendMissingFields({
        title,
        dueDate,
        skus,
        taxExempt,
        salesPermit,
        hasSalesPermitFile,
        requiresShipping,
        shipToDestinations: shippingDestinations,
        paymentDraft,
      }),
    [title, dueDate, skus, taxExempt, salesPermit, hasSalesPermitFile, requiresShipping, shippingDestinations, paymentDraft],
  );
  const quoteSendReady = sendMissingFields.length === 0;
  const sendMissingMessage = formatQuoteSendMissingMessage(sendMissingFields);

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

        {/* ── Left: Customer Card (CRM or locked existing customer) ── */}
        {!lead && (hasCustomerParams || customerLocked) && (
          <aside className="w-72 shrink-0">
            <CustomerSidebarCard
              firstName={contactFirstName}
              lastName={contactLastName}
              company={contactCompany}
              phone={contactPhone}
              email={contactEmail}
              website={contactWebsite}
              authority={contactAuthority || null}
            />
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
          {(() => {
            const visibleTabs = TABS.filter((t) => !(skipCustomerTab && t.id === "customer"));
            const currentIdx = visibleTabs.findIndex((t) => t.id === tab);
            return (
              <div
                className="flex border-b mb-6"
                style={{ borderColor: "var(--color-border)" }}
              >
                {visibleTabs.map((t, i) => {
                  const isCurrent = i === currentIdx;
                  const isPast = i < currentIdx;
                  const isFuture = i > currentIdx;

                  function handleTabClick() {
                    if (isCurrent) return;
                    if (isPast) {
                      // Going back — allow freely, clear errors
                      setFieldErrors({});
                      setTab(t.id);
                    } else {
                      // Going forward — must pass current tab validation first (sequential only)
                      validateAndAdvance(visibleTabs[currentIdx + 1].id);
                    }
                  }

                  return (
                    <button
                      key={t.id}
                      onClick={handleTabClick}
                      className="px-4 py-2.5 text-sm font-medium transition-colors relative"
                      style={{
                        color: isCurrent
                          ? "var(--color-tab-active)"
                          : isFuture
                          ? "var(--color-text-muted)"
                          : "var(--color-tab-inactive)",
                        fontWeight: isCurrent ? 500 : 400,
                        opacity: isFuture ? 0.5 : 1,
                        cursor: isFuture ? "not-allowed" : "pointer",
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold"
                          style={{
                            background: isCurrent
                              ? "var(--color-accent)"
                              : isPast
                              ? "var(--color-success-bg)"
                              : "var(--color-neutral-bg)",
                            color: isCurrent
                              ? "var(--color-btn-primary-text)"
                              : isPast
                              ? "var(--color-success)"
                              : "var(--color-text-muted)",
                          }}
                        >
                          {i + 1}
                        </span>
                        {t.label}
                      </span>
                      {isCurrent && (
                        <span
                          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                          style={{ background: "var(--color-tab-underline)" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Tab content */}
          <div
            ref={tabContentRef}
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
                source={contactSource} setSource={(v) => { setContactSource(v); setFieldErrors((e) => ({ ...e, customerSource: "" })); }}
                industry={contactIndustry} setIndustry={(v) => { setContactIndustry(v); setFieldErrors((e) => ({ ...e, customerIndustry: "" })); }}
                website={contactWebsite} setWebsite={setContactWebsite}
                sourceOpts={customerLookups.source}
                industryOpts={customerLookups.industry}
                locked={customerLocked} setLocked={setCustomerLocked}
                foundName={customerFoundName} setFoundName={setCustomerFoundName}
                errors={fieldErrors}
                onCustomerFound={(c) => {
                  setSelectedCustomerId(c.id);
                  if (c.authority) setContactAuthority(c.authority);
                }}
                onCustomerCleared={() => {
                  setSelectedCustomerId(null);
                  setContactAuthority("");
                }}
              />
            )}

            {tab === "info" && (
              <div className="space-y-5">
                {skipCustomerTab && !leadId && (
                  <QuoteSourceFields
                    source={contactSource}
                    setSource={(v) => { setContactSource(v); setFieldErrors((e) => ({ ...e, customerSource: "" })); }}
                    sourceOpts={customerLookups.source}
                    sourceError={fieldErrors.customerSource}
                  />
                )}
                <InfoForm
                  title={title} setTitle={(v) => { setTitle(v); setFieldErrors((e) => ({ ...e, title: "" })); }}
                  priority={priority} setPriority={setPriority}
                  dueDate={dueDate} setDueDate={(v) => { setDueDate(v); setFieldErrors((e) => ({ ...e, dueDate: "" })); }}
                  rush={rush} setRush={setRush}
                  specialRequirements={specialRequirements} setSpecialRequirements={setSpecialRequirements}
                  notes={notes} setNotes={setNotes}
                  priorityOpts={quoteLookups.ticket_priority}
                  titleError={fieldErrors.title}
                  dueDateError={fieldErrors.dueDate}
                  dueDateRequired={false}
                  minDueDate={minDueDateForNewTicket()}
                />
              </div>
            )}

            {tab === "lines" && (
              <div data-field-anchor="lineItems">
                <LineItemsForm
                  skus={skus}
                  products={products}
                  skuLookups={skuLookups}
                  onUpdate={updateSku}
                  onRemove={removeSku}
                  onAdd={addSku}
                  onVariantsChange={updateVariants}
                  onLineAttachmentChange={updateLineAttachment}
                  error={fieldErrors.lineItems}
                  rowErrors={
                    Object.keys(fieldErrors)
                      .filter((k) => k.startsWith("lineItem-"))
                      .reduce<Record<number, string>>((acc, k) => {
                        acc[Number(k.replace("lineItem-", ""))] = fieldErrors[k];
                        return acc;
                      }, {})
                  }
                  variantErrors={
                    Object.keys(fieldErrors)
                      .filter((k) => k.startsWith("lineVariants-"))
                      .reduce<Record<number, string>>((acc, k) => {
                        acc[Number(k.replace("lineVariants-", ""))] = fieldErrors[k];
                        return acc;
                      }, {})
                  }
                />
              </div>
            )}

            {tab === "quote" && (
              <div data-field-anchor="salesPermit">
                {sendMissingFields.length > 0 && (
                  <div
                    className="mb-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
                    style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "1px solid var(--color-warning-border)" }}
                  >
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
                    <span>
                      {sendMissingMessage} Complete {sendMissingFields.length === 1 ? "this field" : "these fields"} before sending.
                    </span>
                  </div>
                )}
                {showCustomerTaxExemptBanner && (
                  <div
                    className="mb-4 rounded-lg border px-4 py-3 text-sm space-y-3"
                    style={{
                      background: "var(--color-info-bg)",
                      borderColor: "var(--color-info-border)",
                      color: "var(--color-info-text-deep)",
                    }}
                  >
                    <p>
                      This customer has a tax-exempt permit on file
                      {customerTaxExemptLast?.tax_exempt_last_file_name
                        ? ` (${customerTaxExemptLast.tax_exempt_last_file_name})`
                        : ""}.
                      Reusing copies it to this quote; <strong>accountant approval is still required per quote</strong> after you send.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium"
                        style={{
                          background: reusingCustomerPermit
                            ? "var(--color-btn-primary-bg)"
                            : "var(--color-surface)",
                          color: reusingCustomerPermit
                            ? "var(--color-btn-primary-text)"
                            : "var(--color-text-primary)",
                          border: "1px solid var(--color-border)",
                        }}
                        onClick={() => {
                          setTaxExemptReuseChoice("reuse");
                          setSalesPermit(customerTaxExemptLast?.tax_exempt_last_permit_number ?? "");
                          setSalesPermitFile(null);
                          setFieldErrors((e) => ({ ...e, salesPermit: "", salesPermitFile: "" }));
                        }}
                      >
                        Reuse customer permit
                      </button>
                      <button
                        type="button"
                        className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium border"
                        style={{
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-primary)",
                          background: taxExemptReuseChoice === "upload" ? "var(--color-row-alt)" : "var(--color-surface)",
                        }}
                        onClick={() => {
                          setTaxExemptReuseChoice("upload");
                          setSalesPermitFile(null);
                        }}
                      >
                        Upload new file
                      </button>
                      <button
                        type="button"
                        className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium"
                        style={{ color: "var(--color-text-muted)" }}
                        onClick={() => setTaxExemptReuseChoice("ignore")}
                      >
                        Dismiss
                      </button>
                    </div>
                    {reusingCustomerPermit && (
                      <p className="text-[12px]" style={{ color: "var(--color-info-text)" }}>
                        Permit # prefilled. File will be attached when you save the quote.
                      </p>
                    )}
                  </div>
                )}
                <QuoteForm
                  pricing={pricing}
                  requiresShipping={requiresShipping}
                  setRequiresShipping={setRequiresShipping}
                  shippingDestinations={shippingDestinations}
                  setShippingDestinations={setShippingDestinations}
                  customerId={selectedCustomerId ?? lead?.customer?.id ?? null}
                  zipError={fieldErrors.shipToZip}
                  discountType={discountType} setDiscountType={setDiscountType}
                  discountValue={discountValue} setDiscountValue={setDiscountValue}
                  discountReason={discountReason} setDiscountReason={setDiscountReason}
                  taxRate={taxRate} setTaxRate={setTaxRate}
                  taxExempt={taxExempt}
                  setTaxExempt={(v) => {
                    setTaxExempt(v);
                    if (!v) setTaxExemptReuseChoice("none");
                  }}
                  salesPermit={salesPermit} setSalesPermit={(v) => { setSalesPermit(v); setFieldErrors((e) => ({ ...e, salesPermit: "" })); }}
                  salesPermitError={fieldErrors.salesPermit}
                  salesPermitPendingFile={salesPermitFile}
                  setSalesPermitPendingFile={(f) => {
                    setSalesPermitFile(f);
                    if (f) setTaxExemptReuseChoice("upload");
                    setFieldErrors((e) => ({ ...e, salesPermitFile: "" }));
                  }}
                  salesPermitFileError={fieldErrors.salesPermitFile}
                  paymentDraft={paymentDraft}
                  onPaymentChange={setPaymentDraft}
                  customerPhone={contactPhone || lead?.customer?.phone || ""}
                  customerEmail={contactEmail || lead?.customer?.email || ""}
                />
              </div>
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

              {userRole === "sdr" && (tab === "lines" || tab === "quote") && (
                <button
                  disabled={saving}
                  onClick={handleRouteToSalesClick}
                  className="px-4 py-2 text-sm font-medium rounded-md border transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{
                    borderColor: "var(--color-info-border)",
                    color: "var(--color-info-text-deep)",
                    background: "var(--color-info-bg)",
                  }}
                >
                  Route to Sales
                </button>
              )}

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
                  disabled={saving || !quoteSendReady}
                  title={!quoteSendReady ? sendMissingMessage : undefined}
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
          onCancel={() => {
            if (hvTimerRef.current) { clearInterval(hvTimerRef.current); hvTimerRef.current = null; }
            setHvModal(false);
          }}
        />
      )}

      {routeModalOpen && (
        <RouteToSalesModal
          reasons={routeReasons}
          form={routeForm}
          onChange={setRouteForm}
          saving={saving}
          onCancel={() => {
            setRouteModalOpen(false);
            setRouteForm({ routed_reason: "", routed_notes: "" });
          }}
          onConfirm={() => {
            setRouteModalOpen(false);
            void handleSave("routed", {
              routedReason: routeForm.routed_reason,
              routedNotes: routeForm.routed_notes.trim() || undefined,
            });
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
  onCancel: () => void;
}

function HighValueModal({ threshold, total, countdown, onOk, onCancel }: HighValueModalProps) {
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

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              background: "transparent",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border)",
            }}
          >
            Cancel — Edit Amount
          </button>
          <button
            onClick={onOk}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
          >
            OK — Route to Sales
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quote source (Info tab when customer is pre-filled) ─────────────────────

function QuoteSourceFields({
  source,
  setSource,
  sourceOpts,
  sourceError,
}: {
  source: string;
  setSource: (v: string) => void;
  sourceOpts: LookupOption[];
  sourceError?: string;
}) {
  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
    >
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Quote source
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          Where did this quote opportunity come from? Stored on the quote record.
        </p>
      </div>
      <div data-field-anchor="customerSource">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
          Source <span style={{ color: "var(--color-danger)" }}>*</span>
        </label>
        <Select value={source} onValueChange={(v) => setSource(v ?? "")}>
          <SelectTrigger
            className="h-9 text-sm w-full"
            style={sourceError ? { borderColor: "var(--color-danger)" } : undefined}
          >
            <SelectValue placeholder="Select source…">
              {sourceOpts.find((s) => s.value === source)?.label ?? "Select source…"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sourceOpts.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sourceError && (
          <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{sourceError}</p>
        )}
      </div>
    </div>
  );
}

// ─── Customer Tab ─────────────────────────────────────────────────────────────

interface CustomerTabProps {
  firstName: string; setFirstName: (v: string) => void;
  lastName: string; setLastName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  company: string; setCompany: (v: string) => void;
  source: string; setSource: (v: string) => void;
  industry: string; setIndustry: (v: string) => void;
  website: string; setWebsite: (v: string) => void;
  sourceOpts: LookupOption[];
  industryOpts: LookupOption[];
  locked: boolean; setLocked: (v: boolean) => void;
  foundName: string | null; setFoundName: (v: string | null) => void;
  errors?: Record<string, string>;
  onCustomerFound?: (customer: CrmCustomer) => void;
  onCustomerCleared?: () => void;
}

interface CrmCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  industry: string | null;
  website: string | null;
  authority?: string | null;
  latest_source?: string | null;
}

function CustomerTab(p: CustomerTabProps) {
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<CrmCustomer[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use lifted state from parent so lock persists across tab navigation
  const locked = p.locked;
  const setLocked = p.setLocked;
  const foundName = p.foundName;
  const setFoundName = p.setFoundName;

  const fieldStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text-primary)",
  };
  const lockedStyle = {
    background: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text-muted)",
    cursor: "not-allowed" as const,
    opacity: 0.75,
  };
  const errStyle = (key: string) =>
    p.errors?.[key] ? { border: "1px solid var(--color-danger)" } : {};

  function applyCustomer(c: CrmCustomer) {
    if (c.phone) p.setPhone(c.phone);
    p.setFirstName(c.first_name ?? "");
    p.setLastName(c.last_name ?? "");
    p.setEmail(c.email ?? "");
    p.setCompany(c.company ?? "");
    p.setIndustry(c.industry ?? "");
    p.setWebsite(c.website ?? "");
    if (c.latest_source) p.setSource(c.latest_source);
    setFoundName([c.first_name, c.last_name].filter(Boolean).join(" ") || "Customer");
    setLocked(true);
    setCandidates([]);
    p.onCustomerFound?.(c);
  }

  function dismissModal() {
    // User chose "New Customer" — clear any pre-filled data and keep fields editable
    setCandidates([]);
    p.setFirstName("");
    p.setLastName("");
    p.setEmail("");
    p.setCompany("");
    p.setIndustry("");
    p.setWebsite("");
    p.setSource("");
    p.onCustomerCleared?.();
  }

  function clearLock() {
    setLocked(false);
    setFoundName(null);
    setCandidates([]);
    p.setFirstName("");
    p.setLastName("");
    p.setEmail("");
    p.setCompany("");
    p.setIndustry("");
    p.setWebsite("");
    p.setSource("");
    p.onCustomerCleared?.();
  }

  function handlePhoneChange(v: string) {
    p.setPhone(v);

    // Reset lock when phone changes
    if (locked) {
      setLocked(false);
      setFoundName(null);
      setCandidates([]);
      p.setFirstName("");
      p.setLastName("");
      p.setEmail("");
      p.setCompany("");
      p.setIndustry("");
      p.setWebsite("");
      p.setSource("");
      p.onCustomerCleared?.();
    }

    // Debounce search — trigger after 600ms of no typing
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const digits = v.replace(/\D/g, "");
      if (digits.length >= 7) {
        setSearching(true);
        fetch(`/api/customers/lookup?phone=${encodeURIComponent(v)}`)
          .then((r) => r.json())
          .then((d) => {
            const matches: CrmCustomer[] = d.customers ?? [];
            if (matches.length > 0) {
              // Always show the picker modal — even for a single match —
              // so the rep consciously selects or creates a new customer.
              setCandidates(matches);
            }
          })
          .catch(() => {})
          .finally(() => setSearching(false));
      }
    }, 600);
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
          Who is this quote for?
        </h3>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Enter the customer&apos;s phone number — if they exist in the CRM, their details will fill in automatically.
        </p>
      </div>

      {/* Customer picker modal */}
      {candidates.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div
            className="w-full max-w-md rounded-xl p-6 space-y-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
          >
            <div>
              <h3 className="text-base font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
                {candidates.length === 1 ? "Existing customer found" : `${candidates.length} customers found`}
              </h3>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Select a customer to use their information, or create a new one.
              </p>
            </div>

            <div className="space-y-2">
              {candidates.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => applyCustomer(c)}
                    className="w-full flex items-start gap-3 px-4 py-3 rounded-lg text-left transition-opacity hover:opacity-80"
                    style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{name}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
                        {[c.company, c.email].filter(Boolean).join(" · ") || "No additional info"}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full mt-0.5"
                      style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                    >
                      Select
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
              <button
                type="button"
                onClick={dismissModal}
                className="w-full py-2 text-sm font-medium rounded-lg transition-opacity hover:opacity-80"
                style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              >
                + Create new customer with this number
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected customer banner */}
      {locked && foundName && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm"
          style={{
            background: "var(--color-success-bg)",
            border: "1px solid var(--color-success-border)",
            color: "var(--color-success)",
          }}
        >
          <span className="font-medium">✓ Existing customer: {foundName}</span>
          <button
            type="button"
            onClick={clearLock}
            className="text-xs underline hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-success)" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Row 1: Phone | Email */}
      <div className="grid grid-cols-2 gap-4" data-field-anchor="customerContact">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Phone <span style={{ color: "var(--color-danger)" }}>*</span>
            {searching && (
              <span className="ml-2 text-[10px] font-normal" style={{ color: "var(--color-text-muted)" }}>
                searching…
              </span>
            )}
          </label>
          <div style={errStyle("customerContact") ? { borderRadius: "6px", ...errStyle("customerContact") } : {}}>
            <PhoneInput value={p.phone} onChange={handlePhoneChange} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Email
          </label>
          <div style={locked ? {} : (errStyle("customerContact") ? { borderRadius: "6px", ...errStyle("customerContact") } : {})}>
            <EmailInput
              value={p.email}
              onChange={(e) => { if (!locked) p.setEmail(e.target.value); }}
              disabled={locked}
            />
          </div>
        </div>
      </div>
      {p.errors?.customerContact && (
        <p className="text-xs -mt-3" style={{ color: "var(--color-danger)" }}>{p.errors.customerContact}</p>
      )}

      {/* Row 2: First Name | Last Name */}
      <div className="grid grid-cols-2 gap-4" data-field-anchor="customerName">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            First Name <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <input
            value={p.firstName}
            onChange={(e) => { if (!locked) p.setFirstName(e.target.value); }}
            readOnly={locked}
            placeholder="Jane"
            className="w-full px-3 py-2 rounded-md text-sm border outline-none"
            style={{ ...(locked ? lockedStyle : fieldStyle), ...(!locked ? errStyle("customerName") : {}) }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Last Name <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <input
            value={p.lastName}
            onChange={(e) => { if (!locked) p.setLastName(e.target.value); }}
            readOnly={locked}
            placeholder="Smith"
            className="w-full px-3 py-2 rounded-md text-sm border outline-none"
            style={{ ...(locked ? lockedStyle : fieldStyle), ...(!locked ? errStyle("customerName") : {}) }}
          />
        </div>
      </div>
      {!locked && p.errors?.customerName && (
        <p className="text-xs -mt-3" style={{ color: "var(--color-danger)" }}>{p.errors.customerName}</p>
      )}

      {/* Row 3: Company */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Company</label>
        <input
          value={p.company}
          onChange={(e) => { if (!locked) p.setCompany(e.target.value); }}
          readOnly={locked}
          placeholder="ACME Corp"
          className="w-full px-3 py-2 rounded-md text-sm border outline-none"
          style={locked ? lockedStyle : fieldStyle}
        />
      </div>

      {/* Row 4: Source */}
      <div data-field-anchor="customerSource">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
          Source <span style={{ color: "var(--color-danger)" }}>*</span>
        </label>
        <Select value={p.source} onValueChange={(v) => p.setSource(v ?? "")}>
          <SelectTrigger
            className="h-9 text-sm w-full"
            style={p.errors?.customerSource ? { borderColor: "var(--color-danger)" } : undefined}
          >
            <SelectValue placeholder="Select source…">
              {p.sourceOpts.find((s) => s.value === p.source)?.label ?? "Select source…"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {p.sourceOpts.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {p.errors?.customerSource && (
          <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.errors.customerSource}</p>
        )}
      </div>

      {/* Row 5: Industry | Website */}
      <div className="grid grid-cols-2 gap-4">
        <div data-field-anchor="customerIndustry">
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Industry <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <Select value={p.industry} onValueChange={(v) => p.setIndustry(v ?? "")}>
            <SelectTrigger
              className="h-9 text-sm w-full"
              style={p.errors?.customerIndustry ? { borderColor: "var(--color-danger)" } : undefined}
            >
              <SelectValue placeholder="Select industry…">
                {p.industryOpts.find((i) => i.value === p.industry)?.label ?? "Select industry…"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {p.industryOpts.map((i) => (
                <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {p.errors?.customerIndustry && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.errors.customerIndustry}</p>
          )}
        </div>
        <div data-field-anchor="customerWebsite">
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Website / Social
          </label>
          <input
            value={p.website}
            onChange={(e) => p.setWebsite(e.target.value)}
            placeholder={WEBSITE_FIELD_PLACEHOLDER}
            className="w-full px-3 py-2 rounded-md text-sm border outline-none"
            style={{ ...fieldStyle, ...errStyle("customerWebsite") }}
          />
          {p.errors?.customerWebsite && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.errors.customerWebsite}</p>
          )}
        </div>
      </div>
    </div>
  );
}

