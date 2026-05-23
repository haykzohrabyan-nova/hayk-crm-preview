"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  Clock,
} from "lucide-react";
import { computePricing, formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import {
  formatQuoteSendMissingMessage,
  getQuoteSendMissingFields,
} from "@/lib/utils/validate-quote-send";
import { isPaymentEvidencePending, isTicketPaidInFull } from "@/lib/utils/invoice-payment-summary";
import { formatPhone, digitsOnly } from "@/lib/utils/phone";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { LinkedLeadCard } from "@/components/ui/linked-lead-card";

import { createClient } from "@/lib/supabase/client";
import { type TicketPaymentDraft, PAYMENT_CONFIG_DEFAULTS } from "@/components/quotes/quote-payment-config";
import { InfoForm } from "@/components/quotes/shared/info-form";
import { LineItemsForm } from "@/components/quotes/shared/line-items-form";
import { QuoteForm } from "@/components/quotes/shared/quote-form";
import { emptySkuRow as sharedEmptySkuRow } from "@/components/quotes/shared/utils";
import type { LookupOption as SharedLookupOption, SkuLookups as SharedSkuLookups } from "@/components/quotes/shared/types";
import { HistorySection } from "@/components/quotes/quote-detail/history-section";
import { TicketSkeleton } from "@/components/quotes/quote-detail/ticket-skeleton";
import { CustomerInfoCard } from "@/components/quotes/quote-detail/customer-info-card";
import { OrderPaymentSummary } from "@/components/quotes/quote-detail/order-payment-summary";
import { TicketDetailOverview } from "@/components/quotes/quote-detail/ticket-detail-overview";
import { TicketOverviewSections } from "@/components/quotes/quote-detail/ticket-overview-sections";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
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
  quote_skus: QuoteSku[];
  notes: string | null;
  order_source: string | null;
  quote_source: string | null;
  quote_authority: string | null;
  linked_lead_id: string | null;
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
  payment_evidence_amount:        number | null;
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


function emptySkuRow(): QuoteSku { return sharedEmptySkuRow(); }

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
  }, []);

  // ── High-value threshold modal ────────────────────────────────────────────
  const [hvModal, setHvModal] = useState(false);
  const [hvCountdown, setHvCountdown] = useState(30);
  const hvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleSaveRef = useRef<((newStatus?: string) => Promise<void>) | null>(null);

  // Edit state mirrors ticket fields
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [dueDate, setDueDate] = useState("");
  const [rush, setRush] = useState(false);
  const [orderSource, setOrderSource] = useState("quoted");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [notes, setNotes] = useState("");
  const [skus, setSkus] = useState<QuoteSku[]>([emptySkuRow()]);
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

  // ─── Load ─────────────────────────────────────────────────────────────────

  function populateEditState(t: Ticket) {
    setTitle(t.title ?? "");
    setPriority(t.priority ?? "Normal");
    setDueDate(t.due_date ?? "");
    setRush(t.rush ?? false);
    setOrderSource(t.order_source ?? "quoted");
    setSpecialRequirements(t.special_requirements ?? "");
    setNotes(t.notes ?? "");
    setSkus(t.quote_skus?.length ? t.quote_skus : [emptySkuRow()]);
    setShipping(t.quote_shipping ?? 0);
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

  async function handleSave(newStatus?: string, extraFields?: Record<string, unknown>) {
    // Keep ref current for the HV countdown timer
    handleSaveRef.current = handleSave;

    // Extra-fields-only update (payment status, lifecycle transitions) — skip form validation
    if (!newStatus && extraFields && Object.keys(extraFields).length > 0) {
      setSaving(true);
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
          if (extraFields.ticket_status === "completed") {
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
        setSaving(false);
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
    } else {
      setDueDateError(undefined);
    }
    if (hasValidationError) {
      setSaving(false);
      return;
    }

    const isSendAction = newStatus === "sent" || newStatus === "order";
    if (isSendAction) {
      const missing = getQuoteSendMissingFields({
        title,
        dueDate,
        skus,
        taxExempt,
        salesPermit,
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

    setSaving(true);
    setError(null);

    // Require sales permit when tax exempt
    if (taxExempt && !salesPermit.trim()) {
      setSalesPermitError("Sales Permit # is required when Tax Exempt is selected.");
      setSaving(false);
      return;
    }

    const body: Record<string, unknown> = {
      title: title.trim(),
      priority,
      due_date: dueDate || null,
      rush,
      order_source: orderSource,
      special_requirements: specialRequirements || null,
      notes: notes || null,
      quote_skus: skus,
      quote_shipping: shipping,
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
      design_required: skus.some((s) => s.design_required),
      die_cut: skus.some((s) => s.die_cut),
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

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save.");
        setSaving(false);
        return;
      }
      setTicket(json.ticket);
      populateEditState(json.ticket);
      setEditing(false);
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
      // If we just routed a quote, redirect SDR back to the quotes list
      if (newStatus === "routed") {
        router.push("/quotes");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (ticket) populateEditState(ticket);
    setEditing(false);
    setError(null);
  }

  async function handleReleaseProduction() {
    setSaving(true);
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
      setSaving(false);
    }
  }


  const sendValidationInput = useMemo(
    () => ({ title, dueDate, skus, taxExempt, salesPermit, paymentDraft }),
    [title, dueDate, skus, taxExempt, salesPermit, paymentDraft],
  );
  const sendMissingFields = useMemo(
    () => getQuoteSendMissingFields(sendValidationInput),
    [sendValidationInput],
  );
  const quoteSendReady = sendMissingFields.length === 0;
  const sendMissingMessage = formatQuoteSendMissingMessage(sendMissingFields);

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

  // SDR read-only: this SDR created the quote but it was routed to Sales.
  // They can view it but cannot edit it regardless of ticket status.
  const isRoutedReadOnly = userRole === "sdr" && ticket.routed_by_id != null && ticket.routed_by_id === userId;


  return (
    <>
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b flex items-center gap-2 flex-wrap px-4 py-3 md:px-6 md:py-4"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <button
          onClick={() => {
            if (context === "production") router.push("/production");
            else if (context === "completed") router.push("/completed");
            else if (context === "payment") router.push("/payments");
            else if (context === "order") router.push("/orders");
            else if (context === "quote") router.push("/quotes");
            else router.back();
          }}
          className="flex items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="w-px h-5 shrink-0" style={{ background: "var(--color-border)" }} />
        {ticket.reference_code ? (
          /* Quote or order — show reference code as primary title */
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h1 className="text-base md:text-xl font-semibold font-mono leading-tight truncate" style={{ color: "var(--color-text-primary)" }}>
              {ticket.reference_code}
            </h1>
            {ticket.title && (
              <span className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
                {ticket.title}
              </span>
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

        {isStageDetailView && ticket.ticket_status === "in_production" ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium shrink-0"
            style={{ background: "var(--color-info-bg)", color: "var(--color-info-text)", border: "1px solid var(--color-info-border)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-info-text)" }} />
            In Production
          </span>
        ) : isStageDetailView && ticket.ticket_status === "completed" ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium shrink-0"
            style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" }}
          >
            <BadgeCheck size={12} />
            Completed
          </span>
        ) : ticket.client_confirmed ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium shrink-0"
            style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" }}
          >
            <BadgeCheck size={12} />
            <span className="hidden sm:inline">Confirmed by Customer</span>
            <span className="sm:hidden">Confirmed</span>
          </span>
        ) : isPaymentView ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium shrink-0"
            style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "1px solid var(--color-warning-border)" }}
          >
            <Clock size={12} />
            Pending review
          </span>
        ) : isCustomerApproved && !isStageDetailView ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium shrink-0"
            style={{ background: "var(--color-info-bg)", color: "var(--color-info-text)", border: "1px solid var(--color-info-border)" }}
          >
            <BadgeCheck size={12} />
            <span className="hidden sm:inline">Converted to Order</span>
            <span className="sm:hidden">Order</span>
          </span>
        ) : (
          <span
            className="px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium capitalize shrink-0"
            style={{ background: statusColors.bg, color: statusColors.text }}
          >
            {ticket.ticket_status}
          </span>
        )}

        {/* Payment status badge — shown on all orders */}
        {isCustomerApproved && (() => {
          if (isPaymentEvidencePending(ticket)) {
            return (
              <span
                className="px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium shrink-0"
                style={{
                  background: "var(--color-warning-bg)",
                  color: "var(--color-warning)",
                  border: "1px solid var(--color-warning-border)",
                }}
              >
                Payment under review
              </span>
            );
          }
          const ps = ticket.payment_status ?? "unpaid";
          const PAYMENT_BADGE: Record<string, { bg: string; text: string; border: string; label: string }> = {
            unpaid:  { bg: "var(--color-danger-bg)",  text: "var(--color-danger)",  border: "var(--color-danger-border)",  label: "Unpaid"  },
            partial: { bg: "var(--color-warning-bg)", text: "var(--color-warning)", border: "var(--color-warning-border)", label: "Partial" },
            paid:    { bg: "var(--color-success-bg)", text: "var(--color-success)", border: "var(--color-success-border)", label: "Paid"    },
          };
          const style = PAYMENT_BADGE[ps] ?? PAYMENT_BADGE.unpaid;
          return (
            <span
              className="px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium shrink-0"
              style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}
            >
              {style.label}
            </span>
          );
        })()}

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

        {!editing && !isLocked && !ticket.client_confirmed && !isRoutedReadOnly && (
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

      {/* Error banner */}
      {error && (
        <div
          className="mx-4 mt-3 md:mx-6 md:mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
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

      <div className="w-full px-4 py-4 md:px-6 md:py-6 flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Left: Lead info card OR Customer info card */}
        {ticket.lead ? (
          <aside className="w-full lg:w-72 lg:shrink-0">
            <LinkedLeadCard lead={ticket.lead} />
          </aside>
        ) : (ticket.customer || ticket.contact_name || ticket.contact_email || ticket.contact_phone) ? (
          <aside className="w-full lg:w-72 lg:shrink-0">
            <CustomerInfoCard ticket={ticket} />
          </aside>
        ) : null}

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
                    onMarkComplete={() => handleSave(undefined, { ticket_status: "completed" })}
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
                    onAdd={() => setSkus((prev) => [...prev, emptySkuRow()])}
                  />
                </div>

                {/* ── Divider: Quote & Pricing ── */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>Quote &amp; Pricing</p>
                    <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
                  </div>
                  <QuoteForm
                    editing={editing}
                    ticket={ticket}
                    pricing={pricing}
                    shipping={shipping} setShipping={setShipping}
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
                </div>

                {/* ── Divider: Payment & Production ── */}
                {showPaymentSummary && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <p className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>
                        Payment &amp; Production
                      </p>
                      <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
                    </div>
                    <OrderPaymentSummary ticket={ticket} />
                  </div>
                )}
              </div>
              )
            )}

            {tab === "history" && <HistorySection ticketId={ticketId} />}
          </div>

          {/* Bottom action bar — view mode. Hidden once customer has confirmed (record is committed).
              Only shown for draft/sent states; order state uses the combined order-status card below. */}
          {!editing && !isLocked && !ticket.client_confirmed && ticket.ticket_status !== "order" && !isRoutedReadOnly && (
            <div
              className="mt-4 rounded-xl px-4 py-3 md:px-5 flex flex-wrap items-center gap-2 md:gap-3"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <button
                disabled={saving}
                onClick={() => handleSave("cancelled")}
                className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-2"
                style={{ color: "var(--color-danger)", border: "1px solid var(--color-danger-border)", background: "var(--color-danger-bg)" }}
              >
                Cancel Ticket
              </button>

              <div className="ml-auto flex flex-wrap items-center gap-2 md:gap-3">
                {ticket.ticket_status === "draft" && (
                  <button
                    disabled={saving || !quoteSendReady}
                    title={!quoteSendReady ? sendMissingMessage : undefined}
                    onClick={() => handleSave("sent")}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-2"
                    style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                  >
                    <Mail size={14} />
                    Send Quote
                  </button>
                )}
                {ticket.ticket_status === "sent" && (
                  <button
                    disabled={saving || !quoteSendReady}
                    title={!quoteSendReady ? sendMissingMessage : undefined}
                    onClick={() => handleSave("sent")}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-2"
                    style={{ background: "var(--color-surface)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                  >
                    <Mail size={14} />
                    Resend Quote
                  </button>
                )}
                {(ticket.ticket_status === "sent" || ticket.ticket_status === "draft") && (
                  <button
                    disabled={saving || !quoteSendReady}
                    title={!quoteSendReady ? sendMissingMessage : undefined}
                    onClick={() => handleSave("order")}
                    className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-2"
                    style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                  >
                    <BadgeCheck size={14} />
                    Convert to Order
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Cancel ticket — order status, non-locked, admin only */}
          {!editing && !isLocked && ticket.ticket_status === "order" && userRole === "admin" && (
            <div className="mt-4 flex justify-end">
              <button
                disabled={saving}
                onClick={() => handleSave("cancelled")}
                className="px-3 py-1.5 text-xs font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ color: "var(--color-danger)", border: "1px solid var(--color-danger-border)", background: "var(--color-danger-bg)" }}
              >
                Cancel Ticket
              </button>
            </div>
          )}

          {/* Order lifecycle buttons — admin, or accountant when paid in full */}
          {!editing && !isStageDetailView && (
            ticket.ticket_status === "order" ? null
            : ticket.ticket_status === "in_production" &&
              (userRole === "admin" || (userRole === "accountant" && isTicketPaidInFull(ticket))) ? (
              <div
                className="mt-4 rounded-xl px-4 py-3 md:px-5 flex flex-wrap items-center gap-3"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              >
                <span className="text-[12px] font-medium uppercase tracking-wider mr-auto" style={{ color: "var(--color-text-muted)" }}>
                  Order Progress
                </span>
                <div
                  className="flex items-center gap-1.5 text-[12px] font-medium"
                  style={{ color: "var(--color-info-text)" }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-info-text)" }} />
                  In Production
                </div>
                <button
                  disabled={saving}
                  onClick={() => handleSave(undefined, { ticket_status: "completed" })}
                  className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-2"
                  style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" }}
                >
                  Mark Completed
                </button>
              </div>
            ) : ticket.ticket_status === "completed" ? (
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
          )}

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
    </div>

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
