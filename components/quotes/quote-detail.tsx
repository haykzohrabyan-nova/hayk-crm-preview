"use client";

import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Trash2,
  Pencil,
  Check,
  X,
  User,
  Phone,
  Mail,
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Zap,
  ChevronDown,
  Printer,
  Lock,
  Link,
  Copy,
} from "lucide-react";
import { computePricing, formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import {
  formatQuoteSendMissingMessage,
  getQuoteSendMissingFields,
} from "@/lib/utils/validate-quote-send";
import { buildAdminConvertPreview } from "@/lib/utils/admin-convert-preview";
import type { ManualConvertMeta } from "@/lib/utils/manual-convert-meta";
import { isPaymentEvidencePending, isTicketPaidInFull, computeInvoicePaymentSummary } from "@/lib/utils/invoice-payment-summary";
import { formatPhone, digitsOnly } from "@/lib/utils/phone";
import { resolveTicketDetailBackPath } from "@/lib/utils/ticket-detail-href";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { LinkedLeadCard } from "@/components/ui/linked-lead-card";

import { createClient } from "@/lib/supabase/client";
import { type TicketPaymentDraft, PAYMENT_CONFIG_DEFAULTS } from "@/components/quotes/quote-payment-config";
import { localDateStringFromIso, validateDueDateAgainstCreated } from "@/lib/utils/due-date";
import { validateShipToZip, validateShippingCharge } from "@/lib/utils/address";
import type { ShipToFields } from "@/lib/utils/address";
import { InfoForm } from "@/components/quotes/shared/info-form";
import { LineItemsForm } from "@/components/quotes/shared/line-items-form";
import { QuoteForm } from "@/components/quotes/shared/quote-form";
import { ShippingFulfillmentSection } from "@/components/quotes/shared/shipping-fulfillment-section";
import {
  bundleToFormLineItems,
  emptyFormLineItem,
  type FormLineItem,
} from "@/components/quotes/shared/utils";
import {
  lineItemsToApiPayload,
  uploadPendingVariantFiles,
} from "@/components/quotes/shared/line-item-variants";
import type { TicketLineItemRow } from "@/lib/utils/ticket-line-items";
import { lineItemsToDisplayRows } from "@/lib/utils/ticket-line-items";
import type { LookupOption as SharedLookupOption, SkuLookups as SharedSkuLookups } from "@/components/quotes/shared/types";
import { HistorySection } from "@/components/quotes/quote-detail/history-section";
import { TicketSkeleton } from "@/components/quotes/quote-detail/ticket-skeleton";
import { CustomerInfoCard } from "@/components/quotes/quote-detail/customer-info-card";
import { OrderPaymentSummary } from "@/components/quotes/quote-detail/order-payment-summary";
import { TicketDetailOverview } from "@/components/quotes/quote-detail/ticket-detail-overview";
import { TicketOverviewSections } from "@/components/quotes/quote-detail/ticket-overview-sections";
import { TicketStatsRow } from "@/components/quotes/quote-detail/ticket-stats-row";
import { TicketLifecycleTimeline } from "@/components/quotes/quote-detail/ticket-lifecycle-timeline";
import { ticketIsQuoteStage } from "@/lib/utils/reference-codes";
import { DetailQuickActions } from "@/components/quotes/quote-detail/detail-quick-actions";
import { CancelTicketModal, type CancelTicketForm } from "@/components/quotes/quote-detail/cancel-ticket-modal";
import { ResendAfterSaveModal } from "@/components/quotes/quote-detail/resend-after-save-modal";
import {
  shouldOfferResendAfterSave,
  resendDeliveryMode,
  type ResendPromptKind,
} from "@/lib/utils/should-offer-resend-after-save";
import { OUTREACH_CHANNEL_LABEL, resolveOutreachChannelKind } from "@/lib/utils/outreach-channel-display";
import { CancelledReasonBanner } from "@/components/quotes/quote-detail/cancelled-reason-banner";
import { cancelReasonCategoryForStatus } from "@/lib/utils/cancel-reason-category";
import type { LookupValue } from "@/lib/types";
import { DetailStatusDotBadge, DetailCollapsibleSection } from "@/components/quotes/quote-detail/detail-layout-primitives";
import {
  GLOBAL_LOADING_MESSAGES,
  useGlobalLoading,
} from "@/components/layout/global-loading-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  created_at?: string | null;
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
  } | null;
}

interface Ticket {
  id: string;
  ticket_kind: "quote" | "order";
  ticket_status: string;
  title: string | null;
  reference_code: string | null;
  created_at: string;
  updated_at: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
  contact_phone: string | null;
  line_items?: TicketLineItemRow[];
  notes: string | null;
  order_source: string | null;
  quote_source: string | null;
  linked_lead_id: string | null;
  customer_id: string | null;
  priority: string | null;
  due_date: string | null;
  rush: boolean;
  design_required: boolean;
  die_cut: boolean;
  special_requirements: string | null;
  quote_channel: string | null;
  quote_destination: string | null;
  quote_subtotal: number | null;
  quote_shipping: number | null;
  requires_shipping: boolean;
  ship_to_line1: string | null;
  ship_to_line2: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  discount_type: string | null;
  discount_value: string | null;
  discount_reason: string | null;
  quote_pre_tax_total: number | null;
  quote_tax_rate_percent: number | null;
  quote_tax_amount: number | null;
  quote_final_total: number | null;
  tax_exempt: boolean;
  sales_permit_number: string | null;
  quote_payment_types: string[];
  payment_status: "unpaid" | "partial" | "paid" | null;
  prepayment_type: string | null;
  prepayment_value: string | null;
  prepayment_status: "pending" | "paid" | null;
  quote_reminder_date: string | null;
  follow_up_cycles: number | null;
  follow_up_frequency: string | null;
  client_confirmed: boolean;
  public_token: string | null;
  routed_by_id: string | null;
  lead: Lead | null;
  created_by: { id: string; full_name: string | null } | null;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
    industry: string | null;
    website: string | null;
    created_at?: string | null;
  } | null;
  // Per-ticket payment config (migration 066)
  ticket_payment_strategy:       "partial" | "full" | "net" | null;
  ticket_deposit_type:           "percent" | "fixed" | null;
  ticket_deposit_value:          number | null;
  ticket_dep_handling:           "cash" | "gateway" | null;
  ticket_receipt_id:             string | null;
  ticket_partial_channels:       string[] | null;
  ticket_full_channels:          string[] | null;
  ticket_require_client_confirm: boolean | null;
  ticket_net_terms_label:        string | null;
  ticket_quote_channel:          "sms" | "email" | "both" | null;
  ticket_dest_phone:             string | null;
  ticket_dest_email:             string | null;
  ticket_follow_up_enabled:      boolean | null;
  ticket_follow_up_count:        number | null;
  ticket_follow_up_freq:         "daily" | "every-3-days" | "weekly" | null;
  // Payment recording (migration 066)
  payment_amount_received:        number | null;
  payment_paid_at:                string | null;
  payment_method_used:            string | null;
  deposit_amount:                 number | null;
  deposit_paid_at:                string | null;
  deposit_receipt_id:             string | null;
  deposit_method:                 string | null;
  balance_paid_at:                string | null;
  production_released_at:         string | null;
  // Payment evidence (migration 068)
  payment_evidence_url:           string | null;
  payment_evidence_submitted_at:  string | null;
  payment_evidence_reviewed_at:   string | null;
  payment_evidence_amount:        number | null;
  convert_meta?: ManualConvertMeta | null;
  cancel_reason?: string | null;
  cancel_reason_label?: string | null;
  cancel_notes?: string | null;
}

