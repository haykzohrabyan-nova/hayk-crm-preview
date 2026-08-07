"use client";

// Customer 360 — WHO the contact is + their FULL history + who owns them, with
// the two actions the CEO asked for: create a follow-up task and (re)assign an
// owner. Reads /api/contact/[id]. Design matches the CRM feature pages: inline
// var(--color-*) tokens, light + dark, reuses components/ui.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Phone,
  Mail,
  AtSign,
  Building2,
  User2,
  UserPlus,
  Plus,
  Sparkles,
  Handshake,
  FileText,
  Package,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Globe,
  Megaphone,
  Store,
  HelpCircle,
  CheckCircle2,
  Circle,
  XCircle,
  Repeat,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { ToastBanner } from "@/components/ui/toast-banner";

type Rep = { id: string; name: string };
type Deal = { id: string; title: string | null; stage: string | null; value_cents: number; in_hands_date: string | null; owner_name: string | null; created_at: string | null };
type Quote = { id: string; deal_id: string; version: number | null; total_cents: number | null; status: string | null; created_at: string | null };
type Order = { id: string; deal_id: string; reference_code: string | null; status: string | null; due_date: string | null; created_at: string | null; amount_cents: number; deal_title: string | null };
type TimelineItem = { id: string; channel: string; direction: string; subject: string | null; snippet: string | null; received_at: string };
type History = { is_returning: boolean; lifetime_spend_cents: number; order_count: number; won_count: number; quote_count: number };
type Data = {
  contact: {
    id: string; name: string; email: string | null; phone: string | null; pretty_phone: string | null;
    ig_handle: string | null; authority: string | null; heat_tag: string | null; lifecycle: string | null;
    notes: string | null; created_at: string | null; last_activity_at: string | null;
  };
  org: { id: string; name: string | null } | null;
  owner: { id: string; name: string | null } | null;
  reps: Rep[];
  deals: Deal[];
  quotes: Quote[];
  orders: Order[];
  history: History;
  timeline: TimelineItem[];
  open_task_count: number;
  brief: { stance: string; bullets: string[] };
};

// ── Lifecycle stage progression ───────────────────────────────────────────────
// The strip a rep reads at a glance: Lead → Specs → Quote → Approval → Payment → Won.
// A deal's raw stage maps onto it: new/specs→Specs, quote→Quote, approval/proof→
// Approval, payment→Payment, won→Won. "lost" is drawn as a dead-ended strip.
const LIFECYCLE_STAGES = ["Lead", "Specs", "Quote", "Approval", "Payment", "Won"] as const;
const STAGE_TO_INDEX: Record<string, number> = {
  new: 1, specs: 1, quote: 2, approval: 3, proof: 3, payment: 4, won: 5,
};
function stageProgress(stage: string | null): { index: number; lost: boolean } {
  const s = (stage ?? "").toLowerCase();
  if (s === "lost") return { index: -1, lost: true };
  return { index: STAGE_TO_INDEX[s] ?? 0, lost: false };
}

const CHANNEL_META: Record<string, { label: string; icon: LucideIcon }> = {
  call: { label: "Call", icon: Phone },
  sms: { label: "SMS", icon: MessageSquare },
  email: { label: "Email", icon: Mail },
  ig_dm: { label: "Instagram", icon: Camera },
  instagram: { label: "Instagram", icon: Camera },
  ad_lead: { label: "Ad lead", icon: Megaphone },
  webform: { label: "Web form", icon: Globe },
  walk_in: { label: "Walk-in", icon: Store },
  unknown: { label: "Note", icon: HelpCircle },
};
function channelMeta(ch: string) {
  return CHANNEL_META[ch] ?? { label: ch.replace(/_/g, " "), icon: HelpCircle };
}

