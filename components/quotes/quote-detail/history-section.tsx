"use client";

import { useCallback, useEffect, useState } from "react";
import { isOrderReferenceCode, isQuoteReferenceCode } from "@/lib/utils/reference-codes";
import {
  User,
  Mail,
  Clock,
  AlertCircle,
  UserCheck,
  FileCheck2,
  RefreshCw,
  ArrowRight,
  Pause,
  XCircle,
  MessageSquare,
  BadgeCheck,
  FileText,
  CreditCard,
  Factory,
  Send,
} from "lucide-react";

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
  ticket_converted:            { icon: BadgeCheck,    label: "Converted to order",         color: "var(--color-info-text)" },
  ticket_payment_reminder_sent:{ icon: Mail,          label: "Payment reminder sent",      color: "var(--color-info-text)" },
  ticket_invoice_resent:       { icon: Mail,          label: "Invoice link resent",        color: "var(--color-info-text)" },
  ticket_order_ready_sent:     { icon: Send,          label: "Pickup notification sent",   color: "var(--color-success)" },
  ticket_order_ready_failed:   { icon: AlertCircle,   label: "Pickup notification failed", color: "var(--color-warning)" },
  ticket_payment_evidence_submitted: { icon: CreditCard, label: "Customer submitted payment proof", color: "var(--color-warning)" },
  ticket_payment_recorded:     { icon: BadgeCheck,    label: "Payment recorded",           color: "var(--color-success)" },
  ticket_payment_confirmed_sent:{ icon: Send,         label: "Payment confirmation sent",  color: "var(--color-info-text)" },
  ticket_production_released:  { icon: Factory,       label: "Released to production",     color: "var(--color-info-text)" },
  ticket_won:                  { icon: BadgeCheck,    label: "Quote won / converted",      color: "var(--color-success)" },
  ticket_cancelled:            { icon: XCircle,       label: "Ticket cancelled",           color: "var(--color-danger)" },
};

const CUSTOMER_ACTIVITY_TYPES = new Set([
  "ticket_client_confirmed",
  "ticket_payment_evidence_submitted",
  "order_ticket_status_changed",
  "ticket_payment_recorded",
  "ticket_production_released",
]);

const METHOD_LABELS: Record<string, string> = {
  wire: "Wire Transfer",
  ach:  "ACH / Bank",
  zelle: "Zelle",
  check: "Check",
  card: "Card",
  cash: "Cash",
};

function fmtMoney(n: unknown): string | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function actorLabel(a: ActivityRow): string {
  if (a.by_user?.full_name) return a.by_user.full_name;
  if (CUSTOMER_ACTIVITY_TYPES.has(a.type) && !a.by_user) return "Customer";
  return "System";
}

function activityMeta(type: string, payload?: Record<string, unknown> | null) {
  if (type === "ticket_sent" && payload?.resend) {
    return ACTIVITY_META["ticket_resent"] ?? ACTIVITY_META["ticket_sent"];
  }
  if (type === "order_ticket_created") {
    const ref = payload?.reference_code != null ? String(payload.reference_code).trim() : "";
    const kind = payload?.ticket_kind != null ? String(payload.ticket_kind) : "";
    if (ref && isQuoteReferenceCode(ref)) {
      return { icon: FileText, label: "Quote created", color: "var(--color-accent)" };
    }
    if (ref && isOrderReferenceCode(ref)) {
      return { icon: FileText, label: "Order created", color: "var(--color-accent)" };
    }
    if (kind === "quote") {
      return { icon: FileText, label: "Quote created", color: "var(--color-accent)" };
    }
    if (kind === "order") {
      return { icon: FileText, label: "Order created", color: "var(--color-accent)" };
    }
    return ACTIVITY_META.order_ticket_created;
  }
  return ACTIVITY_META[type] ?? { icon: Clock, label: type.replace(/_/g, " "), color: "var(--color-text-muted)" };
}