interface ProductType {
  id: string;
  name: string;
  material_groups: {
    group: { id: string; name: string };
    materials: { id: string; name: string }[];
  }[];
}

type Tab = "info" | "history";

const VIEW_TABS: { id: Tab; label: string }[] = [
  { id: "info", label: "Info" },
  { id: "history", label: "History" },
];

type LookupOption = SharedLookupOption;
type SkuLookups = SharedSkuLookups;
const CHANNEL_OPTIONS = ["Email", "SMS", "WhatsApp", "In-person"];
const PAYMENT_OPTIONS = ["Card Payment", "Zelle", "Offline"];
const FOLLOW_UP_FREQ = ["Daily", "Every 2 days", "Weekly"];


function emptySkuRow(): FormLineItem { return emptyFormLineItem(); }

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:    { bg: "var(--color-neutral-bg)",  text: "var(--color-neutral-text)" },
  sent:     { bg: "var(--color-info-bg)",     text: "var(--color-info-text)" },
  approved: { bg: "var(--color-success-bg)",  text: "var(--color-success)" },
  cancelled:{ bg: "var(--color-danger-bg)",   text: "var(--color-danger)" },
  order:    { bg: "var(--color-badge-bg)",    text: "var(--color-badge-text)" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuoteDetail({ ticketId, context = "order" }: { ticketId: string; context?: "quote" | "order" | "production" | "payment" | "completed" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnFrom = searchParams.get("from");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [skuLookups, setSkuLookups] = useState<SkuLookups>({
    lamination: [], color_mode: [], sides: [], roll_direction: [], finishing: [],
  });
  const [quoteLookups, setQuoteLookups] = useState<{
    ticket_priority: LookupOption[];
    quote_channel: LookupOption[];
    ticket_payment: LookupOption[];
    follow_up_freq: LookupOption[];
  }>({ ticket_priority: [], quote_channel: [], ticket_payment: [], follow_up_freq: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showLoading, hideLoading } = useGlobalLoading();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsWarning, setNoticeIsWarning] = useState(false);
  const [tab, setTab] = useState<Tab>("info");

  // ── Current user role + company config (for HV threshold enforcement) ───────
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [hvThreshold, setHvThreshold] = useState<number | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
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
    fetch("/api/admin/company")
      .then((r) => r.json())
      .then((d) => { if (d.settings?.high_value_threshold != null) setHvThreshold(d.settings.high_value_threshold); })
      .catch(() => {});
    fetch("/api/lookups?categories=quote_cancel_reason,order_cancel_reason")
      .then((r) => r.json())
      .then((d) => {
        setCancelReasonLookups({
          quote: d.quote_cancel_reason ?? [],
          order: d.order_cancel_reason ?? [],
        });
      })
      .catch(() => {});
  }, []);

  // ── High-value threshold modal ────────────────────────────────────────────
  const [hvModal, setHvModal] = useState(false);
  const [hvCountdown, setHvCountdown] = useState(30);
  const hvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Clear countdown timer on unmount to prevent state updates on an unmounted component.
  useEffect(() => () => { if (hvTimerRef.current) clearInterval(hvTimerRef.current); }, []);
  const [convertModal, setConvertModal] = useState<ReturnType<typeof buildAdminConvertPreview> | null>(null);
  const [completeModalBalance, setCompleteModalBalance] = useState<number | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelForm, setCancelForm] = useState<CancelTicketForm>({ cancel_reason: "", cancel_notes: "" });
  const [cancelReasonLookups, setCancelReasonLookups] = useState<{
    quote: LookupValue[];
    order: LookupValue[];
  }>({ quote: [], order: [] });
  const [resendPrompt, setResendPrompt] = useState<ResendPromptKind | null>(null);
  const [resendSending, setResendSending] = useState(false);
  const handleSaveRef = useRef<
    ((
      newStatus?: string,
      extraFields?: Record<string, unknown>,
      opts?: { skipSendValidation?: boolean; notifyRevision?: "standard" | "admin"; skipResendPrompt?: boolean },
    ) => Promise<void>) | null
  >(null);

  // Edit state mirrors ticket fields
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [dueDate, setDueDate] = useState("");
  const [rush, setRush] = useState(false);
  const [orderSource, setOrderSource] = useState("quoted");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [notes, setNotes] = useState("");
  const [skus, setSkus] = useState<FormLineItem[]>([emptyFormLineItem()]);
  const [requiresShipping, setRequiresShipping] = useState(false);
  const [shipTo, setShipTo] = useState<ShipToFields>({
    ship_to_line1: "",
    ship_to_line2: "",
    ship_to_city: "",
    ship_to_state: "",
    ship_to_zip: "",
  });
  const [shipping, setShipping] = useState(0);
  const [discountType, setDiscountType] = useState<"percent" | "fixed" | "">("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [taxExempt, setTaxExempt] = useState(false);
  const [salesPermit, setSalesPermit] = useState("");
  const [paymentDraft, setPaymentDraft] = useState<TicketPaymentDraft>(PAYMENT_CONFIG_DEFAULTS);
  const [salesPermitError, setSalesPermitError] = useState<string | undefined>();
  const [titleError, setTitleError] = useState<string | undefined>();
  const [dueDateError, setDueDateError] = useState<string | undefined>();
  const [completionAt, setCompletionAt] = useState<string | null>(null);

  // ─── Load ─────────────────────────────────────────────────────────────────

  function populateEditState(t: Ticket) {
    setTitle(t.title ?? "");
    setPriority(t.priority ?? "Normal");
    setDueDate(t.due_date ?? "");
    setRush(t.rush ?? false);
    setOrderSource(t.order_source ?? "quoted");
    setSpecialRequirements(t.special_requirements ?? "");
    setNotes(t.notes ?? "");
    setSkus(
      t.line_items?.length
        ? bundleToFormLineItems(t.line_items)
        : [emptyFormLineItem()],
    );
    setShipping(t.quote_shipping ?? 0);
    setRequiresShipping(t.requires_shipping ?? (t.quote_shipping ?? 0) > 0);
    setShipTo({
      ship_to_line1: t.ship_to_line1 ?? "",
      ship_to_line2: t.ship_to_line2 ?? "",
      ship_to_city: t.ship_to_city ?? "",
      ship_to_state: t.ship_to_state ?? "",
      ship_to_zip: t.ship_to_zip ?? "",
    });
    setDiscountType((t.discount_type as "percent" | "fixed" | "") ?? "");
    setDiscountValue(t.discount_value ?? "");
    setDiscountReason(t.discount_reason ?? "");
    setTaxRate(t.quote_tax_rate_percent ?? 0);
    setTaxExempt(t.tax_exempt ?? false);
    setSalesPermit(t.sales_permit_number ?? "");
    setPaymentDraft({
      ticket_payment_strategy:       t.ticket_payment_strategy       ?? PAYMENT_CONFIG_DEFAULTS.ticket_payment_strategy,
      ticket_deposit_type:           t.ticket_deposit_type           ?? PAYMENT_CONFIG_DEFAULTS.ticket_deposit_type,
      ticket_deposit_value:          t.ticket_deposit_value          ?? PAYMENT_CONFIG_DEFAULTS.ticket_deposit_value,
      ticket_dep_handling:           t.ticket_dep_handling           ?? PAYMENT_CONFIG_DEFAULTS.ticket_dep_handling,
      ticket_receipt_id:             t.ticket_receipt_id             ?? PAYMENT_CONFIG_DEFAULTS.ticket_receipt_id,
      ticket_partial_channels:       t.ticket_partial_channels       ?? PAYMENT_CONFIG_DEFAULTS.ticket_partial_channels,
      ticket_full_channels:          t.ticket_full_channels          ?? PAYMENT_CONFIG_DEFAULTS.ticket_full_channels,
      ticket_require_client_confirm: t.ticket_require_client_confirm ?? PAYMENT_CONFIG_DEFAULTS.ticket_require_client_confirm,
      ticket_net_terms_label:        t.ticket_net_terms_label        ?? PAYMENT_CONFIG_DEFAULTS.ticket_net_terms_label,
      ticket_quote_channel:          t.ticket_quote_channel          ?? PAYMENT_CONFIG_DEFAULTS.ticket_quote_channel,
      ticket_dest_phone:             t.ticket_dest_phone             ?? PAYMENT_CONFIG_DEFAULTS.ticket_dest_phone,
      ticket_dest_email:             t.ticket_dest_email             ?? PAYMENT_CONFIG_DEFAULTS.ticket_dest_email,
      ticket_follow_up_enabled:      t.ticket_follow_up_enabled      ?? PAYMENT_CONFIG_DEFAULTS.ticket_follow_up_enabled,
      ticket_follow_up_count:        t.ticket_follow_up_count        ?? PAYMENT_CONFIG_DEFAULTS.ticket_follow_up_count,
      ticket_follow_up_freq:         t.ticket_follow_up_freq         ?? PAYMENT_CONFIG_DEFAULTS.ticket_follow_up_freq,
      quote_reminder_date:           t.quote_reminder_date           ?? PAYMENT_CONFIG_DEFAULTS.quote_reminder_date,
    });
  }

  // ─── Fetch ticket (silent=true skips the loading skeleton) ──────────────

  const editingRef = useRef(editing);
  useEffect(() => { editingRef.current = editing; }, [editing]);

  const fetchTicket = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch(`/api/tickets/${ticketId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ticket) {
          setTicket(d.ticket);
          // Only refresh edit-state from remote if the user isn't actively editing
          if (!editingRef.current) populateEditState(d.ticket);
        } else {
          setError("Ticket not found.");
        }
      })
      .catch(() => { if (!silent) setError("Failed to load ticket."); })
      .finally(() => { if (!silent) setLoading(false); });
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTicket();
    fetch("/api/lookups/products")
      .then((r) => r.json())
      .then((d: { products?: ProductType[] }) => { if (d.products) setProducts(d.products); })
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
  // products only need to load once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  // ─── Realtime: re-fetch on any job_tickets or leads change ───────────────
  useEffect(() => {
    function onTicketChange() { fetchTicket(true); }
    function onLeadChange()   { fetchTicket(true); } // linked lead card refreshes via ticket join

    window.addEventListener("bazaar:tickets-changed", onTicketChange);
    window.addEventListener("bazaar:leads-changed",   onLeadChange);
    return () => {
      window.removeEventListener("bazaar:tickets-changed", onTicketChange);
      window.removeEventListener("bazaar:leads-changed",   onLeadChange);
    };
  }, [fetchTicket]);

  // ─── SKU helpers ──────────────────────────────────────────────────────────

  const updateSku = useCallback((idx: number, field: keyof QuoteSku, value: unknown) => {
    setSkus((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }, []);

  const updateVariants = useCallback((idx: number, variants: FormLineItem["variants"]) => {
    setSkus((prev) => prev.map((s, i) => (i === idx ? { ...s, variants } : s)));
  }, []);

  // ─── Pricing ─────────────────────────────────────────────────────────────

  const pricing = computePricing({
    skus,
    quote_shipping: requiresShipping ? shipping : 0,
    discount_type: discountType || null,
    discount_value: discountValue || null,
    quote_tax_rate_percent: taxExempt ? 0 : taxRate,
    tax_exempt: taxExempt,
  });

  // ─── Save ─────────────────────────────────────────────────────────────────

  function globalSaveMessage(newStatus?: string, extraFields?: Record<string, unknown>): string {
    if (newStatus === "sent") return GLOBAL_LOADING_MESSAGES.sendingQuote;
    if (newStatus === "order") return GLOBAL_LOADING_MESSAGES.convertingOrder;
    if (newStatus === "routed") return GLOBAL_LOADING_MESSAGES.routingQuote;
    if (extraFields?.ticket_status === "completed") return GLOBAL_LOADING_MESSAGES.completingOrder;
    if (extraFields?.ticket_status === "cancelled") return GLOBAL_LOADING_MESSAGES.saving;
    if (extraFields?.release_production) return GLOBAL_LOADING_MESSAGES.releasingProduction;
    return GLOBAL_LOADING_MESSAGES.saving;
  }

  function beginSaveLoading(message: string) {
    setSaving(true);
    showLoading(message);
  }

  function endSaveLoading() {
    setSaving(false);
    hideLoading();
  }

  async function handleSave(
    newStatus?: string,
    extraFields?: Record<string, unknown>,
    opts?: {
      skipSendValidation?: boolean;
      notifyRevision?: "standard" | "admin";
      skipResendPrompt?: boolean;
    },
  ) {
    // Keep ref current for the HV countdown timer
    handleSaveRef.current = handleSave;

    // Extra-fields-only update (payment status, lifecycle transitions) — skip form validation
    if (!newStatus && extraFields && Object.keys(extraFields).length > 0) {
      beginSaveLoading(globalSaveMessage(newStatus, extraFields));
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/tickets/${ticketId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(extraFields),
        });
        const json = await res.json();
        if (res.ok) {
          setTicket(json.ticket);
          window.dispatchEvent(new Event("bazaar:refresh-counts"));
          if (extraFields.ticket_status === "cancelled") {
            setNoticeIsWarning(false);
            setNotice("Ticket cancelled.");
          } else if (extraFields.ticket_status === "completed") {
            if (json.notification?.ok) {
              setNoticeIsWarning(false);
              setNotice(`Order completed — pickup notification sent via ${json.notification.channel ?? "email"}.`);
            } else if (json.notification) {
              setNoticeIsWarning(true);
              setNotice(`Order completed, but pickup notification failed: ${json.notification.error ?? "Unknown error"}`);
            } else {
              setNoticeIsWarning(false);
              setNotice("Order marked completed.");
            }
          }
        } else {
          setError(json.error ?? "Failed to update.");
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        endSaveLoading();
      }
      return;
    }

    // ── Required field validation ────────────────────────────────────────────
    let hasValidationError = false;
    if (!title.trim()) {
      setTitleError("A title is required.");
      hasValidationError = true;
    } else {
      setTitleError(undefined);
    }
    if (!dueDate) {
      setDueDateError("A due date is required.");
      hasValidationError = true;
    } else if (ticket?.created_at) {
      const dueErr = validateDueDateAgainstCreated(dueDate, ticket.created_at);
      if (dueErr) {
        setDueDateError(dueErr);
        hasValidationError = true;
      } else {
        setDueDateError(undefined);
      }
    } else {
      setDueDateError(undefined);
    }
    if (hasValidationError) {
      setSaving(false);
      return;
    }

    const isSendAction = newStatus === "sent" || newStatus === "order";
    if (isSendAction && !opts?.skipSendValidation) {
      const missing = getQuoteSendMissingFields({
        title,
        dueDate,
        skus,
        taxExempt,
        salesPermit,
        requiresShipping,
        quoteShipping: requiresShipping ? shipping : 0,
        shipToZip: shipTo.ship_to_zip ?? "",
        paymentDraft,
      });
      if (missing.length > 0) {
        setError(formatQuoteSendMissingMessage(missing));
        setSaving(false);
        return;
      }
    }

    // ── High-value threshold check for SDR users ─────────────────────────────
    // Only fires when editing a draft (not when moving to sent/order/etc.)
    if (
      userRole === "sdr" &&
      hvThreshold != null &&
      pricing.final_total > hvThreshold &&
      (!newStatus || newStatus === "draft") &&
      ticket?.ticket_status === "draft"
    ) {
      setHvCountdown(30);
      setHvModal(true);
      if (hvTimerRef.current) clearInterval(hvTimerRef.current);
      hvTimerRef.current = setInterval(() => {
        setHvCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(hvTimerRef.current!);
            hvTimerRef.current = null;
            setTimeout(() => handleSaveRef.current?.("routed"), 0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return;
    }

    setError(null);

    // Require sales permit when tax exempt
    if (taxExempt && !salesPermit.trim()) {
      setSalesPermitError("Sales Permit # is required when Tax Exempt is selected.");
      return;
    }

    const shippingErr = validateShippingCharge(requiresShipping, shipping);
    if (shippingErr) {
      setError(shippingErr);
      setSaving(false);
      hideLoading();
      return;
    }
    const zipErr = validateShipToZip(shipTo.ship_to_zip);
    if (zipErr) {
      setError(zipErr);
      setSaving(false);
      hideLoading();
      return;
    }

    beginSaveLoading(globalSaveMessage(newStatus));

    const body: Record<string, unknown> = {
      title: title.trim(),
      priority,
      due_date: dueDate || null,
      rush,
      order_source: orderSource,
      special_requirements: specialRequirements || null,
      notes: notes || null,
      line_items: lineItemsToApiPayload(skus),
      quote_shipping: requiresShipping ? shipping : 0,
      requires_shipping: requiresShipping,
      ship_to_line1: requiresShipping ? shipTo.ship_to_line1 || null : null,
      ship_to_line2: requiresShipping ? shipTo.ship_to_line2 || null : null,
      ship_to_city: requiresShipping ? shipTo.ship_to_city || null : null,
      ship_to_state: requiresShipping ? shipTo.ship_to_state || null : null,
      ship_to_zip: requiresShipping ? shipTo.ship_to_zip || null : null,
      discount_type: discountType || null,
      discount_value: discountValue || null,
      discount_reason: discountReason || null,
      quote_subtotal: pricing.subtotal,
      quote_pre_tax_total: pricing.pre_tax_total,
      quote_tax_rate_percent: taxRate,
      quote_tax_amount: pricing.tax_amount,
      quote_final_total: pricing.final_total,
      tax_exempt: taxExempt,
      sales_permit_number: salesPermit || null,
      // Per-ticket payment config (migration 066)
      ...paymentDraft,
      quote_reminder_date: paymentDraft.quote_reminder_date || null,
      quote_channel: paymentDraft.ticket_quote_channel === "email" ? "Email"
        : paymentDraft.ticket_quote_channel === "sms" ? "SMS"
        : paymentDraft.ticket_quote_channel === "both" ? "SMS"
        : undefined,
      quote_destination: paymentDraft.ticket_quote_channel === "email"
        ? paymentDraft.ticket_dest_email
        : paymentDraft.ticket_dest_phone,
    };

    if (newStatus) body.ticket_status = newStatus;
    if (opts?.notifyRevision) body.notify_revision = opts.notifyRevision;

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save.");
        return;
      }

      const ticketRef = ticket?.reference_code ?? ticketId;
      const uploadErr = await uploadPendingVariantFiles(ticketRef, skus);
      if (uploadErr) {
        setError(uploadErr);
        return;
      }

      const saved = json.ticket as Ticket;
      if (newStatus === "order" && userRole === "admin") {
        const paymentMissing =
          !saved.deposit_paid_at &&
          !saved.payment_paid_at &&
          Number(saved.payment_amount_received ?? saved.deposit_amount ?? 0) <= 0.01;
        const confirmMissing =
          saved.ticket_require_client_confirm !== false && !saved.client_confirmed;
        if (confirmMissing || paymentMissing) {
          saved.convert_meta = {
            by_admin: true,
            by_name: null,
            confirm_required_missing: confirmMissing,
            payment_missing: paymentMissing,
          };
        }
      }
      setTicket(saved);
      populateEditState(saved);
      setEditing(false);
      window.dispatchEvent(new Event("bazaar:refresh-counts"));

      if (!opts?.skipResendPrompt && !newStatus) {
        const offer = shouldOfferResendAfterSave({
          userRole,
          ticketStatus: saved.ticket_status,
          clientConfirmed: saved.client_confirmed,
        });
        if (offer) setResendPrompt(offer);
      }

      if (opts?.notifyRevision) {
        setNoticeIsWarning(false);
        setNotice("Update sent to customer.");
      }

      // If we just routed a quote, redirect SDR back to the quotes list
      if (newStatus === "routed") {
        router.push("/quotes");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      endSaveLoading();
    }
  }

  function cancelEdit() {
    if (ticket) populateEditState(ticket);
    setEditing(false);
    setError(null);
  }

  async function confirmResendAfterSave() {
    if (!resendPrompt || !ticket) return;
    const revision = resendPrompt === "admin" ? "admin" : "standard";
    setResendSending(true);
    setError(null);
    try {
      if (resendDeliveryMode(ticket.ticket_status) === "quote") {
        await handleSave("sent", undefined, {
          skipSendValidation: true,
          notifyRevision: revision,
          skipResendPrompt: true,
        });
      } else {
        beginSaveLoading(GLOBAL_LOADING_MESSAGES.sendingQuote);
        const res = await fetch(`/api/tickets/${ticketId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resend_invoice: true, notify_revision: revision }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Failed to send update to customer.");
          return;
        }
        setNoticeIsWarning(false);
        setNotice("Update sent to customer.");
        window.dispatchEvent(new Event("bazaar:refresh-counts"));
      }
      setResendPrompt(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResendSending(false);
      endSaveLoading();
    }
  }

  async function handleReleaseProduction() {
    beginSaveLoading(GLOBAL_LOADING_MESSAGES.releasingProduction);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_production: true }),
      });
      const json = await res.json();
      if (res.ok) setTicket(json.ticket);
      else setError(json.error ?? "Failed to release production.");
    } catch {
      setError("Network error.");
    } finally {
      endSaveLoading();
    }
  }


  const sendValidationInput = useMemo(
    () => ({
      title,
      dueDate,
      skus,
      taxExempt,
      salesPermit,
      requiresShipping,
      quoteShipping: requiresShipping ? shipping : 0,
      shipToZip: shipTo.ship_to_zip ?? "",
      paymentDraft,
    }),
    [title, dueDate, skus, taxExempt, salesPermit, requiresShipping, shipping, shipTo.ship_to_zip, paymentDraft],
  );
  const sendMissingFields = useMemo(
    () => getQuoteSendMissingFields(sendValidationInput),
    [sendValidationInput],
  );
  const quoteSendReady = sendMissingFields.length === 0;
  const sendMissingMessage = formatQuoteSendMissingMessage(sendMissingFields);

  function openCancelModal() {
    setCancelForm({ cancel_reason: "", cancel_notes: "" });
    setCancelModalOpen(true);
  }

  async function handleConfirmCancel() {
    if (!cancelForm.cancel_reason) return;
    setCancelModalOpen(false);
    await handleSave(undefined, {
      ticket_status: "cancelled",
      cancel_reason: cancelForm.cancel_reason,
      cancel_notes: cancelForm.cancel_notes.trim() || null,
    });
  }

  function openAdminConvertModal() {
    if (!ticket) return;
    setConvertModal(
      buildAdminConvertPreview({
        missingSendFields: sendMissingFields,
        requireClientConfirm: ticket.ticket_require_client_confirm !== false,
        clientConfirmed: false,
        clientConfirmedFlag: ticket.client_confirmed,
        quoteFinalTotal: pricing.final_total,
        paymentAmountReceived: ticket.payment_amount_received,
        paymentPaidAt: ticket.payment_paid_at,
        depositAmount: ticket.deposit_amount,
        depositPaidAt: ticket.deposit_paid_at,
        balancePaidAt: ticket.balance_paid_at,
        productionReleasedAt: ticket.production_released_at,
        ticketPaymentStrategy: ticket.ticket_payment_strategy,
        ticketDepositType: ticket.ticket_deposit_type,
        ticketDepositValue: ticket.ticket_deposit_value,
        ticketDepHandling: ticket.ticket_dep_handling,
        ticketFullChannels: ticket.ticket_full_channels,
        ticketPartialChannels: ticket.ticket_partial_channels,
      }),
    );
  }

  function confirmAdminConvert() {
    setConvertModal(null);
    void handleSave("order", undefined, { skipSendValidation: true });
  }

  function requestMarkComplete() {
    if (!ticket) return;
    if (isTicketPaidInFull(ticket)) {
      void handleSave(undefined, { ticket_status: "completed" });
      return;
    }
    if (userRole === "admin") {
      const balance = computeInvoicePaymentSummary(ticket).balanceDue;
      setCompleteModalBalance(balance);
    }
  }

  function confirmMarkCompleteWithBalance() {
    setCompleteModalBalance(null);
    void handleSave(undefined, {
      ticket_status: "completed",
      acknowledge_outstanding_balance: true,
    });
  }

  const adminConvertBanner = ticket?.convert_meta?.by_admin &&
    (ticket.convert_meta.confirm_required_missing || ticket.convert_meta.payment_missing);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <TicketSkeleton />;

  if (!ticket) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ color: "var(--color-text-muted)" }}>
        {error ?? "Ticket not found."}
      </div>
    );
  }

  const statusColors = STATUS_COLORS[ticket.ticket_status] ?? STATUS_COLORS.draft;
  const hasPayment = ticket.payment_status === "partial" || ticket.payment_status === "paid";

  // Once a quote is customer-approved and becomes an order, the record is locked.
  // Non-admins cannot edit or cancel. Admins retain full control.
  const isCustomerApproved = ticket.ticket_status === "order" || ticket.ticket_status === "in_production" || ticket.ticket_status === "completed";
  const isLocked = ticket.ticket_status === "cancelled" || (isCustomerApproved && userRole !== "admin");
  // SDR read-only: this SDR created the quote but it was routed to Sales.
  const isRoutedReadOnly = userRole === "sdr" && ticket.routed_by_id != null && ticket.routed_by_id === userId;
  const canEditTicket =
    !editing &&
    !isRoutedReadOnly &&
    (userRole === "admin"
      ? ticket.ticket_status !== "cancelled"
      : !isLocked && !ticket.client_confirmed);
  const showPaymentSummary = !editing && (
    context === "production" ||
    context === "completed" ||
    context === "order" ||
    ticket.ticket_status === "order" ||
    ticket.ticket_status === "in_production" ||
    ticket.ticket_status === "completed"
  );
  const isStageDetailView = (context === "production" || context === "completed") && !editing;
  const isPaymentView = context === "payment" && !editing;
  // Unified overview layout for all post-draft stages (matches /payments, /production, /completed, /orders)
  const isOverviewLayout = !editing && (
    context === "production" ||
    context === "completed" ||
    context === "payment" ||
    context === "order" ||
    (context === "quote" && ticket.ticket_status !== "draft")
  );
  const viewTabs = isOverviewLayout
    ? [{ id: "info" as Tab, label: "Overview" }, { id: "history" as Tab, label: "History" }]
    : VIEW_TABS;
  const showStatsRow = isOverviewLayout && context !== "payment";
  const statsTotalLabel = context === "quote" ? "Quote Total" as const : "Order Total" as const;

  const canViewPaymentEvidence = userRole === "accountant" || userRole === "admin";

  const detailQuickActionsProps = {
    ticket,
    userRole,
    saving,
    onMarkComplete: requestMarkComplete,
    onCancelTicket: openCancelModal,
    onSendQuote: () => { void handleSave("sent"); },
    onConvertToOrder: openAdminConvertModal,
    quoteSendReady,
    sendMissingMessage,
    isLocked,
    isRoutedReadOnly,
    clientConfirmed: !!ticket.client_confirmed,
  };

  const activeCancelReasons =
    cancelReasonCategoryForStatus(ticket.ticket_status) === "order_cancel_reason"
      ? cancelReasonLookups.order
      : cancelReasonLookups.quote;
  const cancelModalTitle = ["order", "in_production", "completed"].includes(ticket.ticket_status)
    ? "Cancel order"
    : "Cancel quote";

  const currentTicket = ticket;

  function renderDetailStatusBadges(compact: boolean): ReactNode[] {
    if (editing) return [];

    const badges: ReactNode[] = [];
    const t = currentTicket;

    if (t.ticket_status === "in_production") {
      badges.push(<DetailStatusDotBadge key="prod" label={compact ? "In Production" : "In Production"} variant="info" compact={compact} />);
    } else if (isStageDetailView && t.ticket_status === "completed") {
      badges.push(<DetailStatusDotBadge key="done" label="Completed" variant="success" compact={compact} />);
    } else if (t.client_confirmed) {
      badges.push(<DetailStatusDotBadge key="conf" label={compact ? "Confirmed" : "Confirmed by Customer"} variant="success" compact={compact} />);
    } else if (isPaymentView) {
      badges.push(<DetailStatusDotBadge key="review" label={compact ? "Review" : "Pending review"} variant="warning" compact={compact} />);
    } else if (isCustomerApproved && !isStageDetailView) {
      if (t.convert_meta?.by_admin && (t.convert_meta.confirm_required_missing || t.convert_meta.payment_missing)) {
        badges.push(
          <span
            key="override"
            className={`inline-flex items-center gap-1 rounded-full font-medium shrink-0 whitespace-nowrap ${
              compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
            }`}
            title={t.convert_meta.by_name
              ? `${t.convert_meta.by_name} converted — customer confirm and/or payment missing`
              : "Admin converted — confirm and/or payment missing"}
            style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "1px solid var(--color-warning-border)" }}
          >
            <AlertTriangle size={12} className="shrink-0" />
            {compact ? "Override" : (
              <span className="truncate max-w-[240px]">
                {t.convert_meta.by_name ? `${t.convert_meta.by_name} — ` : "Admin — "}
                {t.convert_meta.confirm_required_missing && t.convert_meta.payment_missing
                  ? "confirm & payment missing"
                  : t.convert_meta.confirm_required_missing
                    ? "confirm missing"
                    : "payment missing"}
              </span>
            )}
          </span>,
        );
      } else {
        badges.push(<DetailStatusDotBadge key="order" label={compact ? "Order" : "Converted to Order"} variant="info" compact={compact} />);
      }
    } else {
      badges.push(
        <span
          key="status"
          className={`capitalize shrink-0 whitespace-nowrap rounded-full font-medium ${
            compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
          }`}
          style={{ background: statusColors.bg, color: statusColors.text }}
        >
          {t.ticket_status}
        </span>,
      );
    }

    if (isCustomerApproved) {
      if (isPaymentEvidencePending(t)) {
        badges.push(<DetailStatusDotBadge key="evidence" label={compact ? "Review" : "Payment under review"} variant="warning" compact={compact} />);
      } else {
        const ps = t.payment_status ?? "unpaid";
        const paymentVariant = ps === "paid" ? "success" : ps === "partial" ? "accent" : "danger";
        const paymentLabel = ps === "paid" ? (compact ? "Paid" : "Paid in full") : ps === "partial" ? (compact ? "Partial" : "Partial Payment") : "Unpaid";
        badges.push(<DetailStatusDotBadge key="pay" label={paymentLabel} variant={paymentVariant} compact={compact} />);
      }
    }

    if (t.priority && t.priority !== "Normal") {
      badges.push(
        <DetailStatusDotBadge
          key="priority"
          label={compact ? t.priority : `${t.priority} Priority`}
          variant={t.priority === "High" ? "danger" : t.priority === "Medium" ? "warning" : "info"}
          compact={compact}
        />,
      );
    }

    return badges;
  }

  const statusBadges = renderDetailStatusBadges(false);
  const mobileStatusBadges = renderDetailStatusBadges(true);


  return (
    <>
    <div className="min-h-screen -mx-4 lg:mx-0" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 md:px-6 md:py-4">
        <button
          onClick={() => {
            router.push(
              resolveTicketDetailBackPath(
                context,
                ticket.ticket_status,
                returnFrom,
              ),
            );
          }}
          className="flex items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="w-px h-5 shrink-0" style={{ background: "var(--color-border)" }} />
        {ticket.reference_code ? (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-base md:text-xl font-semibold font-mono leading-tight truncate" style={{ color: "var(--color-text-primary)" }}>
                {ticket.reference_code}
              </h1>
              {ticket.title && (
                <span
                  className="hidden md:inline text-xs truncate max-w-[200px] px-2 py-0.5 rounded-full border shrink-0"
                  style={{ background: "var(--color-row-alt)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
                >
                  {ticket.title}
                </span>
              )}
            </div>
            {ticket.title && (
              <p className="text-xs truncate mt-0.5 md:hidden" style={{ color: "var(--color-text-muted)" }}>
                {ticket.title}
              </p>
            )}
          </div>
        ) : (
          /* Legacy row without reference — title only */
          <div className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
            <h1 className="text-base md:text-xl font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {ticket.title ?? "Untitled Quote"}
            </h1>
          </div>
        )}

        <div className="hidden md:flex md:flex-wrap md:items-center md:gap-2 md:shrink-0">
          {statusBadges}
        </div>

        {/* Download PDF — icon only on mobile */}
        <a
          href={`/api/tickets/${ticketId}/pdf`}
          download
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-opacity hover:opacity-80 shrink-0"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)", textDecoration: "none" }}
          title="Download PDF"
        >
          <Printer size={14} />
          <span className="hidden sm:inline">Save PDF</span>
        </a>

        {canEditTicket && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md transition-opacity hover:opacity-80 shrink-0"
            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
          >
            <Pencil size={14} />
            <span className="hidden sm:inline">Edit</span>
          </button>
        )}
        </div>

        {mobileStatusBadges.length > 0 && (
          <div
            className="md:hidden flex gap-2 overflow-x-auto touch-pan-x px-3 pb-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            style={{ borderColor: "var(--color-border)" }}
          >
            {mobileStatusBadges}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mx-3 mt-3 md:mx-6 md:mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" }}
        >
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Read-only notice for SDR viewing a quote they routed to Sales */}
      {isRoutedReadOnly && (
        <div
          className="mx-4 mt-3 md:mx-6 md:mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "1px solid var(--color-warning-border)" }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
          <span>
            This quote exceeded the high-value threshold and was routed to Sales for handling.
            You are viewing it in <strong>read-only mode</strong> — a Sales rep will complete and send it.
          </span>
        </div>
      )}

      {adminConvertBanner && (
        <div
          className="mx-4 mt-3 md:mx-6 md:mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "1px solid var(--color-warning-border)" }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
          <div className="space-y-1">
            <p>
              <strong>
                {ticket.convert_meta?.by_name ?? "An administrator"} converted this to an order
              </strong>
              {" "}without the normal customer payment flow.
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              {ticket.convert_meta?.confirm_required_missing && (
                <li>Customer approval — <strong>Missing</strong></li>
              )}
              {ticket.convert_meta?.payment_missing && (
                <li>Payment — <strong>None received</strong></li>
              )}
            </ul>
            <p className="text-xs pt-1" style={{ color: "var(--color-text-muted)" }}>
              Production cannot start until required confirmation and payment gates are satisfied.
            </p>
          </div>
        </div>
      )}

      {/* Missing required fields — draft/sent quotes cannot be sent until complete */}
      {!editing && !isRoutedReadOnly && (ticket.ticket_status === "draft" || ticket.ticket_status === "sent") && sendMissingFields.length > 0 && (
        <div
          className="mx-4 mt-3 md:mx-6 md:mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "1px solid var(--color-warning-border)" }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
          <span>
            {sendMissingMessage} Edit the quote to complete {sendMissingFields.length === 1 ? "this field" : "these fields"} before sending.
          </span>
        </div>
      )}

      {/* Record-locked notice for non-admin users */}
      {isCustomerApproved && userRole !== "admin" && !isOverviewLayout && (
        <div
          className="mx-4 mt-3 md:mx-6 md:mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "1px solid var(--color-warning-border)" }}
        >
          <Lock size={15} />
          This record is locked. The customer has approved this quote — only an admin can make changes or cancel.
        </div>
      )}

      {isOverviewLayout ? (
        <div className="w-full px-3 py-3 md:px-6 md:py-6 flex flex-col">
          <div className="flex flex-col">
            {showStatsRow && (
              <div className="shrink-0">
                {ticket.ticket_status === "cancelled" && (
                  <CancelledReasonBanner
                    reasonLabel={ticket.cancel_reason_label ?? ticket.cancel_reason}
                    notes={ticket.cancel_notes}
                  />
                )}
                <TicketStatsRow
                  ticket={ticket}
                  totalLabel={statsTotalLabel}
                  completedAt={context === "completed" ? completionAt ?? ticket.updated_at : undefined}
                />
                <TicketLifecycleTimeline
                  ticketId={ticket.id}
                  createdAt={ticket.created_at}
                  dueDate={ticket.due_date}
                  createdByName={ticket.created_by?.full_name}
                  isQuote={ticketIsQuoteStage(ticket)}
                  referenceCode={ticket.reference_code}
                  ticketKind={ticket.ticket_kind}
                  ticketStatus={ticket.ticket_status}
                  completedAtFallback={ticket.updated_at}
                  onCompletedAt={context === "completed" ? setCompletionAt : undefined}
                  leadCreatedAt={ticket.lead?.created_at}
                  leadSource={ticket.lead?.source}
                  customerCreatedAt={
                    !ticket.lead?.created_at ? ticket.customer?.created_at : undefined
                  }
                  quoteSource={ticket.quote_source}
                />
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4 md:gap-5 items-start">
              <aside className="w-full shrink-0">
                {ticket.lead ? (
                  <LinkedLeadCard
                    lead={ticket.lead}
                    productionReleasedAt={ticket.production_released_at}
                  />
                ) : (ticket.customer || ticket.contact_name || ticket.contact_email || ticket.contact_phone) ? (
                  <CustomerInfoCard ticket={ticket} />
                ) : null}
                <DetailQuickActions {...detailQuickActionsProps} />
              </aside>

              <div
                className="flex flex-col min-w-0 rounded-[14px] border"
                style={{
                  background: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                  boxShadow: "0 1px 3px color-mix(in srgb, var(--color-text-primary) 6%, transparent)",
                }}
              >
                <div
                  className="flex shrink-0 overflow-x-auto touch-pan-x border-b px-1"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                >
                  {viewTabs.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className="flex-1 md:flex-none px-4 py-3 text-[13px] md:py-3.5 md:text-[13.5px] font-medium transition-colors relative whitespace-nowrap shrink-0 border-b-2 -mb-px text-center md:text-left"
                      style={{
                        color: tab === t.id ? "var(--color-text-primary)" : "var(--color-text-muted)",
                        borderBottomColor: tab === t.id ? "var(--color-tab-underline)" : "transparent",
                        fontWeight: tab === t.id ? 500 : 400,
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Single page scroll — sidebar actions stay reachable below timeline */}
                <div>
                  {tab === "info" && (
                    <>
                      <div className="px-4 pt-4 pb-2 md:px-7 md:pt-6">
                        <TicketDetailOverview
                          ticket={ticket}
                          context={context}
                          userRole={userRole}
                          saving={saving}
                          onMarkComplete={requestMarkComplete}
                          completeNotice={notice}
                          completeNoticeIsWarning={noticeIsWarning}
                        />
                      </div>
                      <TicketOverviewSections
                        ticket={ticket}
                        products={products}
                        skuLookups={skuLookups}
                        pricing={pricing}
                        shipping={shipping}
                        setShipping={setShipping}
                        requiresShipping={requiresShipping}
                        setRequiresShipping={setRequiresShipping}
                        shipTo={shipTo}
                        setShipTo={setShipTo}
                        customerId={ticket.customer_id ?? ticket.customer?.id ?? null}
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
                        setSalesPermit={(v) => { setSalesPermit(v); setSalesPermitError(undefined); }}
                        salesPermitError={salesPermitError}
                        paymentDraft={paymentDraft}
                        onPaymentChange={setPaymentDraft}
                        showPaymentSummary={showPaymentSummary}
                        canViewPaymentEvidence={canViewPaymentEvidence}
                        totalLabel={statsTotalLabel}
                      />
                    </>
                  )}

                  {tab === "history" && (
                    <div className="p-4 md:p-6">
                      <HistorySection ticketId={ticketId} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!editing && !isStageDetailView && ticket.ticket_status === "completed" ? (
            <div
              className="mt-4 rounded-xl px-4 py-3 md:px-5 flex items-center gap-2"
              style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-success)" }} />
              <span className="text-[13px] font-medium" style={{ color: "var(--color-success)" }}>
                Order completed
              </span>
            </div>
          ) : null}
        </div>
      ) : (
      <div className="w-full px-4 py-4 md:px-6 md:py-6 flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Left: Lead info card OR Customer info card */}
        {ticket.lead ? (
          <aside className="w-full lg:w-72 lg:shrink-0">
            <LinkedLeadCard lead={ticket.lead} />
            <DetailQuickActions {...detailQuickActionsProps} />
          </aside>
        ) : (ticket.customer || ticket.contact_name || ticket.contact_email || ticket.contact_phone) ? (
          <aside className="w-full lg:w-72 lg:shrink-0">
            <CustomerInfoCard ticket={ticket} />
            <DetailQuickActions {...detailQuickActionsProps} />
          </aside>
        ) : (
          <aside className="w-full lg:w-72 lg:shrink-0">
            <DetailQuickActions {...detailQuickActionsProps} />
          </aside>
        )}

        {/* Right: Content */}
        <div className="flex-1 min-w-0">
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b mb-6 -mx-1 px-1" style={{ borderColor: "var(--color-border)" }}>
            {viewTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap shrink-0"
                style={{
                  color: tab === t.id ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
                  fontWeight: tab === t.id ? 500 : 400,
                }}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ background: "var(--color-tab-underline)" }} />
                )}
              </button>
            ))}
          </div>

          <div className="rounded-xl p-6" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            {tab === "info" && (
              isOverviewLayout ? (
                <div className="space-y-6">
                  <TicketDetailOverview
                    ticket={ticket}
                    context={context}
                    userRole={userRole}
                    saving={saving}
                    onMarkComplete={requestMarkComplete}
                    completeNotice={notice}
                    completeNoticeIsWarning={noticeIsWarning}
                  />
                  <TicketOverviewSections
                    ticket={ticket}
                    products={products}
                    skuLookups={skuLookups}
                    pricing={pricing}
                    shipping={shipping}
                    setShipping={setShipping}
                    requiresShipping={requiresShipping}
                    setRequiresShipping={setRequiresShipping}
                    shipTo={shipTo}
                    setShipTo={setShipTo}
                    customerId={ticket.customer_id ?? ticket.customer?.id ?? null}
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
                    setSalesPermit={(v) => { setSalesPermit(v); setSalesPermitError(undefined); }}
                    salesPermitError={salesPermitError}
                    paymentDraft={paymentDraft}
                    onPaymentChange={setPaymentDraft}
                    showPaymentSummary={showPaymentSummary}
                    canViewPaymentEvidence={canViewPaymentEvidence}
                  />
                </div>
              ) : (
              <div className="space-y-8">
                {/* ── Info ── */}
                <InfoForm
                  editing={editing}
                  ticket={ticket}
                  title={title} setTitle={(v) => { setTitle(v); setTitleError(undefined); }}
                  priority={priority} setPriority={setPriority}
                  dueDate={dueDate} setDueDate={(v) => { setDueDate(v); setDueDateError(undefined); }}
                  rush={rush} setRush={setRush}
                  specialRequirements={specialRequirements} setSpecialRequirements={setSpecialRequirements}
                  notes={notes} setNotes={setNotes}
                  priorityOpts={quoteLookups.ticket_priority}
                  titleError={titleError}
                  dueDateError={dueDateError}
                  minDueDate={ticket.created_at ? localDateStringFromIso(ticket.created_at) : undefined}
                />

                {/* ── Divider: Line Items ── */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>Line Items</p>
                    <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
                  </div>
                  <LineItemsForm
                    editing={editing}
                    skus={skus}
                    products={products}
                    skuLookups={skuLookups}
                    onUpdate={updateSku}
                    onRemove={(idx) => setSkus((prev) => prev.filter((_, i) => i !== idx))}
                    onAdd={() => setSkus((prev) => [...prev, emptyFormLineItem()])}
                    onVariantsChange={updateVariants}
                    ticketRef={ticket.reference_code ?? ticketId}
                    displayLines={
                      !editing && ticket.line_items?.length
                        ? lineItemsToDisplayRows(ticket.line_items)
                        : undefined
                    }
                  />
                </div>

                {/* ── Fulfillment ── */}
                <DetailCollapsibleSection title="Fulfillment">
                  <ShippingFulfillmentSection
                    editing={editing}
                    customerId={ticket.customer_id ?? ticket.customer?.id ?? null}
                    requiresShipping={requiresShipping}
                    onRequiresShippingChange={setRequiresShipping}
                    shipTo={shipTo}
                    onShipToChange={setShipTo}
                    shipping={shipping}
                    onShippingChange={setShipping}
                    ticket={editing ? undefined : ticket}
                  />
                </DetailCollapsibleSection>

                {/* ── Quote & Pricing ── */}
                <DetailCollapsibleSection title="Quote & Pricing">
                  <QuoteForm
                    editing={editing}
                    hideFulfillment
                    ticket={ticket}
                    pricing={pricing}
                    shipping={shipping} setShipping={setShipping}
                    requiresShipping={requiresShipping}
                    setRequiresShipping={setRequiresShipping}
                    shipTo={shipTo}
                    setShipTo={setShipTo}
                    customerId={ticket.customer_id ?? ticket.customer?.id ?? null}
                    discountType={discountType} setDiscountType={setDiscountType}
                    discountValue={discountValue} setDiscountValue={setDiscountValue}
                    discountReason={discountReason} setDiscountReason={setDiscountReason}
                    taxRate={taxRate} setTaxRate={setTaxRate}
                    taxExempt={taxExempt} setTaxExempt={setTaxExempt}
                    salesPermit={salesPermit} setSalesPermit={(v) => { setSalesPermit(v); setSalesPermitError(undefined); }}
                    salesPermitError={salesPermitError}
                    paymentDraft={paymentDraft}
                    onPaymentChange={setPaymentDraft}
                  />
                </DetailCollapsibleSection>

                {/* ── Divider: Payment & Production ── */}
                {showPaymentSummary && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <p className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        Payment &amp; Production
                      </p>
                      <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
                    </div>
                    <OrderPaymentSummary
                      ticket={ticket}
                      canViewPaymentEvidence={canViewPaymentEvidence}
                      paymentReviewAbove={isPaymentEvidencePending(ticket)}
                    />
                  </div>
                )}
              </div>
              )
            )}

            {tab === "history" && <HistorySection ticketId={ticketId} />}
          </div>

          {/* Order lifecycle — completed banner only; quote/order actions live in sidebar quick actions */}
          {!editing && !isStageDetailView && ticket.ticket_status === "completed" ? (
              <div
                className="mt-4 rounded-xl px-4 py-3 md:px-5 flex items-center gap-2"
                style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-success)" }} />
                <span className="text-[13px] font-medium" style={{ color: "var(--color-success)" }}>
                  Order completed
                </span>
              </div>
            ) : null
          }

          {/* Bottom action bar — edit mode */}
          {editing && (
            <div
              className="mt-4 rounded-xl px-4 py-3 md:px-5 flex flex-wrap items-center justify-between gap-2"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 px-4 py-2 text-sm rounded-md border hover:opacity-70 transition-opacity"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", background: "var(--color-surface)" }}
              >
                <X size={14} /> Cancel
              </button>

              <button
                disabled={saving}
                onClick={() => handleSave()}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
              >
                <Check size={14} /> {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
      )}

    </div>

    {/* ── Admin convert confirmation ─────────────────────────────────────── */}
    <ResendAfterSaveModal
      open={resendPrompt != null}
      kind={resendPrompt ?? "sdr-sales"}
      recordLabel={
        ticket && (ticket.ticket_status === "sent" || ticketIsQuoteStage(ticket))
          ? "quote"
          : "order"
      }
      outreachLabel={
        ticket ? OUTREACH_CHANNEL_LABEL[resolveOutreachChannelKind(ticket)] : "Email"
      }
      onResend={() => { void confirmResendAfterSave(); }}
      onSkip={() => setResendPrompt(null)}
      sending={resendSending || saving}
    />

    <CancelTicketModal
      open={cancelModalOpen}
      title={cancelModalTitle}
      reasons={activeCancelReasons}
      form={cancelForm}
      onChange={setCancelForm}
      onConfirm={() => { void handleConfirmCancel(); }}
      onClose={() => setCancelModalOpen(false)}
      saving={saving}
    />

    {convertModal && (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 28,
            maxWidth: 520,
            width: "90%",
          }}
        >
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <AlertTriangle size={28} style={{ color: "var(--color-warning)", flexShrink: 0, marginTop: 2 }} />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
                Convert to order?
              </h2>
              <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.55 }}>
                Only administrators can convert quotes to orders. Review the items below before continuing.
              </p>
            </div>
          </div>

          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.6 }}>
            {convertModal.missingSendFields.length > 0 && (
              <li>
                <strong>Missing required information:</strong>{" "}
                {convertModal.missingSendFields.join(", ")}.
              </li>
            )}
            {convertModal.confirmRequiredMissing && (
              <li>
                <strong>Customer confirmation</strong> was enabled on this quote but the customer has not confirmed yet.
              </li>
            )}
            {convertModal.wouldReleaseProduction && (
              <li>
                Payment gates are satisfied — this order may <strong>release to production immediately</strong> after convert.
              </li>
            )}
            {convertModal.missingSendFields.length === 0 && !convertModal.confirmRequiredMissing && !convertModal.wouldReleaseProduction && (
              <li>The ticket will become an order with reference <strong>ORD-…</strong>.</li>
            )}
          </ul>

          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginBottom: 20 }}>
            Are you sure you want to convert this quote to an order?
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setConvertModal(null)}
              style={{
                background: "transparent",
                color: "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmAdminConvert}
              style={{
                background: "var(--color-btn-verify-bg)",
                color: "var(--color-btn-verify-text)",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Yes, convert to order
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Admin mark complete with outstanding balance ───────────────────── */}
    {completeModalBalance != null && (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 28,
            maxWidth: 520,
            width: "90%",
          }}
        >
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <AlertTriangle size={28} style={{ color: "var(--color-warning)", flexShrink: 0, marginTop: 2 }} />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
                Mark completed with balance due?
              </h2>
              <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.55 }}>
                This order still has{" "}
                <strong style={{ color: "var(--color-warning-text-deep)" }}>
                  {formatCurrency(completeModalBalance)}
                </strong>{" "}
                outstanding. If you continue:
              </p>
              <ul style={{ margin: "12px 0 0", paddingLeft: 20, fontSize: 14, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                <li>The order moves to <strong>Completed</strong> and the customer receives a pickup-ready notification.</li>
                <li>The balance remains on the order until the customer pays via the public quote link.</li>
                <li>Accountants cannot mark orders complete until paid in full.</li>
              </ul>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setCompleteModalBalance(null)}
              style={{
                background: "transparent",
                color: "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmMarkCompleteWithBalance}
              style={{
                background: "var(--color-btn-primary-bg)",
                color: "var(--color-btn-primary-text)",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Yes, mark completed
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── High-Value Threshold Modal (SDR only) ─────────────────────────── */}
    {hvModal && (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 32,
            maxWidth: 480,
            width: "90%",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <AlertTriangle size={40} color="var(--color-warning)" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
            High-Value Quote
          </h2>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginBottom: 8 }}>
            This quote total of <strong style={{ color: "var(--color-warning)" }}>{formatCurrency(pricing.final_total)}</strong> exceeds
            the high-value threshold of <strong>{hvThreshold != null ? formatCurrency(hvThreshold) : "—"}</strong>.
          </p>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginBottom: 24 }}>
            It will be automatically routed to a Sales representative to handle.
            You will be redirected to the Quotes page.
          </p>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-warning)", marginBottom: 24 }}>
            {hvCountdown}s
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => {
                if (hvTimerRef.current) { clearInterval(hvTimerRef.current); hvTimerRef.current = null; }
                setHvModal(false);
              }}
              style={{
                flex: 1,
                background: "transparent",
                color: "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel — Edit Amount
            </button>
            <button
              onClick={() => {
                if (hvTimerRef.current) { clearInterval(hvTimerRef.current); hvTimerRef.current = null; }
                setHvModal(false);
                handleSaveRef.current?.("routed");
              }}
              style={{
                flex: 1,
                background: "var(--color-btn-primary-bg)",
                color: "var(--color-btn-primary-text)",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              OK — Route to Sales
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Record Payment modal removed — payment review is handled on the /payments page */}
    </>
  );
}
