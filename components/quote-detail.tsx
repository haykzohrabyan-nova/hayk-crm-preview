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
} from "lucide-react";
import { computePricing, formatCurrency, type QuoteSku } from "@/lib/utils/ticket-math";
import { formatPhone } from "@/lib/utils/phone";
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
  const [hvThreshold, setHvThreshold] = useState<number | null>(null);
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

    // Payment-status-only update — skip all form validation and just PATCH the extra fields
    if (!newStatus && extraFields && Object.keys(extraFields).length > 0 && ticket?.ticket_status === "order") {
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
    setPaymentTypes([opt]);
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
  const isLocked = ticket.ticket_status === "cancelled" || (ticket.ticket_status === "order" && hasPayment);

  return (
    <>
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b flex items-center gap-3 px-6 py-4"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm font-medium hover:opacity-70 transition-opacity"
          style={{ color: "var(--color-text-muted)" }}
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="w-px h-5" style={{ background: "var(--color-border)" }} />
        <h1 className="text-xl font-semibold flex-1 truncate" style={{ color: "var(--color-text-primary)" }}>
          {ticket.title ?? "Untitled Quote"}
        </h1>

        {ticket.reference_code && (
          <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
            {ticket.reference_code}
          </span>
        )}

        <span
          className="px-2.5 py-1 rounded-full text-xs font-medium capitalize"
          style={{ background: statusColors.bg, color: statusColors.text }}
        >
          {ticket.ticket_status}
        </span>

        {/* Download PDF */}
        <a
          href={`/api/tickets/${ticketId}/pdf`}
          download
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-opacity hover:opacity-80"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)", textDecoration: "none" }}
          title="Download PDF"
        >
          <Printer size={14} /> Save PDF
        </a>

        {!editing && !isLocked && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-opacity hover:opacity-80"
            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
          >
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mx-6 mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", border: "1px solid var(--color-danger-border)" }}
        >
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <div className="w-full px-6 py-6 flex gap-6">
        {/* Left: Lead info card OR Customer info card */}
        {ticket.lead ? (
          <aside className="w-72 shrink-0">
            <LinkedLeadCard lead={ticket.lead} />
          </aside>
        ) : (ticket.customer || ticket.contact_name || ticket.contact_email || ticket.contact_phone) ? (
          <aside className="w-72 shrink-0">
            <CustomerInfoCard ticket={ticket} />
          </aside>
        ) : null}

        {/* Right: Content */}
        <div className="flex-1 min-w-0">
          {/* Tabs */}
          <div className="flex border-b mb-6" style={{ borderColor: "var(--color-border)" }}>
            {VIEW_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-sm font-medium transition-colors relative"
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
                  title={title} setTitle={setTitle}
                  priority={priority} setPriority={setPriority}
                  dueDate={dueDate} setDueDate={(v) => {
                    setDueDate(v);
                    if (v) {
                      const today = new Date(); today.setHours(0, 0, 0, 0);
                      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
                      const picked = new Date(v + "T00:00:00");
                      setRush(picked <= tomorrow);
                    }
                  }}
                  rush={rush} setRush={setRush}
                  specialRequirements={specialRequirements} setSpecialRequirements={setSpecialRequirements}
                  notes={notes} setNotes={setNotes}
                  ticket={ticket}
                  priorityOpts={quoteLookups.ticket_priority}
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
                    salesPermit={salesPermit} setSalesPermit={setSalesPermit}
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

          {/* Bottom action bar — view mode */}
          {!editing && !isLocked && (
            <div
              className="mt-4 rounded-xl px-5 py-3 flex items-center gap-3"
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
                  onClick={() => handleSave("approved")}
                  className="px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
                >
                  Mark Won
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

          {/* Payment status bar — visible when ticket is a confirmed order */}
          {!editing && ticket.ticket_status === "order" && (
            <div
              className="mt-4 rounded-xl px-5 py-3 flex items-center gap-3 flex-wrap"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                Payment
              </span>
              {(["unpaid", "partial", "paid"] as const).map((status) => {
                const styles = {
                  unpaid:  { active: { background: "var(--color-danger-bg)",  color: "var(--color-danger)"  }, label: "Unpaid"  },
                  partial: { active: { background: "var(--color-warning-bg)", color: "var(--color-warning)" }, label: "Partial" },
                  paid:    { active: { background: "var(--color-success-bg)", color: "var(--color-success)" }, label: "Paid"    },
                };
                const s = styles[status];
                const isActive = (ticket.payment_status ?? "unpaid") === status;
                return (
                  <button
                    key={status}
                    disabled={saving}
                    onClick={() => handleSave(undefined, { payment_status: status })}
                    className="px-3 py-1 text-xs font-medium rounded-full border transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={
                      isActive
                        ? { ...s.active, borderColor: "transparent" }
                        : { background: "var(--color-bg)", color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
              <span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>
                Click to update payment status
              </span>
            </div>
          )}

          {/* Deposit status bar — visible when order has a partial prepayment set */}
          {!editing && ticket.ticket_status === "order" && (ticket.prepayment_type === "percent" || ticket.prepayment_type === "fixed") && (
            <div
              className="mt-2 rounded-xl px-5 py-3 flex items-center gap-3 flex-wrap"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                Deposit
              </span>
              {(["pending", "paid"] as const).map((status) => {
                const styles = {
                  pending: { active: { background: "var(--color-warning-bg)", color: "var(--color-warning)" }, label: "Pending" },
                  paid:    { active: { background: "var(--color-success-bg)", color: "var(--color-success)" }, label: "Paid"    },
                };
                const s = styles[status];
                const isActive = (ticket.prepayment_status ?? "pending") === status;
                return (
                  <button
                    key={status}
                    disabled={saving}
                    onClick={() => handleSave(undefined, { prepayment_status: status })}
                    className="px-3 py-1 text-xs font-medium rounded-full border transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={
                      isActive
                        ? { ...s.active, borderColor: "transparent" }
                        : { background: "var(--color-bg)", color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {(() => {
                  const val = parseFloat(ticket.prepayment_value ?? "0") || 0;
                  const total = ticket.quote_final_total ?? 0;
                  const amount = ticket.prepayment_type === "percent"
                    ? Math.round(total * (val / 100) * 100) / 100
                    : Math.min(val, total);
                  return `— deposit amount: ${formatCurrency(amount)}`;
                })()}
              </span>
              <span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>
                Will be auto-updated by Stripe
              </span>
            </div>
          )}

          {/* Bottom action bar — edit mode */}
          {editing && (
            <div
              className="mt-4 rounded-xl px-5 py-3 flex items-center justify-between gap-2"
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
          <button
            onClick={() => {
              if (hvTimerRef.current) { clearInterval(hvTimerRef.current); hvTimerRef.current = null; }
              setHvModal(false);
              handleSaveRef.current?.("routed");
            }}
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
              border: "none",
              borderRadius: 6,
              padding: "8px 32px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            OK
          </button>
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
  return d.toISOString().slice(0, 10);
}

function InfoSection(p: InfoSectionProps) {
  const [notesOpen, setNotesOpen] = useState(!!p.notes);
  const fieldStyle = { background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" };

  if (!p.editing) {
    return (
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
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
          className="w-full px-3 py-2 rounded-md text-sm border outline-none"
          style={fieldStyle}
        />
      </div>

      {/* Priority pill group */}
      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>Priority</label>
        <div className="flex gap-2 flex-wrap">
          {(p.priorityOpts.length ? p.priorityOpts.map((o) => o.label) : ["Low", "Normal", "High"]).filter((o) => o.toLowerCase() !== "urgent").map((opt) => {
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
        {/* Toggle switch */}
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
          placeholder="Any special requirements for this order…"
          className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-y"
          style={fieldStyle}
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
              placeholder="Internal notes visible only to staff…"
              className="w-full px-3 py-2 rounded-md text-sm border outline-none resize-y"
              style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
          </div>
        )}
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
      <div className="grid grid-cols-2 gap-4 mb-4">
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
          <input type="number" min={0} value={sku.width ?? ""} onChange={(e) => onUpdate(idx, "width", e.target.value ? parseFloat(e.target.value) : undefined)} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Height (in)</label>
          <input type="number" min={0} value={sku.height ?? ""} onChange={(e) => onUpdate(idx, "height", e.target.value ? parseFloat(e.target.value) : undefined)} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
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
          <input type="number" min={1} value={sku.quantity ?? ""} onChange={(e) => onUpdate(idx, "quantity", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Unit Price ($)</label>
          <input type="number" min={0} step={0.01} value={sku.unit_price ?? ""} onChange={(e) => onUpdate(idx, "unit_price", e.target.value ? parseFloat(e.target.value) : undefined)} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
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
            setLineTotalRaw(e.target.value);
            const n = parseFloat(e.target.value);
            onUpdate(idx, "line_total", isNaN(n) ? undefined : n);
          }}
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

  const activePricing = p.editing ? p.pricing : {
    subtotal: p.ticket.quote_subtotal ?? 0,
    shipping: p.ticket.quote_shipping ?? 0,
    discount_amount: 0,
    pre_tax_total: p.ticket.quote_pre_tax_total ?? 0,
    tax_amount: p.ticket.quote_tax_amount ?? 0,
    final_total: p.ticket.quote_final_total ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* Pricing summary */}
      <div className="rounded-lg p-4 space-y-2" style={{ background: "var(--color-badge-bg)", border: "1px solid var(--color-border)" }}>
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
      </div>

      {p.editing ? (
        <div className="space-y-6">
          {/* ── Pricing Adjustments card ── */}
          <div className="rounded-lg p-4 space-y-4 border" style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Adjustments</h4>

            {/* Row 1: Shipping + Tax Rate inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Shipping ($)</label>
                <input type="number" min={0} step={0.01} placeholder="0.00"
                  value={shippingRaw}
                  onChange={(e) => { setShippingRaw(e.target.value); p.setShipping(parseFloat(e.target.value) || 0); }}
                  onBlur={() => { const n = parseFloat(shippingRaw); setShippingRaw(isNaN(n) ? "" : String(n)); }}
                  className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Tax Rate (%)</label>
                <input type="number" min={0} step={0.1} placeholder="0" disabled={p.taxExempt}
                  value={taxRateRaw}
                  onChange={(e) => { setTaxRateRaw(e.target.value); p.setTaxRate(parseFloat(e.target.value) || 0); }}
                  onBlur={() => { const n = parseFloat(taxRateRaw); setTaxRateRaw(isNaN(n) ? "" : String(n)); }}
                  className="w-full px-3 py-2 rounded-md text-sm border outline-none disabled:opacity-40" style={fieldStyle} />
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
                      <input type="number" min={0} step={p.discountType === "percent" ? 1 : 0.01} value={p.discountValue} onChange={(e) => p.setDiscountValue(e.target.value)} placeholder={p.discountType === "percent" ? "0" : "0.00"} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
                    </>
                  ) : <div />}
                </div>
                <div>
                  {p.taxExempt ? (
                    <>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Sales Permit #</label>
                      <input value={p.salesPermit} onChange={(e) => p.setSalesPermit(e.target.value)} placeholder="Permit number…" className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
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
                <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Payment Methods</h4>
                <div
                  className="grid rounded-md overflow-hidden border"
                  style={{ gridTemplateColumns: `repeat(${paymentLabels.length}, 1fr)`, borderColor: "var(--color-border)" }}
                >
                  {paymentLabels.map((opt, i) => {
                    const active = p.paymentTypes.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => p.togglePayment(opt)}
                        className={`py-2 text-sm font-medium transition-all${i < paymentLabels.length - 1 ? " border-r" : ""}`}
                        style={{
                          background: active ? "var(--color-accent)" : "var(--color-surface)",
                          color: active ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
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
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-4">
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
                    <DatePicker value={p.reminderDate} onChange={p.setReminderDate} placeholder="Pick a date" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-text-muted)" }}>Cycles</label>
                    <input type="number" min={1} max={10} value={p.followUpCycles} onChange={(e) => p.setFollowUpCycles(parseInt(e.target.value) || 3)} className="w-full px-3 py-2 rounded-md text-sm border outline-none" style={fieldStyle} />
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
                  <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-success)" }}>
                    Quote Approved — Select Payment Method
                  </h4>
                  <div
                    className="grid rounded-md overflow-hidden border"
                    style={{ gridTemplateColumns: `repeat(${paymentLabels.length}, 1fr)`, borderColor: "var(--color-border)" }}
                  >
                    {paymentLabels.map((opt, i) => {
                      const active = p.paymentTypes.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => p.togglePayment(opt)}
                          className={`py-2 text-sm font-medium transition-all${i < paymentLabels.length - 1 ? " border-r" : ""}`}
                          style={{
                            background: active ? "var(--color-accent)" : "var(--color-surface)",
                            color: active ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
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
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
          {[
            ["Order Flow", p.ticket.order_source === "direct" ? "Direct order" : "Quote first"],
            ["Shipping", p.ticket.quote_shipping != null ? formatCurrency(p.ticket.quote_shipping) : null],
            ["Discount", p.ticket.discount_type ? `${p.ticket.discount_value}${p.ticket.discount_type === "percent" ? "%" : " fixed"}` : null],
            ["Tax Rate", p.ticket.tax_exempt ? "Exempt" : p.ticket.quote_tax_rate_percent != null ? `${p.ticket.quote_tax_rate_percent}%` : null],
            ...(p.orderSource === "direct" || p.ticket.ticket_status === "approved"
              ? [["Payment Methods", p.ticket.quote_payment_types?.join(", ")]] as [string, string | null | undefined][]
              : []),
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
  order_ticket_status_changed: { icon: FileCheck2,    label: "Ticket status changed",      color: "var(--color-info-text)" },
  ticket_client_confirmed:     { icon: BadgeCheck,    label: "Client confirmed",           color: "var(--color-success)" },
  ticket_sent:                 { icon: MessageSquare, label: "Quote sent to client",       color: "var(--color-info-text)" },
  ticket_won:                  { icon: BadgeCheck,    label: "Quote won / converted",      color: "var(--color-success)" },
  ticket_cancelled:            { icon: XCircle,       label: "Ticket cancelled",           color: "var(--color-danger)" },
};

function activityMeta(type: string) {
  return ACTIVITY_META[type] ?? { icon: Clock, label: type.replace(/_/g, " "), color: "var(--color-text-muted)" };
}

function activityDetail(a: ActivityRow): string | null {
  const p = a.payload;
  if (!p) return null;
  if (a.type === "lead_status_changed" || a.type === "order_ticket_status_changed") {
    if (p.from && p.to) return `${p.from} → ${p.to}`;
    if (p.to) return String(p.to);
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
                const meta = activityMeta(a.type);
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