function money(cents: number | null | undefined): string {
  return `$${Math.round((cents ?? 0) / 100).toLocaleString()}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Contact360({ id }: { id: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/contact/${id}`, { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setD(json as Data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !d) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-24 animate-pulse rounded" style={{ background: "var(--color-surface)" }} />
        <div className="h-[120px] animate-pulse rounded-[14px]" style={{ background: "var(--color-surface)" }} />
        <div className="h-[300px] animate-pulse rounded-[14px]" style={{ background: "var(--color-surface)" }} />
      </div>
    );
  }
  if (err || !d) {
    return (
      <div className="space-y-4">
        <BackButton />
        <div className="rounded-[12px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-danger)" }}>
          {err ?? "Contact not found."}
        </div>
      </div>
    );
  }

  const c = d.contact;

  return (
    <div className="space-y-5">
      <BackButton />

      {/* ── Header: WHO they are + WHO owns them ─────────────────────────── */}
      <div className="rounded-[14px] border p-5" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{c.name}</h1>
              <CustomerTypeBadge returning={d.history.is_returning} />
              {c.lifecycle && <Tag>{c.lifecycle}</Tag>}
              {c.heat_tag && <Tag tone="warning">{c.heat_tag}</Tag>}
              {c.authority && <Tag tone="neutral">{c.authority}</Tag>}
            </div>

            {/* Contact channels */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              {d.org && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {d.org.name ?? "Company"}
                </span>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:underline" style={{ color: "var(--color-text-primary)" }}>
                  <Phone className="h-3.5 w-3.5" />
                  {c.pretty_phone ?? c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:underline" style={{ color: "var(--color-text-primary)" }}>
                  <Mail className="h-3.5 w-3.5" />
                  {c.email}
                </a>
              )}
              {c.ig_handle && (
                <span className="inline-flex items-center gap-1.5">
                  <AtSign className="h-3.5 w-3.5" />
                  {c.ig_handle}
                </span>
              )}
            </div>
          </div>

          {/* Ownership badge */}
          <div
            className="inline-flex items-center gap-2 rounded-[10px] border px-3 py-2"
            style={{
              background: d.owner ? "var(--color-info-bg)" : "var(--color-warning-bg)",
              borderColor: d.owner ? "var(--color-info-border)" : "var(--color-warning-border)",
            }}
          >
            <User2 className="h-4 w-4" style={{ color: d.owner ? "var(--color-info-text-deep)" : "var(--color-warning-text-deep)" }} />
            <div className="leading-tight">
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Owner</div>
              <div className="text-[13px] font-semibold" style={{ color: d.owner ? "var(--color-info-text-deep)" : "var(--color-warning-text-deep)" }}>
                {d.owner?.name ?? "Unclaimed"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI brief ──────────────────────────────────────────────────────── */}
      <AiBrief brief={d.brief} />

      {/* ── Customer history snapshot: new vs returning + lifetime spend ────── */}
      <CustomerHistory history={d.history} contact={c} />

      {/* ── Lifecycle: where each deal sits, at a glance ────────────────────── */}
      <LifecycleStrips deals={d.deals} />

      {/* ── Body: history (left) + actions (right) ───────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* LEFT — full history */}
        <div className="space-y-5 min-w-0">
          <Section title="Deals" count={d.deals.length} icon={Handshake}>
            {d.deals.length === 0 ? (
              <Empty>No deals yet.</Empty>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {d.deals.map((dl) => (
                  <li key={dl.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium" style={{ color: "var(--color-text-primary)" }}>{dl.title ?? "Deal"}</div>
                      <div className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                        {dl.owner_name ? `${dl.owner_name} · ` : ""}{fmtDate(dl.created_at)}{dl.in_hands_date ? ` · in-hands ${fmtDate(dl.in_hands_date)}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {dl.stage && <Tag tone="neutral">{dl.stage}</Tag>}
                      <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{money(dl.value_cents)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {(d.quotes.length > 0 || d.orders.length > 0) && (
            <div className="grid gap-5 sm:grid-cols-2">
              {d.quotes.length > 0 && (
                <Section title="Quotes" count={d.quotes.length} icon={FileText}>
                  <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {d.quotes.map((q) => (
                      <li key={q.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>v{q.version ?? 1} · {fmtDate(q.created_at)}</span>
                        <span className="flex items-center gap-2">
                          {q.status && <Tag tone="neutral">{q.status}</Tag>}
                          <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{money(q.total_cents)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {d.orders.length > 0 && (
                <Section title="Orders" count={d.orders.length} icon={Package}>
                  <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {d.orders.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{o.reference_code ?? o.deal_title ?? "Order"}</div>
                          <div className="truncate text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                            {o.deal_title ?? "—"}{o.due_date ? ` · due ${fmtDate(o.due_date)}` : ""}{o.created_at ? ` · ${fmtDate(o.created_at)}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {o.status && <Tag tone="neutral">{o.status}</Tag>}
                          {o.amount_cents > 0 && <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{money(o.amount_cents)}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}

          {/* Communications timeline — the core "see the customer's data fully" */}
          <Section title="Communications" count={d.timeline.length} icon={MessageSquare}>
            {d.timeline.length === 0 ? (
              <Empty>No calls, emails, or messages logged yet.</Empty>
            ) : (
              <div className="max-h-[520px] overflow-y-auto pr-1">
                <ol className="relative space-y-0">
                  {d.timeline.map((t, i) => {
                    const meta = channelMeta(t.channel);
                    const Icon = meta.icon;
                    const inbound = t.direction === "inbound";
                    return (
                      <li key={t.id} className="flex gap-3 py-2.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-border)" }}>
                        <div
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[12.5px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{meta.label}</span>
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                background: inbound ? "var(--color-success-bg)" : "var(--color-info-bg)",
                                color: inbound ? "var(--color-success)" : "var(--color-info-text-deep)",
                              }}
                            >
                              {inbound ? <ArrowDownLeft className="h-2.5 w-2.5" /> : <ArrowUpRight className="h-2.5 w-2.5" />}
                              {t.direction}
                            </span>
                            <span className="ml-auto shrink-0 text-[11.5px]" style={{ color: "var(--color-text-muted)" }}>{fmtDateTime(t.received_at)}</span>
                          </div>
                          {t.subject && <div className="mt-0.5 truncate text-[12.5px] font-medium" style={{ color: "var(--color-text-primary)" }}>{t.subject}</div>}
                          <p className="mt-0.5 text-[12.5px] leading-[1.5]" style={{ color: "var(--color-text-muted)" }}>
                            {t.snippet || <span className="italic">No content</span>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </Section>

          {c.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-wrap text-[13px] leading-[1.55]" style={{ color: "var(--color-text-secondary, var(--color-text-primary))" }}>{c.notes}</p>
            </Section>
          )}
        </div>

        {/* RIGHT — actions */}
        <div className="space-y-5">
          <ActionPanel
            contactId={id}
            reps={d.reps}
            owner={d.owner}
            onToast={setToast}
            onChanged={load}
          />
          <div className="rounded-[14px] border p-4" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>At a glance</div>
            <QuickFact label="Open deals" value={String(d.deals.filter((x) => x.stage && !["won", "lost"].includes(x.stage)).length)} />
            <QuickFact label="Open tasks" value={String(d.open_task_count)} />
            <QuickFact label="Communications" value={String(d.timeline.length)} />
            <QuickFact label="First seen" value={fmtDate(c.created_at)} />
            <QuickFact label="Last activity" value={fmtDate(c.last_activity_at)} last />
          </div>
        </div>
      </div>

      {toast && <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

// ── Actions: assign owner + create follow-up task ─────────────────────────────
function ActionPanel({
  contactId,
  reps,
  owner,
  onToast,
  onChanged,
}: {
  contactId: string;
  reps: Rep[];
  owner: { id: string; name: string | null } | null;
  onToast: (t: { message: string; type: "success" | "error" }) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [taskRep, setTaskRep] = useState<string>(owner?.id ?? "");
  const [ownerRep, setOwnerRep] = useState<string>(owner?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  async function createTask() {
    setCreating(true);
    try {
      const res = await fetch(`/api/contact/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ owner_id: taskRep || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        onToast({ message: `Follow-up task created${json.task?.owner_name ? ` for ${json.task.owner_name}` : ""} (due in 24h).`, type: "success" });
        await onChanged();
      } else {
        onToast({ message: json.error ?? "Could not create task.", type: "error" });
      }
    } catch {
      onToast({ message: "Could not create task.", type: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function assignOwner() {
    setAssigning(true);
    try {
      const res = await fetch(`/api/contact/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ owner_id: ownerRep || null }),
      });
      const json = await res.json();
      if (res.ok) {
        onToast({ message: json.owner?.name ? `Assigned to ${json.owner.name}.` : "Contact unclaimed.", type: "success" });
        await onChanged();
      } else {
        onToast({ message: json.error ?? "Could not assign owner.", type: "error" });
      }
    } catch {
      onToast({ message: "Could not assign owner.", type: "error" });
    } finally {
      setAssigning(false);
    }
  }

  const selectStyle = { background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" };

  return (
    <div className="rounded-[14px] border p-4" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
      <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Actions</div>

      {/* Create follow-up task */}
      <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>Follow-up task — assign to</label>
      <select value={taskRep} onChange={(e) => setTaskRep(e.target.value)} className="mb-2 h-9 w-full rounded-[8px] border px-2 text-[13px] outline-none" style={selectStyle}>
        <option value="">Auto (owner / least busy)</option>
        {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <button
        onClick={createTask}
        disabled={creating}
        className="mb-4 inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
      >
        <Plus className="h-4 w-4" />
        {creating ? "Creating…" : "Create follow-up task"}
      </button>

      {/* Assign owner */}
      <div className="border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>Owner</label>
        <select value={ownerRep} onChange={(e) => setOwnerRep(e.target.value)} className="mb-2 h-9 w-full rounded-[8px] border px-2 text-[13px] outline-none" style={selectStyle}>
          <option value="">Unclaimed</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button
          onClick={assignOwner}
          disabled={assigning || ownerRep === (owner?.id ?? "")}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-all active:scale-[0.98] disabled:opacity-40"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-primary)", background: "var(--color-surface)" }}
        >
          <UserPlus className="h-4 w-4" />
          {assigning ? "Saving…" : ownerRep && ownerRep !== (owner?.id ?? "") ? "Assign owner" : ownerRep ? "Owner" : "Unclaim"}
        </button>
      </div>
    </div>
  );
}

// ── AI brief card ─────────────────────────────────────────────────────────────
function AiBrief({ brief }: { brief: { stance: string; bullets: string[] } }) {
  const empty = !brief || brief.bullets.length === 0;
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: "var(--color-info-bg)", borderColor: "var(--color-info-border)" }}
    >
      <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: "var(--color-info-text-deep)" }}>
        <Sparkles className="h-4 w-4" />
        AI brief{!empty && brief.stance ? ` · ${brief.stance}` : ""}
      </div>
      {empty ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--color-info-text-deep)" }}>
          Not enough history yet to summarize this contact. Log a call, email, or deal and it will fill in.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {brief.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-[1.5]" style={{ color: "var(--color-info-text-deep)" }}>
              <span aria-hidden>•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Customer-type badge (New vs Returning) ────────────────────────────────────
function CustomerTypeBadge({ returning }: { returning: boolean }) {
  if (returning) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid var(--color-success-border, var(--color-border))" }}
      >
        <Repeat className="h-3 w-3" />
        Returning customer
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)", border: "1px solid var(--color-neutral-border)" }}
    >
      New
    </span>
  );
}

// ── Customer history snapshot ──────────────────────────────────────────────────
// One glance answers "new or old customer, and how much have they spent?" —
// lifetime spend is featured for returning customers, then a compact stats row.
function CustomerHistory({
  history,
  contact,
}: {
  history: History;
  contact: Data["contact"];
}) {
  return (
    <div className="rounded-[14px] border p-4" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{
              background: history.is_returning ? "var(--color-success-bg)" : "var(--color-neutral-bg)",
              color: history.is_returning ? "var(--color-success)" : "var(--color-neutral-text)",
            }}
          >
            {history.is_returning ? <Repeat className="h-5 w-5" /> : <DollarSign className="h-5 w-5" />}
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              {history.is_returning ? "Lifetime spend" : "Customer"}
            </div>
            <div className="text-[22px] font-bold" style={{ color: "var(--color-text-primary)" }}>
              {history.is_returning ? money(history.lifetime_spend_cents) : "New customer"}
            </div>
          </div>
        </div>

        {/* Compact stats row */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Stat label="Type" value={history.is_returning ? "Returning" : "New"} />
          <Stat label="Lifetime spend" value={money(history.lifetime_spend_cents)} />
          <Stat label="Orders" value={String(history.order_count)} />
          <Stat label="First seen" value={fmtDate(contact.created_at)} />
          <Stat label="Last activity" value={fmtDate(contact.last_activity_at)} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      <div className="text-[13.5px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{value}</div>
    </div>
  );
}

// ── Lifecycle strips — one horizontal progression per deal ─────────────────────
function LifecycleStrips({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return null;
  return (
    <div className="rounded-[14px] border p-4" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
      <div className="mb-3 flex items-center gap-2">
        <Handshake className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} />
        <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Lifecycle</span>
        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
          {deals.length}
        </span>
      </div>
      <div className="space-y-4">
        {deals.map((dl) => (
          <DealLifecycle key={dl.id} deal={dl} />
        ))}
      </div>
    </div>
  );
}

function DealLifecycle({ deal }: { deal: Deal }) {
  const { index: current, lost } = stageProgress(deal.stage);
  return (
    <div className="rounded-[10px] border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      {/* Deal title + value + owner */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium" style={{ color: "var(--color-text-primary)" }}>{deal.title ?? "Deal"}</div>
          <div className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {deal.owner_name ? `${deal.owner_name} · ` : ""}{fmtDate(deal.created_at)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {lost && <Tag tone="warning">Lost</Tag>}
          <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{money(deal.value_cents)}</span>
        </div>
      </div>

      {/* Stage progression */}
      <div className="flex items-center">
        {LIFECYCLE_STAGES.map((label, i) => {
          const isDone = !lost && i < current;
          const isCurrent = !lost && i === current;
          const isWonFinal = !lost && current >= LIFECYCLE_STAGES.length - 1 && i === LIFECYCLE_STAGES.length - 1;
          const done = isDone || isWonFinal;

          let dotBg = "var(--color-surface)";
          let dotColor = "var(--color-text-muted)";
          let dotBorder = "var(--color-border)";
          let labelColor = "var(--color-text-muted)";
          if (lost) {
            // A lost deal: greyed strip, red end-cap on the last node.
            dotColor = "var(--color-text-muted)";
          } else if (done) {
            dotBg = "var(--color-success-bg)";
            dotColor = "var(--color-success)";
            dotBorder = "var(--color-success-border, var(--color-success))";
            labelColor = "var(--color-text-secondary, var(--color-text-primary))";
          } else if (isCurrent) {
            dotBg = "var(--color-info-bg)";
            dotColor = "var(--color-info-text-deep)";
            dotBorder = "var(--color-info-border)";
            labelColor = "var(--color-info-text-deep)";
          }

          return (
            <div key={label} className="flex min-w-0 flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{ background: dotBg, color: dotColor, border: `1.5px solid ${dotBorder}` }}
                >
                  {lost && i === LIFECYCLE_STAGES.length - 1 ? (
                    <XCircle className="h-3.5 w-3.5" style={{ color: "var(--color-danger)" }} />
                  ) : done ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className={isCurrent ? "h-3 w-3 fill-current" : "h-3 w-3"} />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium leading-none"
                  style={{ color: isCurrent ? labelColor : lost ? "var(--color-text-muted)" : labelColor, fontWeight: isCurrent ? 700 : 500 }}
                >
                  {label}
                </span>
              </div>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <div className="mx-1 h-[2px] flex-1" style={{ background: done && !lost ? "var(--color-success)" : "var(--color-border)" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Small building blocks (match the CRM feature pages) ───────────────────────
function Section({ title, count, icon: Icon, children }: { title: string; count?: number; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border p-4" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
      <div className="mb-2 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} />}
        <span className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{title}</span>
        {typeof count === "number" && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold" style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>{children}</p>;
}

function Tag({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warning" | "neutral" }) {
  const map = {
    info: { bg: "var(--color-info-bg)", color: "var(--color-info-text-deep)", border: "var(--color-info-border)" },
    warning: { bg: "var(--color-warning-bg)", color: "var(--color-warning-text-deep)", border: "var(--color-warning-border)" },
    neutral: { bg: "var(--color-neutral-bg)", color: "var(--color-neutral-text)", border: "var(--color-neutral-border)" },
  }[tone];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize" style={{ background: map.bg, color: map.color, border: `1px solid ${map.border}` }}>
      {children}
    </span>
  );
}

function QuickFact({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: last ? "none" : "1px solid var(--color-border)" }}>
      <span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}
