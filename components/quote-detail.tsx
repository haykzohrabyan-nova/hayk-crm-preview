"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  User,
  Phone,
  Mail,
  FileText,
  Clock,
  AlertCircle,
  AlertTriangle,
  UserCheck,
  FileCheck2,
  RefreshCw,
  ArrowRight,
  Pause,
  XCircle,
  MessageSquare,
  BadgeCheck,
  Zap,
  ChevronDown,
  Printer,
  Lock,
  Link,
  Copy,
} from "lucide-react";
import { computePricing, formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import { formatPhone, digitsOnly } from "@/lib/utils/phone";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { LinkedLeadCard } from "@/components/ui/linked-lead-card";
import { DatePicker } from "@/components/ui/date-picker";
import { createClient } from "@/lib/supabase/client";

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

type Tab = "info" | "history";

const VIEW_TABS: { id: Tab; label: string }[] = [
  { id: "info", label: "Info" },
  { id: "history", label: "History" },
];

type LookupOption = { value: string; label: string };
type SkuLookups = {
  lamination: LookupOption[];
  color_mode: LookupOption[];
  sides: LookupOption[];
  roll_direction: LookupOption[];
  finishing: LookupOption[];
};

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
const CHANNEL_OPTIONS = ["Email", "SMS", "WhatsApp", "In-person"];
const PAYMENT_OPTIONS = ["Card Payment", "Zelle", "Offline"];
const FOLLOW_UP_FREQ = ["Daily", "Every 2 days", "Weekly"];

function emptySkuRow(): QuoteSku {
  return { product_type: "", material: "", lamination: "None" };
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:    { bg: "var(--color-neutral-bg)",  text: "var(--color-neutral-text)" },
  sent:     { bg: "var(--color-info-bg)",     text: "var(--color-info-text)" },
  approved: { bg: "var(--color-success-bg)",  text: "var(--color-success)" },
  cancelled:{ bg: "var(--color-danger-bg)",   text: "var(--color-danger)" },
  order:    { bg: "var(--color-badge-bg)",    text: "var(--color-badge-text)" },
};

// ─── Component ────────────────────────────────────────────────────────────────

// ─── Customer Info Card (no lead — created directly from New Quote) ───────────

function CustomerInfoCard({ ticket }: { ticket: Ticket }) {
  const c = ticket.customer;
  const name = c
    ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
    : ticket.contact_name ?? "";
  const email = c?.email ?? ticket.contact_email ?? "";
  const phone = c?.phone ?? ticket.contact_phone ?? "";
  const company = c?.company ?? ticket.contact_company ?? "";

  return (
    <div
      className="rounded-xl p-5 sticky top-24"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-text-muted)" }}>
        Customer
      </h3>
      <div className="space-y-3">
        {name && (
          <div className="flex items-start gap-2">
            <User size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{name}</p>
              {company && <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{company}</p>}
            </div>
          </div>
        )}
        {phone && (
          <a href={`tel:${phone}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <Phone size={14} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{formatPhone(phone)}</span>
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <Mail size={14} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-sm break-all" style={{ color: "var(--color-text-primary)" }}>{email}</span>
          </a>
        )}
        {!name && !email && !phone && (
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No customer details recorded.</p>
        )}
      </div>
    </div>
  );
}

// ─── Payment Link Bar ─────────────────────────────────────────────────────────
// Shown on confirmed unpaid orders regardless of lock status.
// Lets any CRM user copy the payment link OR send it via Email / SMS / WhatsApp.
// Defaults to the original channel used to send the quote, but the rep can switch.

const SEND_CHANNELS = [
  { id: "email",     label: "Email",     icon: Mail },
  { id: "sms",       label: "SMS",       icon: MessageSquare },
  { id: "whatsapp",  label: "WhatsApp",  icon: MessageSquare },
] as const;

function PaymentLinkBar({
  token,
  channel: originalChannel,
  destination: originalDestination,
  contactEmail,
  contactPhone,
  paymentTypes,
  ticketId,
}: {
  token: string;
  channel: string | null;
  destination: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTypes: string[];
  ticketId: string;
}) {
  const [copied, setCopied]       = useState(false);
  const [sending, setSending]     = useState(false);
  const [sent, setSent]           = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [selectedChannel, setSelectedChannel] = useState<string>(originalChannel ?? "email");
  const [destination, setDestination]         = useState<string>(originalDestination ?? "");

  // When channel switches, auto-fill the appropriate contact value.
  // Email → customer email. SMS/WhatsApp → customer phone.
  function handleChannelChange(ch: string) {
    setSelectedChannel(ch);
    if (ch === "email") {
      setDestination(contactEmail ?? originalDestination ?? "");
    } else {
      setDestination(digitsOnly(contactPhone ?? originalDestination ?? ""));
    }
    setSendError(null);
  }

  const baseUrl    = typeof window !== "undefined" ? window.location.origin : "";
  const paymentUrl = `${baseUrl}/q/${token}`;

  function handleCopy() {
    navigator.clipboard.writeText(paymentUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSend() {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          send_payment_reminder: true,
          reminder_channel:     selectedChannel,
          reminder_destination: destination.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSendError(d.error ?? "Failed to send. Try again.");
      } else {
        setSent(true);
        setTimeout(() => setSent(false), 4000);
      }
    } catch {
      setSendError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  }

  const paymentMethodLabel = paymentTypes.includes("card_default") ? "Card"
    : paymentTypes.includes("zelle") ? "Zelle"
    : paymentTypes.includes("offline") ? "Offline"
    : null;

  const destinationPlaceholder = selectedChannel === "email" ? "customer@email.com" : "+1 555 000 0000";

  return (
    <div
      className="mt-4 rounded-xl px-5 py-4 space-y-3"
      style={{ background: "var(--color-info-bg)", border: "1px solid var(--color-info-border)" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Link size={14} style={{ color: "var(--color-info-text)", flexShrink: 0 }} />
          <span className="text-xs font-semibold" style={{ color: "var(--color-info-text-deep)" }}>
            Send payment link to customer
          </span>
          {paymentMethodLabel && (
            <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
              {paymentMethodLabel}
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-opacity hover:opacity-80"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      {/* Channel selector + destination + send */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Channel tabs */}
        <div className="flex rounded-md overflow-hidden border text-[12px] font-medium shrink-0" style={{ borderColor: "var(--color-border)" }}>
          {SEND_CHANNELS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleChannelChange(ch.id)}
              className="px-3 py-1.5 transition-colors"
              style={{
                background: selectedChannel === ch.id ? "var(--color-info-text)" : "var(--color-surface)",
                color: selectedChannel === ch.id ? "#fff" : "var(--color-text-muted)",
                borderRight: ch.id !== "whatsapp" ? `1px solid var(--color-border)` : undefined,
              }}
            >
              {ch.label}
            </button>
          ))}
        </div>

        {/* Destination input */}
        {selectedChannel === "email" ? (
          <EmailInput
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="customer@email.com"
          />
        ) : (
          <PhoneInput
            value={destination}
            onChange={(digits) => setDestination(digits)}
            placeholder="(555) 000-0000"
          />
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || !destination.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 shrink-0"
          style={{ background: "var(--color-info-text)", color: "#fff" }}
        >
          <Mail size={13} />
          {sent ? "Sent!" : sending ? "Sending…" : "Send Payment Link"}
        </button>
      </div>

      {sendError && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }}>{sendError}</p>
      )}
    </div>
  );
}

export default function QuoteDetail({ ticketId }: { ticketId: string }) {
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
  const [paymentTypes, setPaymentTypes] = useState<string[]>(["Card Payment"]);
  const [prepayMode, setPrepayMode] = useState<"full" | "partial">("full");
  const [prepayType, setPrepayType] = useState<"percent" | "fixed">("percent");
  const [prepayValue, setPrepayValue] = useState("25");
  const [quoteChannel, setQuoteChannel] = useState("Email");
  const [quoteDestination, setQuoteDestination] = useState("");
  const [quoteDestinationError, setQuoteDestinationError] = useState<string | undefined>();
  const [salesPermitError, setSalesPermitError] = useState<string | undefined>();
  const [titleError, setTitleError] = useState<string | undefined>();
  const [dueDateError, setDueDateError] = useState<string | undefined>();
  const [reminderDate, setReminderDate] = useState("");
  const [followUpCycles, setFollowUpCycles] = useState(3);
  const [followUpFreq, setFollowUpFreq] = useState("Every 2 days");

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
    setPaymentTypes(t.quote_payment_types?.length ? t.quote_payment_types : ["Card Payment"]);
    setPrepayMode(t.prepayment_type === "percent" || t.prepayment_type === "fixed" ? "partial" : "full");
    setPrepayType((t.prepayment_type === "percent" || t.prepayment_type === "fixed") ? (t.prepayment_type as "percent" | "fixed") : "percent");
    setPrepayValue(t.prepayment_value ?? "25");
    setQuoteChannel(t.quote_channel ?? "Email");
    setQuoteDestination(t.quote_destination ?? "");
    setReminderDate(t.quote_reminder_date ?? "");
    setFollowUpCycles(t.follow_up_cycles ?? 3);
    setFollowUpFreq(t.follow_up_frequency ?? "Every 2 days");
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

    // Require quote_destination when sending or saving a draft quote
    if (
      ticket?.ticket_kind === "quote" &&
      (newStatus === "sent" || (!newStatus && ticket?.ticket_status === "draft")) &&
      !quoteDestination.trim()
    ) {
      const label = quoteChannel === "Email" ? "email address" : quoteChannel === "In-person" ? "location" : "phone number";
      setQuoteDestinationError(`Please enter the ${label} to send the quote to.`);
      setSaving(false);
      return;
    }

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
      quote_payment_types: paymentTypes,
      prepayment_type: prepayMode === "full" ? "full" : prepayType,
      prepayment_value: prepayMode === "full" ? "100" : prepayValue,
      quote_channel: quoteChannel,
      quote_destination: quoteDestination || null,
      quote_reminder_date: reminderDate || null,
      follow_up_cycles: followUpCycles,
      follow_up_frequency: followUpFreq,
      design_required: skus.some((s) => s.design_required),
      die_cut: skus.some((s) => s.die_cut),
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

  function togglePayment(opt: string) {
    setPaymentTypes((prev) => {
      // Offline is mutually exclusive with everything else
      if (opt === "Offline") {
        return prev.includes("Offline") ? prev : ["Offline"];
      }
      // Selecting any non-Offline option clears Offline
      const withoutOffline = prev.filter((p) => p !== "Offline");
      if (withoutOffline.includes(opt)) {
        // Deselect — keep at least one selected
        const next = withoutOffline.filter((p) => p !== opt);
        return next.length > 0 ? next : prev;
      }
      return [...withoutOffline, opt];
    });
  }

  function cancelEdit() {
    if (ticket) populateEditState(ticket);
    setEditing(false);
    setError(null);
  }

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
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity shrink-0"
          style={{ color: "var(--color-text-muted)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="w-px h-5 shrink-0" style={{ background: "var(--color-border)" }} />
        {ticket.reference_code ? (
          /* Order — show reference code as primary title, title as subtitle */
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
          /* Quote — show title + short ID */
          <div className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
            <h1 className="text-base md:text-xl font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {ticket.title ?? "Untitled Quote"}
            </h1>
            <span className="text-xs md:text-sm font-mono shrink-0" style={{ color: "var(--color-text-muted)" }}>
              /{ticket.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        )}

        {ticket.client_confirmed ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-xs font-medium shrink-0"
            style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" }}
          >
            <BadgeCheck size={12} />
            <span className="hidden sm:inline">Confirmed by Customer</span>
            <span className="sm:hidden">Confirmed</span>
          </span>
        ) : isCustomerApproved ? (
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

      {/* Record-locked notice for non-admin users */}
      {isCustomerApproved && userRole !== "admin" && (
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
            {VIEW_TABS.map((t) => (
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
              <div className="space-y-8">
                {/* ── Info ── */}
                <InfoSection
                  editing={editing}
                  title={title} setTitle={(v) => { setTitle(v); setTitleError(undefined); }}
                  priority={priority} setPriority={setPriority}
                  dueDate={dueDate} setDueDate={(v) => { setDueDate(v); setDueDateError(undefined); }}
                  rush={rush} setRush={setRush}
                  specialRequirements={specialRequirements} setSpecialRequirements={setSpecialRequirements}
                  notes={notes} setNotes={setNotes}
                  ticket={ticket}
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
                  <LinesSection
                    editing={editing}
                    skus={skus}
                    setSkus={setSkus}
                    products={products}
                    skuLookups={skuLookups}
                    onUpdate={updateSku}
                  />
                </div>

                {/* ── Divider: Quote & Pricing ── */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>Quote &amp; Pricing</p>
                    <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
                  </div>
                  <QuoteSection
                    editing={editing}
                    pricing={pricing}
                    ticket={ticket}
                    orderSource={orderSource}
                    setOrderSource={setOrderSource}
                    shipping={shipping} setShipping={setShipping}
                    discountType={discountType} setDiscountType={setDiscountType}
                    discountValue={discountValue} setDiscountValue={setDiscountValue}
                    discountReason={discountReason} setDiscountReason={setDiscountReason}
                    taxRate={taxRate} setTaxRate={setTaxRate}
                    taxExempt={taxExempt} setTaxExempt={setTaxExempt}
                    salesPermit={salesPermit} setSalesPermit={(v) => { setSalesPermit(v); setSalesPermitError(undefined); }}
                    salesPermitError={salesPermitError}
                    paymentTypes={paymentTypes} togglePayment={togglePayment}
                    prepayMode={prepayMode} setPrepayMode={setPrepayMode}
                    prepayType={prepayType} setPrepayType={setPrepayType}
                    prepayValue={prepayValue} setPrepayValue={setPrepayValue}
                    quoteChannel={quoteChannel} setQuoteChannel={setQuoteChannel}
                    quoteDestination={quoteDestination} setQuoteDestination={(v) => { setQuoteDestination(v); setQuoteDestinationError(undefined); }}
                    quoteDestinationError={quoteDestinationError}
                    reminderDate={reminderDate} setReminderDate={setReminderDate}
                    followUpCycles={followUpCycles} setFollowUpCycles={setFollowUpCycles}
                    followUpFreq={followUpFreq} setFollowUpFreq={setFollowUpFreq}
                    channelOpts={quoteLookups.quote_channel}
                    paymentOpts={quoteLookups.ticket_payment}
                    followUpFreqOpts={quoteLookups.follow_up_freq}
                  />
                </div>
              </div>
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
              {ticket.ticket_status === "draft" && (
                <button
                  disabled={saving}
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
                  disabled={saving}
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
                  disabled={saving}
                  onClick={() => handleSave("order")}
                  className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-2"
                  style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success-border)" }}
                >
                  <BadgeCheck size={14} />
                  Convert to Order
                </button>
              )}
              <div className="ml-auto">
                <button
                  disabled={saving}
                  onClick={() => handleSave("cancelled")}
                  className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-70 disabled:opacity-50"
                  style={{ color: "var(--color-danger)" }}
                >
                  Cancel Ticket
                </button>
              </div>
            </div>
          )}

          {/* Payment link bar — visible to all roles on confirmed unpaid orders.
              This is NOT editing — it's a separate action available even when the record is locked. */}
          {!editing && ticket.client_confirmed && ticket.payment_status !== "paid" && ticket.public_token && (
            <PaymentLinkBar
              token={ticket.public_token}
              channel={ticket.quote_channel}
              destination={ticket.quote_destination}
              contactEmail={ticket.customer?.email ?? ticket.contact_email ?? null}
              contactPhone={ticket.customer?.phone ?? ticket.contact_phone ?? null}
              paymentTypes={ticket.quote_payment_types ?? []}
              ticketId={ticketId}
            />
          )}

          {/* Combined order-status card — shown only when ticket_status === "order" and not locked/confirmed.
              Merges Order Progress (admin), Deposit status, and Cancel Ticket into one surface. */}
          {!editing && !isLocked && !ticket.client_confirmed && ticket.ticket_status === "order" && (
            <div
              className="mt-4 rounded-xl overflow-hidden"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              {/* Row 1: Order Progress (admin) + Cancel Ticket */}
              <div className="px-4 py-3 md:px-5 flex flex-wrap items-center gap-3">
                {userRole === "admin" && (
                  <>
                    <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                      Order Progress
                    </span>
                    <button
                      disabled={saving}
                      onClick={() => handleSave(undefined, { ticket_status: "in_production" })}
                      className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 inline-flex items-center gap-2"
                      style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                    >
                      Mark In Production
                    </button>
                  </>
                )}
                <div className="ml-auto">
                  <button
                    disabled={saving}
                    onClick={() => handleSave("cancelled")}
                    className="px-3 py-1.5 text-xs font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ color: "var(--color-danger)", border: "1px solid var(--color-danger-border)", background: "var(--color-danger-bg)" }}
                  >
                    Cancel Ticket
                  </button>
                </div>
              </div>

              {/* Row 2: Deposit status — segmented control, only when partial prepayment is configured */}
              {(ticket.prepayment_type === "percent" || ticket.prepayment_type === "fixed") && (() => {
                const depositVal = parseFloat(ticket.prepayment_value ?? "0") || 0;
                const depositTotal = ticket.quote_final_total ?? 0;
                const depositAmount = ticket.prepayment_type === "percent"
                  ? Math.round(depositTotal * (depositVal / 100) * 100) / 100
                  : Math.min(depositVal, depositTotal);
                const depositStatus = ticket.prepayment_status ?? "pending";
                return (
                  <div
                    className="px-5 py-3 flex items-center gap-4 flex-wrap"
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>
                      Deposit
                    </span>
                    {/* Segmented control */}
                    <div className="flex rounded-md overflow-hidden shrink-0" style={{ border: "1px solid var(--color-border)" }}>
                      {(["pending", "paid"] as const).map((status, i) => {
                        const cfg = {
                          pending: { label: "Pending", activeStyle: { background: "var(--color-warning-bg)", color: "var(--color-warning)" } },
                          paid:    { label: "Paid",    activeStyle: { background: "var(--color-success-bg)", color: "var(--color-success)" } },
                        }[status];
                        const isActive = depositStatus === status;
                        return (
                          <button
                            key={status}
                            disabled={saving}
                            onClick={() => handleSave(undefined, { prepayment_status: status })}
                            className="px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
                            style={{
                              ...(isActive ? cfg.activeStyle : { background: "var(--color-bg)", color: "var(--color-text-muted)" }),
                              ...(i > 0 ? { borderLeft: "1px solid var(--color-border)" } : {}),
                            }}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {formatCurrency(depositAmount)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>due now</span>
                    <span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>
                      Will be auto-updated by Stripe
                    </span>
                  </div>
                );
              })()}

              {/* Row 3: Offline payment status — segmented control, only when payment method is offline */}
              {(ticket.quote_payment_types as string[] | null)?.includes("offline") && (
                <div
                  className="px-5 py-3 flex items-center gap-4 flex-wrap"
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wider shrink-0" style={{ color: "var(--color-text-muted)" }}>
                    Payment
                  </span>
                  {/* Segmented control */}
                  <div className="flex rounded-md overflow-hidden shrink-0" style={{ border: "1px solid var(--color-border)" }}>
                    {(["unpaid", "partial", "paid"] as const).map((status, i) => {
                      const cfg = {
                        unpaid:  { label: "Unpaid",  activeStyle: { background: "var(--color-danger-bg)",  color: "var(--color-danger)"  } },
                        partial: { label: "Partial", activeStyle: { background: "var(--color-warning-bg)", color: "var(--color-warning)" } },
                        paid:    { label: "Paid",    activeStyle: { background: "var(--color-success-bg)", color: "var(--color-success)" } },
                      }[status];
                      const isActive = (ticket.payment_status ?? "unpaid") === status;
                      return (
                        <button
                          key={status}
                          disabled={saving}
                          onClick={() => handleSave(undefined, { payment_status: status })}
                          className="px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
                          style={{
                            ...(isActive ? cfg.activeStyle : { background: "var(--color-bg)", color: "var(--color-text-muted)" }),
                            ...(i > 0 ? { borderLeft: "1px solid var(--color-border)" } : {}),
                          }}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>
                    Mark when offline payment is received
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Order lifecycle buttons — admin only (in_production / completed states only).
              The "order" state is handled by the combined card above. */}
          {!editing && userRole === "admin" && (
            ticket.ticket_status === "order" ? null
            : ticket.ticket_status === "in_production" ? (
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
    </>
  );
}

// ─── Info Section ─────────────────────────────────────────────────────────────

interface InfoSectionProps {
  editing: boolean; ticket: Ticket;
  title: string; setTitle: (v: string) => void;
  priority: string; setPriority: (v: string) => void;
  dueDate: string; setDueDate: (v: string) => void;
  rush: boolean; setRush: (v: boolean) => void;
  specialRequirements: string; setSpecialRequirements: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  priorityOpts: LookupOption[];
  titleError?: string;
  dueDateError?: string;
}

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function InfoSection(p: InfoSectionProps) {
  const fieldStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" };

  if (!p.editing) {
    return (
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {[
          ["Title", p.ticket.title],
          ["Priority", p.ticket.priority],
          ["Due Date", p.ticket.due_date],
          ["Rush", p.ticket.rush ? "Yes — Rush order" : null],
          ["Special Requirements", p.ticket.special_requirements],
          ["Notes", p.ticket.notes],
        ].map(([label, val]) => val ? (
          <div key={label as string} className="col-span-1">
            <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>{label}</dt>
            <dd className="text-sm" style={{ color: "var(--color-text-primary)" }}>{val}</dd>
          </div>
        ) : null)}
      </dl>
    );
  }

  const PRIORITY_OPTS = (p.priorityOpts.length ? p.priorityOpts.map((o) => o.label) : ["Low", "Normal", "High"]).filter((o) => o.toLowerCase() !== "urgent");

  return (
    <div className="space-y-5">
      {/* Title + Priority — 50/50 row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Title <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <input
            value={p.title}
            onChange={(e) => p.setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-md text-sm border outline-none"
            style={{ ...fieldStyle, ...(p.titleError ? { border: "1px solid var(--color-danger)" } : {}) }}
          />
          {p.titleError && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.titleError}</p>
          )}
        </div>

        {/* Priority — segmented control */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Priority <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <div
            className="grid rounded-md overflow-hidden border"
            style={{ gridTemplateColumns: `repeat(${PRIORITY_OPTS.length}, 1fr)`, borderColor: "var(--color-border)" }}
          >
            {PRIORITY_OPTS.map((opt, i) => {
              const active = p.priority === opt;
              const { borderColor: _bc, ...colorStyle } = priorityStyle(opt, active);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => p.setPriority(opt)}
                  className={`py-2 text-sm font-medium transition-all${i < PRIORITY_OPTS.length - 1 ? " border-r" : ""}`}
                  style={{ ...colorStyle, borderColor: "var(--color-border)" }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Due Date + Rush Order — 50/50 row */}
      <div className="grid grid-cols-2 gap-4 items-start">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
            Due Date <span style={{ color: "var(--color-danger)" }}>*</span>
          </label>
          <div className="flex gap-2 items-center">
            <DatePicker
              value={p.dueDate}
              onChange={p.setDueDate}
              placeholder="Select due date"
              disablePast
              className="flex-1"
            />
            {[
              { label: "Today",    days: 0 },
              { label: "Tomorrow", days: 1 },
              { label: "+3d",      days: 3 },
            ].map(({ label, days }) => {
              const isActive = p.dueDate === quickDate(days);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => p.setDueDate(quickDate(days))}
                  className="px-3 py-2 rounded-md text-xs font-medium border whitespace-nowrap transition-all hover:opacity-80"
                  style={isActive ? {
                    background: "var(--color-btn-verify-bg)",
                    border: "1px solid var(--color-btn-verify-bg)",
                    color: "var(--color-btn-verify-text)",
                  } : {
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {p.dueDateError && (
            <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.dueDateError}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Rush Order</label>
          <div
            className="flex items-center justify-between rounded-md px-4 py-2 cursor-pointer select-none h-[38px]"
            style={{
              background: p.rush ? "var(--color-warning-bg)" : "var(--color-surface)",
              border: `1px solid ${p.rush ? "var(--color-warning-border)" : "var(--color-border)"}`,
              transition: "background 0.15s, border-color 0.15s",
            }}
            onClick={() => p.setRush(!p.rush)}
          >
            <div className="flex items-center gap-2">
              <Zap size={14} style={{ color: p.rush ? "var(--color-warning)" : "var(--color-text-muted)" }} />
              <span className="text-sm font-medium" style={{ color: p.rush ? "var(--color-warning)" : "var(--color-text-muted)" }}>
                {p.rush ? "Rush On" : "Rush Off"}
              </span>
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
        </div>
      </div>

      {/* Special Requirements */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Special Requirements</label>
        <textarea
          value={p.specialRequirements}
          onChange={(e) => p.setSpecialRequirements(e.target.value)}
          rows={3}
          placeholder="Any special requirements for this order…"
          className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-y"
          style={fieldStyle}
        />
      </div>

      {/* Internal Notes */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Internal Notes</label>
        <textarea
          value={p.notes}
          onChange={(e) => p.setNotes(e.target.value)}
          rows={3}
          placeholder="Internal notes visible only to staff…"
          className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-y"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        />
      </div>
    </div>
  );
}

// ─── Lines Section ────────────────────────────────────────────────────────────

function LinesSection({
  editing, skus, setSkus, products, skuLookups, onUpdate,
}: {
  editing: boolean;
  skus: QuoteSku[];
  setSkus: React.Dispatch<React.SetStateAction<QuoteSku[]>>;
  products: ProductType[];
  skuLookups: SkuLookups;
  onUpdate: (idx: number, field: keyof QuoteSku, value: unknown) => void;
}) {
  if (!editing) {
    if (!skus.length) return <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No line items yet.</p>;
    return (
      <div className="space-y-3">
        {skus.map((sku, i) => {
          const computedLineTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
          const lineTotal = sku.line_total ?? computedLineTotal;
          return (
            <div key={i} className="rounded-lg p-3 border" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {sku.product_type || "—"}{sku.material ? ` · ${sku.material}` : ""}{sku.lamination && sku.lamination !== "None" ? ` · ${sku.lamination}` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {sku.color_mode ? `${sku.color_mode}` : ""}{sku.sides ? ` · ${sku.sides}` : ""}{sku.roll_direction ? ` · ${sku.roll_direction}` : ""}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                    {sku.width && sku.height ? `${sku.width}" × ${sku.height}" · ` : ""}
                    {sku.quantity ? `Qty: ${sku.quantity}` : ""}{sku.unit_price ? ` · ${formatCurrency(sku.unit_price)} ea` : ""}
                  </p>
                  {sku.comment && (
                    <p className="text-xs mt-1 italic" style={{ color: "var(--color-text-muted)" }}>{sku.comment}</p>
                  )}
                </div>
                {lineTotal > 0 && (
                  <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{formatCurrency(lineTotal)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4">
        {skus.map((sku, idx) => (
          <EditableSkuRow
            key={idx}
            idx={idx}
            sku={sku}
            products={products}
            skuLookups={skuLookups}
            onUpdate={onUpdate}
            onRemove={() => setSkus((prev) => prev.filter((_, i) => i !== idx))}
            canRemove={skus.length > 1}
          />
        ))}
      </div>
      <button
        onClick={() => setSkus((prev) => [...prev, emptySkuRow()])}
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

function EditableSkuRow({ idx, sku, products, skuLookups, onUpdate, onRemove, canRemove }: {
  idx: number; sku: QuoteSku; products: ProductType[]; skuLookups: SkuLookups;
  onUpdate: (i: number, f: keyof QuoteSku, v: unknown) => void;
  onRemove: () => void; canRemove: boolean;
}) {
  const selectedProduct = products.find((p) => p.name === sku.product_type);
  const allMaterials = selectedProduct?.material_groups.flatMap((g) => g.materials) ?? [];
  const computedTotal = (sku.quantity ?? 0) * (sku.unit_price ?? 0);
  const fieldStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" };
  const [lineTotalRaw, setLineTotalRaw] = useState(sku.line_total != null ? String(sku.line_total) : "");
  const [widthRaw, setWidthRaw]         = useState(sku.width      != null ? String(sku.width)      : "");
  const [heightRaw, setHeightRaw]       = useState(sku.height     != null ? String(sku.height)     : "");
  const [quantityRaw, setQuantityRaw]   = useState(sku.quantity   != null ? String(sku.quantity)   : "");
  const [unitPriceRaw, setUnitPriceRaw] = useState(sku.unit_price != null ? String(sku.unit_price) : "");

  function SkuSelect({ value, onChange, disabled = false, children }: {
    value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode;
  }) {
    return (
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          className="w-full appearance-none px-3 py-2 pr-8 rounded-md text-sm border outline-none disabled:opacity-50"
          style={fieldStyle}>
          {children}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--color-text-muted)" }} />
      </div>
    );
  }

  return (
    <div className="rounded-lg p-4 border" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Line {idx + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="p-1 rounded hover:opacity-70 transition-opacity" style={{ color: "var(--color-danger)" }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {/* Row 1: Product Type | Material */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Product Type</label>
          <SkuSelect value={sku.product_type} onChange={(v) => { onUpdate(idx, "product_type", v); onUpdate(idx, "material", ""); }}>
            <option value="">Select product…</option>
            {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </SkuSelect>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Material</label>
          <SkuSelect value={sku.material ?? ""} onChange={(v) => onUpdate(idx, "material", v)} disabled={!selectedProduct}>
            <option value="">Select material…</option>
            {allMaterials.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
          </SkuSelect>
        </div>

        {/* Row 2: Width | Height */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Width (in)</label>
          <input type="text" inputMode="decimal" value={widthRaw}
            onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && widthRaw === "0") { e.preventDefault(); if (e.key !== "0") { setWidthRaw(e.key); onUpdate(idx, "width", parseFloat(e.key)); } } }}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+([1-9])/, "$1").replace(/(\..*)\./g, "$1"); setWidthRaw(v); onUpdate(idx, "width", v && v !== "." ? parseFloat(v) : undefined); }}
            onBlur={() => { const n = parseFloat(widthRaw); setWidthRaw(isNaN(n) ? "" : String(n)); }}
            className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Height (in)</label>
          <input type="text" inputMode="decimal" value={heightRaw}
            onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && heightRaw === "0") { e.preventDefault(); if (e.key !== "0") { setHeightRaw(e.key); onUpdate(idx, "height", parseFloat(e.key)); } } }}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+([1-9])/, "$1").replace(/(\..*)\./g, "$1"); setHeightRaw(v); onUpdate(idx, "height", v && v !== "." ? parseFloat(v) : undefined); }}
            onBlur={() => { const n = parseFloat(heightRaw); setHeightRaw(isNaN(n) ? "" : String(n)); }}
            className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
        </div>

        {/* Row 3: Color Mode | Sides */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Color Mode</label>
          <SkuSelect value={sku.color_mode ?? ""} onChange={(v) => onUpdate(idx, "color_mode", v || undefined)}>
            <option value="">None</option>
            {renderLookupOptions(skuLookups.color_mode, sku.color_mode)}
          </SkuSelect>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Sides</label>
          <SkuSelect value={sku.sides ?? ""} onChange={(v) => onUpdate(idx, "sides", v || undefined)}>
            <option value="">None</option>
            {renderLookupOptions(skuLookups.sides, sku.sides)}
          </SkuSelect>
        </div>

        {/* Row 4: Quantity | Unit Price */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Quantity</label>
          <input type="text" inputMode="numeric" value={quantityRaw}
            onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && quantityRaw === "0") { e.preventDefault(); if (e.key !== "0") { setQuantityRaw(e.key); onUpdate(idx, "quantity", parseInt(e.key)); } } }}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, "").replace(/^0+([1-9])/, "$1"); setQuantityRaw(v); onUpdate(idx, "quantity", v ? parseInt(v) : undefined); }}
            className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Unit Price ($)</label>
          <input type="text" inputMode="decimal" value={unitPriceRaw}
            onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && unitPriceRaw === "0") { e.preventDefault(); if (e.key !== "0") { setUnitPriceRaw(e.key); onUpdate(idx, "unit_price", parseFloat(e.key)); } } }}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+([1-9])/, "$1").replace(/(\..*)\./g, "$1"); setUnitPriceRaw(v); onUpdate(idx, "unit_price", v && v !== "." ? parseFloat(v) : undefined); }}
            onBlur={() => { const n = parseFloat(unitPriceRaw); setUnitPriceRaw(isNaN(n) ? "" : String(n)); }}
            className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
        </div>

        {/* Row 5: Lamination | Roll Direction */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Lamination</label>
          <SkuSelect value={sku.lamination ?? "None"} onChange={(v) => onUpdate(idx, "lamination", v)}>
            {renderLookupOptions(skuLookups.lamination, sku.lamination)}
          </SkuSelect>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Roll Direction</label>
          <SkuSelect value={sku.roll_direction ?? ""} onChange={(v) => onUpdate(idx, "roll_direction", v || undefined)}>
            <option value="">None</option>
            {renderLookupOptions(skuLookups.roll_direction, sku.roll_direction)}
          </SkuSelect>
        </div>
      </div>

      {/* Calculated reference — shown only when no manual override */}
      {computedTotal > 0 && sku.line_total == null && (
        <div className="mb-3 px-3 py-2 rounded text-xs" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
          Calculated: {formatCurrency(computedTotal)} <span className="opacity-60">(qty × unit — override below if needed)</span>
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

      {/* Line Item Comment */}
      <div className="mt-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Line Item Comment</label>
        <textarea
          rows={2}
          placeholder="Optional notes for this SKU"
          value={sku.comment ?? ""}
          onChange={(e) => onUpdate(idx, "comment", e.target.value || undefined)}
          className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-none"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
        />
      </div>

      {/* Line Total override */}
      <div className="mt-3">
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
          Line Total ($) <span className="font-normal opacity-60">— actual price</span>
        </label>
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder={computedTotal > 0 ? formatCurrency(computedTotal).replace("$", "") : "0.00"}
          value={lineTotalRaw}
          onChange={(e) => {
            const v = e.target.value.replace(/^0+([1-9])/, "$1");
            setLineTotalRaw(v);
            const n = parseFloat(v);
            onUpdate(idx, "line_total", isNaN(n) ? undefined : n);
          }}
          onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && e.currentTarget.value === "0") { e.preventDefault(); if (e.key !== "0") { const nv = e.key; setLineTotalRaw(nv); onUpdate(idx, "line_total", parseFloat(nv)); } } }}
          onBlur={() => {
            const n = parseFloat(lineTotalRaw);
            setLineTotalRaw(isNaN(n) ? "" : String(n));
          }}
          className="w-full px-3 py-2 rounded-md text-sm border outline-none"
          style={{
            background: "var(--color-surface)",
            border: sku.line_total != null ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
        {sku.line_total != null && (
          <button
            type="button"
            onClick={() => { setLineTotalRaw(""); onUpdate(idx, "line_total", undefined); }}
            className="mt-1 text-[10px] hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-text-muted)" }}
          >
            ✕ Clear override
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Quote Section ────────────────────────────────────────────────────────────

interface QuoteSectionProps {
  editing: boolean;
  pricing: ReturnType<typeof computePricing>;
  ticket: Ticket;
  orderSource: string; setOrderSource: (v: string) => void;
  shipping: number; setShipping: (v: number) => void;
  discountType: "percent" | "fixed" | ""; setDiscountType: (v: "percent" | "fixed" | "") => void;
  discountValue: string; setDiscountValue: (v: string) => void;
  discountReason: string; setDiscountReason: (v: string) => void;
  taxRate: number; setTaxRate: (v: number) => void;
  taxExempt: boolean; setTaxExempt: (v: boolean) => void;
  salesPermit: string; setSalesPermit: (v: string) => void;
  salesPermitError?: string;
  paymentTypes: string[]; togglePayment: (opt: string) => void;
  prepayMode: "full" | "partial"; setPrepayMode: (v: "full" | "partial") => void;
  prepayType: "percent" | "fixed"; setPrepayType: (v: "percent" | "fixed") => void;
  prepayValue: string; setPrepayValue: (v: string) => void;
  quoteChannel: string; setQuoteChannel: (v: string) => void;
  quoteDestination: string; setQuoteDestination: (v: string) => void;
  quoteDestinationError?: string;
  reminderDate: string; setReminderDate: (v: string) => void;
  followUpCycles: number; setFollowUpCycles: (v: number) => void;
  followUpFreq: string; setFollowUpFreq: (v: string) => void;
  channelOpts: LookupOption[];
  paymentOpts: LookupOption[];
  followUpFreqOpts: LookupOption[];
}

function QuoteSection(p: QuoteSectionProps) {
  const fieldStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" };

  // Local string states so the user can clear and retype without snapping back to 0
  const [shippingRaw, setShippingRaw] = useState(p.shipping === 0 ? "" : String(p.shipping));
  const [taxRateRaw, setTaxRateRaw] = useState(p.taxRate === 0 ? "" : String(p.taxRate));

  function StyledSelect({ value, onChange, children }: {
    value: string; onChange: (v: string) => void; children: React.ReactNode;
  }) {
    return (
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-3 py-2 pr-8 rounded-md text-sm border outline-none"
          style={fieldStyle}>
          {children}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--color-text-muted)" }} />
      </div>
    );
  }

  const channelLabels = p.channelOpts.length ? p.channelOpts.map((o) => o.label) : CHANNEL_OPTIONS;
  const paymentLabels = p.paymentOpts.length ? p.paymentOpts.map((o) => o.label) : PAYMENT_OPTIONS;
  const freqLabels    = p.followUpFreqOpts.length ? p.followUpFreqOpts.map((o) => o.label) : FOLLOW_UP_FREQ;

  const activePricing = p.editing ? p.pricing : (() => {
    const subtotal    = p.ticket.quote_subtotal    ?? 0;
    const shipping    = p.ticket.quote_shipping    ?? 0;
    const pre_tax     = p.ticket.quote_pre_tax_total ?? 0;
    const tax_amount  = p.ticket.quote_tax_amount  ?? 0;
    const final_total = p.ticket.quote_final_total ?? 0;
    // Derive discount from the stored totals so it always reflects what was saved
    const discount_amount = Math.max(Math.round((subtotal + shipping - pre_tax) * 100) / 100, 0);
    return { subtotal, shipping, discount_amount, pre_tax_total: pre_tax, tax_amount, final_total };
  })();

  // Compute partial prepayment breakdown (editing uses live state, view uses saved ticket)
  const prepayBreakdown = (() => {
    const isPartial = p.editing
      ? p.prepayMode === "partial"
      : (p.ticket.prepayment_type === "percent" || p.ticket.prepayment_type === "fixed");
    if (!isPartial) return null;

    const pType  = p.editing ? p.prepayType  : (p.ticket.prepayment_type as "percent" | "fixed");
    const pValue = p.editing ? p.prepayValue : (p.ticket.prepayment_value ?? "0");
    const total  = activePricing.final_total;

    const dueNow = pType === "percent"
      ? Math.round(total * (parseFloat(pValue) / 100 || 0) * 100) / 100
      : Math.round(Math.min(parseFloat(pValue) || 0, total) * 100) / 100;
    const balance = Math.max(Math.round((total - dueNow) * 100) / 100, 0);
    const label   = pType === "percent" ? `${pValue}% deposit` : `${formatCurrency(parseFloat(pValue) || 0)} deposit`;
    return { dueNow, balance, label };
  })();

  return (
    <div className="space-y-6">
      {/* Pricing summary */}
      <div className="rounded-lg p-4 space-y-2" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>Pricing Summary</h4>
        {[
          ["Subtotal", activePricing.subtotal],
          ["Shipping", activePricing.shipping],
          ["Discount", -(activePricing.discount_amount ?? 0)],
          ["Pre-tax Total", activePricing.pre_tax_total],
          ["Tax", activePricing.tax_amount],
        ].map(([label, val]) => (
          <div key={label as string} className="flex justify-between text-sm">
            <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
            <span style={{ color: (val as number) < 0 ? "var(--color-danger)" : "var(--color-text-primary)" }}>
              {val !== 0 ? formatCurrency(Math.abs(val as number)) : "—"}
            </span>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-base pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
          <span style={{ color: "var(--color-text-primary)" }}>Total</span>
          <span style={{ color: "var(--color-accent)" }}>{formatCurrency(activePricing.final_total)}</span>
        </div>
        {/* Partial prepayment breakdown */}
        {prepayBreakdown && (
          <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
              Partial Payment — {prepayBreakdown.label}
            </p>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Due Now</span>
              <span className="font-semibold" style={{ color: "var(--color-success)" }}>{formatCurrency(prepayBreakdown.dueNow)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>Balance Due Later</span>
              <span className="font-semibold" style={{ color: "var(--color-warning)" }}>{formatCurrency(prepayBreakdown.balance)}</span>
            </div>
          </div>
        )}
      </div>

      {p.editing ? (
        <div className="space-y-6">
          {/* ── Pricing Adjustments card ── */}
          <div className="rounded-lg p-4 space-y-4 border" style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Adjustments</h4>

            {/* Row 1: Shipping + Tax Rate inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Shipping ($)</label>
                <input type="number" min={0} step={0.01} placeholder="0.00"
                  value={shippingRaw}
                  onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && e.currentTarget.value === "0") { e.preventDefault(); if (e.key !== "0") { setShippingRaw(e.key); p.setShipping(parseFloat(e.key)); } } }}
                  onChange={(e) => { const v = e.target.value.replace(/^0+([1-9])/, "$1"); setShippingRaw(v); p.setShipping(parseFloat(v) || 0); }}
                  onBlur={() => { const n = parseFloat(shippingRaw); setShippingRaw(isNaN(n) ? "" : String(n)); }}
                  className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Tax Rate (%)</label>
                <input type="number" min={0} max={100} step={0.1} placeholder="0" disabled={p.taxExempt}
                  value={taxRateRaw}
                  onKeyDown={(e) => { if (/^[0-9]$/.test(e.key) && e.currentTarget.value === "0") { e.preventDefault(); if (e.key !== "0") { setTaxRateRaw(e.key); p.setTaxRate(parseFloat(e.key)); } } }}
                  onChange={(e) => { const v = e.target.value.replace(/^0+([1-9])/, "$1"); setTaxRateRaw(v); p.setTaxRate(parseFloat(v) || 0); }}
                  onBlur={() => { const n = parseFloat(taxRateRaw); setTaxRateRaw(isNaN(n) ? "" : String(n)); }}
                  className="w-full px-3 py-2 rounded-md text-sm border outline-none disabled:opacity-40" style={fieldStyle} />
              </div>
            </div>

            {/* Row 2: Discount selector + Tax Exempt toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  {p.discountType ? (
                    <>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                        {p.discountType === "percent" ? "Discount %" : "Discount ($)"}
                      </label>
                      <input type="number" min={0} max={p.discountType === "percent" ? 100 : undefined} step={p.discountType === "percent" ? 1 : 0.01} value={p.discountValue} onChange={(e) => p.setDiscountValue(e.target.value)} placeholder={p.discountType === "percent" ? "0" : "0.00"} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
                    </>
                  ) : <div />}
                </div>
                <div>
                  {p.taxExempt ? (
                    <>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                        Sales Permit # <span style={{ color: "var(--color-danger)" }}>*</span>
                      </label>
                      <input value={p.salesPermit} onChange={(e) => p.setSalesPermit(e.target.value)} placeholder="Permit number…" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={{ ...fieldStyle, ...(p.salesPermitError ? { border: "1px solid var(--color-danger)" } : {}) }} />
                      {p.salesPermitError && (
                        <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>{p.salesPermitError}</p>
                      )}
                    </>
                  ) : <div />}
                </div>
              </div>
            )}
          </div>

          {/* ── Order Flow segmented control ── */}
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
              <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-baseline justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Payment Methods</h4>
                  <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Select all that apply · Offline is exclusive</span>
                </div>
                <div className="flex gap-2">
                  {paymentLabels.map((opt) => {
                    const active = p.paymentTypes.includes(opt);
                    const isOffline = opt === "Offline";
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => p.togglePayment(opt)}
                        className="flex-1 py-2 text-sm font-medium rounded-md border transition-all"
                        style={active ? {
                          background: isOffline ? "var(--color-neutral-bg)" : "var(--color-accent)",
                          color: isOffline ? "var(--color-neutral-text)" : "var(--color-btn-primary-text)",
                          borderColor: isOffline ? "var(--color-neutral-border)" : "var(--color-accent)",
                        } : {
                          background: "var(--color-surface)",
                          color: "var(--color-text-muted)",
                          borderColor: "var(--color-border)",
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Prepayment */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Prepayment / Deposit</h4>
                {/* Full / Partial toggle */}
                <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-border)", width: "fit-content" }}>
                  {(["full", "partial"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => p.setPrepayMode(mode)}
                      className="px-4 py-2 text-sm font-medium transition-colors"
                      style={
                        p.prepayMode === mode
                          ? { background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }
                          : { background: "var(--color-surface)", color: "var(--color-text-muted)" }
                      }
                    >
                      {mode === "full" ? "Full Payment" : "Partial Payment"}
                    </button>
                  ))}
                </div>

                {/* Partial payment controls */}
                {p.prepayMode === "partial" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                        {(["percent", "fixed"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => p.setPrepayType(opt)}
                            className="px-3 py-2 text-sm font-medium transition-colors"
                            style={
                              p.prepayType === opt
                                ? { background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }
                                : { background: "var(--color-surface)", color: "var(--color-text-muted)" }
                            }
                          >
                            {opt === "percent" ? "%" : "$"}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={p.prepayType === "percent" ? 100 : undefined}
                        step={p.prepayType === "percent" ? 1 : 0.01}
                        value={p.prepayValue}
                        onChange={(e) => p.setPrepayValue(e.target.value)}
                        className="w-28 px-3 py-2 rounded-md text-sm border outline-none"
                        style={fieldStyle}
                      />
                      <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                        = <strong style={{ color: "var(--color-text-primary)" }}>
                          {p.prepayType === "percent"
                            ? formatCurrency(p.pricing.final_total * (parseFloat(p.prepayValue) / 100 || 0))
                            : formatCurrency(parseFloat(p.prepayValue) || 0)}
                        </strong>
                      </span>
                    </div>
                    {p.pricing.final_total > 0 && (() => {
                      const dueNow = p.prepayType === "percent"
                        ? Math.round(p.pricing.final_total * (parseFloat(p.prepayValue) / 100 || 0) * 100) / 100
                        : Math.round(Math.min(parseFloat(p.prepayValue) || 0, p.pricing.final_total) * 100) / 100;
                      const balance = Math.max(Math.round((p.pricing.final_total - dueNow) * 100) / 100, 0);
                      return (
                        <div className="flex gap-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
                          <span>Due now: <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(dueNow)}</strong></span>
                          <span>Balance: <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(balance)}</strong></span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Send payment link */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Send Payment Link</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Send Via <span style={{ color: "var(--color-danger)" }}>*</span></label>
                    <StyledSelect value={p.quoteChannel} onChange={p.setQuoteChannel}>
                      {channelLabels.map((o) => <option key={o} value={o}>{o}</option>)}
                    </StyledSelect>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                      {p.quoteChannel === "Email" ? "Email Address" : p.quoteChannel === "SMS" || p.quoteChannel === "WhatsApp" ? "Phone / Contact" : p.quoteChannel === "In-person" ? "Location" : "Contact"} <span style={{ color: "var(--color-danger)" }}>*</span>
                    </label>
                    {p.quoteChannel === "Email" ? (
                      <EmailInput value={p.quoteDestination} onChange={(e) => p.setQuoteDestination(e.target.value)} error={p.quoteDestinationError} showAction />
                    ) : p.quoteChannel === "SMS" || p.quoteChannel === "WhatsApp" ? (
                      <PhoneInput value={p.quoteDestination} onChange={(val) => p.setQuoteDestination(val)} error={p.quoteDestinationError} />
                    ) : (
                      <>
                        <input value={p.quoteDestination} onChange={(e) => p.setQuoteDestination(e.target.value)} type="text" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={{ ...fieldStyle, ...(p.quoteDestinationError ? { borderColor: "var(--color-danger)" } : {}) }} />
                        {p.quoteDestinationError && <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">{p.quoteDestinationError}</p>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── Quote first flow ── */
            <>
              {/* Send quote */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Send Quote to Customer</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Send Via <span style={{ color: "var(--color-danger)" }}>*</span></label>
                    <StyledSelect value={p.quoteChannel} onChange={p.setQuoteChannel}>
                      {channelLabels.map((o) => <option key={o} value={o}>{o}</option>)}
                    </StyledSelect>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                      {p.quoteChannel === "Email" ? "Email Address" : p.quoteChannel === "SMS" || p.quoteChannel === "WhatsApp" ? "Phone / Contact" : p.quoteChannel === "In-person" ? "Location" : "Contact"} <span style={{ color: "var(--color-danger)" }}>*</span>
                    </label>
                    {p.quoteChannel === "Email" ? (
                      <EmailInput value={p.quoteDestination} onChange={(e) => p.setQuoteDestination(e.target.value)} error={p.quoteDestinationError} showAction />
                    ) : p.quoteChannel === "SMS" || p.quoteChannel === "WhatsApp" ? (
                      <PhoneInput value={p.quoteDestination} onChange={(val) => p.setQuoteDestination(val)} error={p.quoteDestinationError} />
                    ) : (
                      <>
                        <input value={p.quoteDestination} onChange={(e) => p.setQuoteDestination(e.target.value)} type="text" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={{ ...fieldStyle, ...(p.quoteDestinationError ? { borderColor: "var(--color-danger)" } : {}) }} />
                        {p.quoteDestinationError && <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-danger)" }} role="alert">{p.quoteDestinationError}</p>}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Follow-up schedule */}
              <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Follow-up Schedule</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>First Reminder</label>
                    <DatePicker value={p.reminderDate} onChange={p.setReminderDate} placeholder="Pick a date" disablePast />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Cycles</label>
                    <div className="relative">
                      <select value={p.followUpCycles} onChange={(e) => p.setFollowUpCycles(parseInt(e.target.value))} className="w-full appearance-none px-3 py-2 pr-8 rounded-md text-sm border outline-none" style={fieldStyle}>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--color-text-muted)" }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Frequency</label>
                    <StyledSelect value={p.followUpFreq} onChange={p.setFollowUpFreq}>
                      {freqLabels.map((o) => <option key={o} value={o}>{o}</option>)}
                    </StyledSelect>
                  </div>
                </div>
              </div>

              {/* Payment methods — only shown after customer approves */}
              {p.ticket.ticket_status === "approved" && (
                <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }}>
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-success)" }}>
                      Quote Approved — Select Payment Method
                    </h4>
                    <span className="text-[10px]" style={{ color: "var(--color-success)" }}>Select all that apply · Offline is exclusive</span>
                  </div>
                  <div className="flex gap-2">
                    {paymentLabels.map((opt) => {
                      const active = p.paymentTypes.includes(opt);
                      const isOffline = opt === "Offline";
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => p.togglePayment(opt)}
                          className="flex-1 py-2 text-sm font-medium rounded-md border transition-all"
                          style={active ? {
                            background: isOffline ? "var(--color-neutral-bg)" : "var(--color-accent)",
                            color: isOffline ? "var(--color-neutral-text)" : "var(--color-btn-primary-text)",
                            borderColor: isOffline ? "var(--color-neutral-border)" : "var(--color-accent)",
                          } : {
                            background: "var(--color-surface)",
                            color: "var(--color-text-muted)",
                            borderColor: "var(--color-border)",
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          {[
            ["Order Flow", p.ticket.order_source === "direct" ? "Direct order" : "Quote first"],
            ["Shipping", p.ticket.quote_shipping != null ? formatCurrency(p.ticket.quote_shipping) : null],
            ["Discount", p.ticket.discount_type
              ? p.ticket.discount_type === "percent"
                ? `${p.ticket.discount_value}%`
                : `$${p.ticket.discount_value}`
              : null],
            ["Tax Rate", p.ticket.tax_exempt ? "Exempt" : p.ticket.quote_tax_rate_percent != null ? `${p.ticket.quote_tax_rate_percent}%` : null],
            ...(p.orderSource === "direct" || p.ticket.ticket_status === "approved"
              ? [["Payment Methods", p.ticket.quote_payment_types?.join(", ")]] as [string, string | null | undefined][]
              : []),
            ["Prepayment", (() => {
              if (p.ticket.prepayment_type === "percent") return `Partial — ${p.ticket.prepayment_value}%`;
              if (p.ticket.prepayment_type === "fixed")   return `Partial — $${p.ticket.prepayment_value}`;
              if (p.ticket.prepayment_type === "full")    return "Full Payment";
              return null;
            })()],
            [p.orderSource === "direct" ? "Send Payment Link Via" : "Send Quote Via", p.ticket.quote_channel],
            ["Destination", p.ticket.quote_destination],
            ...(p.orderSource !== "direct"
              ? [["Follow-up Date", p.ticket.quote_reminder_date]] as [string, string | null | undefined][]
              : []),
          ].map(([label, val]) => val ? (
            <div key={label as string}>
              <dt className="text-xs font-medium mb-0.5" style={{ color: "var(--color-text-muted)" }}>{label}</dt>
              <dd className="text-sm" style={{ color: "var(--color-text-primary)" }}>{val}</dd>
            </div>
          ) : null)}
        </dl>
      )}
    </div>
  );
}

// ─── Activity type → icon + human label ──────────────────────────────────────

type ActivityRow = {
  id: string;
  type: string;
  created_at: string;
  _source?: "lead" | "ticket";
  by_user: { full_name: string | null } | null;
  payload: Record<string, unknown> | null;
};

const ACTIVITY_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  lead_created:                { icon: User,          label: "Lead created",               color: "var(--color-info-text)" },
  lead_claimed:                { icon: UserCheck,     label: "Lead claimed",               color: "var(--color-success)" },
  lead_validated:              { icon: BadgeCheck,    label: "Lead verified",              color: "var(--color-success)" },
  lead_status_changed:         { icon: RefreshCw,     label: "Lead status changed",        color: "var(--color-text-muted)" },
  lead_routed_to_sales:        { icon: ArrowRight,    label: "Routed to Sales",            color: "var(--color-info-text)" },
  lead_put_on_hold:            { icon: Pause,         label: "Put on hold",                color: "var(--color-warning)" },
  lead_hold_resumed:           { icon: RefreshCw,     label: "Hold resumed",               color: "var(--color-success)" },
  lead_rejected:               { icon: XCircle,       label: "Lead rejected",              color: "var(--color-danger)" },
  lead_note_added:             { icon: MessageSquare, label: "Note added",                 color: "var(--color-text-muted)" },
  order_ticket_created:        { icon: FileText,      label: "Quote / Order created",      color: "var(--color-accent)" },
  order_ticket_status_changed: { icon: RefreshCw,     label: "Status changed",             color: "var(--color-info-text)" },
  ticket_sent:                 { icon: Mail,          label: "Quote sent to customer",     color: "var(--color-info-text)" },
  ticket_resent:               { icon: Mail,          label: "Quote resent to customer",   color: "var(--color-info-text)" },
  ticket_client_confirmed:     { icon: BadgeCheck,    label: "Customer confirmed quote",   color: "var(--color-success)" },
  ticket_converted:                { icon: BadgeCheck,    label: "Converted to order",          color: "var(--color-info-text)" },
  ticket_payment_reminder_sent:    { icon: Mail,          label: "Payment reminder sent",        color: "var(--color-info-text)" },
  ticket_won:                  { icon: BadgeCheck,    label: "Quote won / converted",      color: "var(--color-success)" },
  ticket_cancelled:            { icon: XCircle,       label: "Ticket cancelled",           color: "var(--color-danger)" },
};

function activityMeta(type: string, payload?: Record<string, unknown> | null) {
  if (type === "ticket_sent" && payload?.resend) {
    return ACTIVITY_META["ticket_resent"] ?? ACTIVITY_META["ticket_sent"];
  }
  return ACTIVITY_META[type] ?? { icon: Clock, label: type.replace(/_/g, " "), color: "var(--color-text-muted)" };
}

function activityDetail(a: ActivityRow): string | null {
  const p = a.payload;
  if (!p) return null;
  if (a.type === "lead_status_changed" || a.type === "order_ticket_status_changed") {
    if (p.from && p.to) return `${p.from} → ${p.to}`;
    if (p.to) return String(p.to);
  }
  if (a.type === "ticket_sent") {
    const channel = p.channel ? String(p.channel) : null;
    const recipient = p.recipient ?? p.destination ?? null;
    if (channel && recipient) return `via ${channel} to ${recipient}`;
    if (channel) return `via ${channel}`;
    return null;
  }
  if (a.type === "ticket_client_confirmed") {
    return p.reference_code ? `Order ${p.reference_code} created` : "Confirmed via link";
  }
  if (a.type === "ticket_converted") {
    return p.reference_code ? `Order ${p.reference_code} created` : "Converted manually";
  }
  if (a.type === "lead_put_on_hold" && p.hold_reason) return String(p.hold_reason);
  if (a.type === "lead_rejected" || a.type === "lead_routed_to_sales") {
    if (p.reason) return String(p.reason);
  }
  if (a.type === "order_ticket_created" && p.title) return String(p.title);
  return null;
}

// ─── History Section ──────────────────────────────────────────────────────────

function HistorySection({ ticketId }: { ticketId: string }) {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(() => {
    // include_linked_lead=true → API returns the full lifetime:
    // lead activities (oldest) + ticket activities (newest), sorted chronologically
    fetch(`/api/activities?ticket_id=${ticketId}&include_linked_lead=true`)
      .then((r) => r.json())
      .then((d) => { if (d.activities) setActivities([...(d.activities as ActivityRow[])].reverse()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Refresh when any new activity is logged (sidebar broadcasts this event)
  useEffect(() => {
    window.addEventListener("bazaar:activities-changed", fetchActivities);
    return () => window.removeEventListener("bazaar:activities-changed", fetchActivities);
  }, [fetchActivities]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-7 h-7 rounded-full shrink-0" style={{ background: "var(--color-border)" }} />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-48 rounded" style={{ background: "var(--color-border)" }} />
              <div className="h-3 w-24 rounded" style={{ background: "var(--color-border)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activities.length) {
    return (
      <p className="text-sm py-4 text-center" style={{ color: "var(--color-text-muted)" }}>
        No history yet.
      </p>
    );
  }

  // Group activities by date for a cleaner timeline
  const groups: { date: string; items: ActivityRow[] }[] = [];
  let currentDate = "";
  for (const a of activities) {
    const date = new Date(a.created_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ date, items: [] });
    }
    groups[groups.length - 1].items.push(a);
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div
        className="absolute left-3.5 top-2 bottom-2 w-px"
        style={{ background: "var(--color-border)" }}
      />

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="relative flex items-center mb-4">
              <div className="w-7 shrink-0" />
              <span
                className="ml-3 text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}
              >
                {group.date}
              </span>
            </div>

            <div className="space-y-3">
              {group.items.map((a, i) => {
                const meta = activityMeta(a.type, a.payload);
                const Icon = meta.icon;
                const detail = activityDetail(a);
                const isLeadActivity = a._source === "lead";

                return (
                  <div key={a.id ?? i} className="relative flex items-start gap-3">
                    {/* Icon dot */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border-2"
                      style={{
                        background: "var(--color-surface)",
                        borderColor: "var(--color-border)",
                      }}
                    >
                      <Icon size={12} style={{ color: meta.color }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                            <span className="font-medium">{a.by_user?.full_name ?? "System"}</span>
                            <span style={{ color: "var(--color-text-muted)" }}> — {meta.label}</span>
                          </p>
                          {detail && (
                            <p className="text-xs mt-0.5 font-medium" style={{ color: meta.color }}>
                              {detail}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Source badge */}
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
                            style={
                              isLeadActivity
                                ? { background: "var(--color-info-bg)", color: "var(--color-info-text)" }
                                : { background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }
                            }
                          >
                            {isLeadActivity ? "Lead" : "Ticket"}
                          </span>
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {new Date(a.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TicketSkeleton() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: "var(--color-bg)" }}>
      <div className="border-b px-6 py-4 flex items-center gap-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="h-5 w-16 rounded" style={{ background: "var(--color-border)" }} />
        <div className="h-6 w-64 rounded" style={{ background: "var(--color-border)" }} />
      </div>
      <div className="w-full px-6 py-6 flex gap-6">
        <div className="w-72 h-64 rounded-xl" style={{ background: "var(--color-surface)" }} />
        <div className="flex-1 h-96 rounded-xl" style={{ background: "var(--color-surface)" }} />
      </div>
    </div>
  );
}