function activityDetail(a: ActivityRow): string | null {
  const p = a.payload;
  if (!p) return null;
  if (a.type === "ticket_cancelled") {
    const label = p.reason_label ? String(p.reason_label) : p.reason ? String(p.reason).replace(/_/g, " ") : null;
    const from = p.from ? String(p.from).replace(/_/g, " ") : null;
    const parts = [label, from ? `from ${from}` : null, p.notes ? String(p.notes) : null].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (a.type === "lead_status_changed" || a.type === "order_ticket_status_changed") {
    const from = p.from ? String(p.from).replace(/_/g, " ") : null;
    const to = p.to ? String(p.to).replace(/_/g, " ") : null;
    if (from && to) {
      const via = p.via === "public_payment" ? " · via customer payment"
        : p.via === "public_confirm" ? " · via customer confirmation"
        : p.via === "accountant_confirm" ? " · after payment confirmed"
        : p.auto ? " · automatic"
        : "";
      return `${from} → ${to}${via}`;
    }
    if (p.to) return String(p.to).replace(/_/g, " ");
  }
  if (a.type === "ticket_sent") {
    const channel = p.channel ? String(p.channel) : null;
    const recipient = p.recipient ?? p.destination ?? null;
    if (channel && recipient) return `via ${channel} to ${recipient}`;
    if (channel) return `via ${channel}`;
    return null;
  }
  if (a.type === "ticket_client_confirmed") {
    const via = p.via === "public_payment" ? "Via payment page"
      : p.via === "public_link" ? "Via quote link"
      : "Confirmed";
    return p.reference_code ? `${via} · Order ${p.reference_code}` : via;
  }
  if (a.type === "ticket_converted") {
    return p.reference_code ? `Order ${p.reference_code} created` : "Converted manually";
  }
  if (a.type === "ticket_payment_evidence_submitted") {
    const amount = fmtMoney(p.amount);
    const method = p.method ? (METHOD_LABELS[String(p.method)] ?? String(p.method)) : null;
    return [amount, method].filter(Boolean).join(" · ") || "Awaiting accountant review";
  }
  if (a.type === "ticket_payment_recorded") {
    const amount = fmtMoney(p.amount);
    const method = p.method ? (METHOD_LABELS[String(p.method)] ?? String(p.method)) : null;
    const via = p.via === "public_payment" ? "Customer payment"
      : p.via === "accountant_evidence_confirm" ? "Accountant confirmed proof"
      : p.via === "staff_cash_auto" || p.via === "staff_cash_auto_backfill" ? "Cash / offline (staff)"
      : "Staff recorded";
    return [amount, method, via].filter(Boolean).join(" · ");
  }
  if (a.type === "ticket_production_released") {
    if (p.via === "public_payment") return "Auto-released after customer payment";
    if (p.via === "accountant_confirm") return "Auto-released after payment confirmed";
    return p.auto ? "Automatic release" : "Manual release";
  }
  if (a.type === "ticket_payment_confirmed_sent") {
    const amount = fmtMoney(p.amount);
    return p.in_production
      ? `${amount ?? "Payment"} confirmed · customer notified · now in production`
      : `${amount ?? "Payment"} confirmed · customer notified`;
  }
  if (a.type === "ticket_invoice_resent") {
    const channel = p.channel ? String(p.channel) : null;
    const destination = p.destination ? String(p.destination) : null;
    if (channel && destination) return `via ${channel} to ${destination}`;
    if (channel) return `via ${channel}`;
    return null;
  }
  if (a.type === "ticket_order_ready_sent" || a.type === "ticket_order_ready_failed") {
    const channel = p.channel ? String(p.channel) : null;
    const destination = p.destination ? String(p.destination) : null;
    const err = p.error ? String(p.error) : null;
    if (a.type === "ticket_order_ready_failed" && err) return err;
    if (channel && destination) return `via ${channel} to ${destination}`;
    if (channel) return `via ${channel}`;
    return null;
  }
  if (a.type === "lead_put_on_hold" && p.hold_reason) return String(p.hold_reason);
  if (a.type === "lead_rejected" || a.type === "lead_routed_to_sales") {
    if (p.reason) return String(p.reason);
  }
  if (a.type === "order_ticket_created") {
    if (p.reference_code) return String(p.reference_code);
    if (p.title) return String(p.title);
  }
  return null;
}

export function HistorySection({ ticketId }: { ticketId: string }) {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(() => {
    fetch(`/api/activities?ticket_id=${ticketId}&include_linked_lead=true`)
      .then((r) => r.json())
      .then((d) => { if (d.activities) setActivities([...(d.activities as ActivityRow[])].reverse()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

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
      <div className="absolute left-3.5 top-2 bottom-2 w-px" style={{ background: "var(--color-border)" }} />
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.date}>
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
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 border-2"
                      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
                    >
                      <Icon size={12} style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                            <span className="font-medium">{actorLabel(a)}</span>
                            <span style={{ color: "var(--color-text-muted)" }}> — {meta.label}</span>
                          </p>
                          {detail && (
                            <p className="text-xs mt-0.5 font-medium" style={{ color: meta.color }}>{detail}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
                            style={isLeadActivity
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
