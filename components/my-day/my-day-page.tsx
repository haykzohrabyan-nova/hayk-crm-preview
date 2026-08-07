"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Briefcase,
  Mail,
  PhoneMissed,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { REPS, repName } from "@/lib/azat/reps";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatTimeTodayOrDateNumeric } from "@/lib/utils/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────
type MyDay = {
  owner: string;
  owner_name: string | null;
  counts: { tasks: number; deals: number; emails: number; missed_calls: number; messages: number };
  previews: {
    tasks: { id: string; label: string | null; kind: string | null; due_at: string | null; contact_id: string | null; deal_id: string | null; who: string | null; company_name: string | null; what: string | null; source_hint: string | null }[];
    deals: { id: string; title: string | null; stage: string | null; value_cents: number | null; last_activity_at: string | null; who: string | null; company_name: string | null }[];
    emails: { id: string; subject: string | null; received_at: string; contact_id: string | null; contact_name: string | null }[];
    missed_calls: { id: string; received_at: string; contact_id: string | null; caller: string; reason: string | null }[];
    messages: { id: string; body: string | null; received_at: string; contact_id: string | null; contact_name: string | null }[];
  };
};

// Human labels for the raw task.kind enum.
const KIND_LABELS: Record<string, string> = {
  followup: "Follow up",
  first_touch: "First touch",
  ask1: "Follow up",
  ask2: "Follow up",
  decide: "Decision",
  parked_return: "Re-engage",
  callback: "Call back",
  quote: "Quote",
  artwork: "Artwork",
};
function kindLabel(kind: string | null): string | null {
  if (!kind) return null;
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
function isPast(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

const TILES: { key: keyof MyDay["counts"]; label: string; icon: LucideIcon; accent: string; bg: string }[] = [
  { key: "tasks", label: "Tasks", icon: CheckSquare, accent: "var(--color-in-progress-text)", bg: "var(--color-in-progress-bg)" },
  { key: "deals", label: "Deals", icon: Briefcase, accent: "var(--color-accent-dark)", bg: "var(--color-warning-bg)" },
  { key: "emails", label: "Emails", icon: Mail, accent: "var(--color-info-text)", bg: "var(--color-info-bg)" },
  { key: "missed_calls", label: "Missed calls", icon: PhoneMissed, accent: "var(--color-danger)", bg: "var(--color-danger-bg)" },
  { key: "messages", label: "Messages", icon: MessageSquare, accent: "var(--color-success)", bg: "var(--color-success-bg)" },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function MyDayPage() {
  const [owner, setOwner] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selfName, setSelfName] = useState<string | null>(null);
  const [data, setData] = useState<MyDay | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve current user → default owner + admin flag.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: u }) => {
      const uid = u.user?.id ?? null;
      if (uid) {
        const { data: profile } = await supabase.from("user_profiles").select("full_name, roles(name)").eq("id", uid).single();
        const roleName = (profile?.roles as unknown as { name: string } | null)?.name;
        setIsAdmin(roleName === "admin");
        setSelfName((profile?.full_name as string | null) ?? repName(uid));
      }
      // Default to the current user if they are a rep, else the first rep in the pool.
      setOwner(uid && REPS.some((r) => r.id === uid) ? uid : REPS[0].id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/my-day?owner=${encodeURIComponent(owner)}`, { credentials: "include" });
      const d = await res.json();
      setData(res.ok ? d : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => {
    void load();
  }, [load]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();

  const displayName = data?.owner_name ?? (owner ? repName(owner) : null) ?? selfName ?? "there";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {greeting}, {displayName}
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Here&apos;s what&apos;s waiting for you today.
          </p>
        </div>

        {isAdmin ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
              Viewing
            </span>
            <Select value={owner ?? undefined} onValueChange={(v) => setOwner(v)}>
              <SelectTrigger size="sm" className="h-8 min-w-[150px] text-[13px]"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-primary)" }}>
                <SelectValue placeholder="Select rep">
                  {owner ? repName(owner) ?? "Select rep" : "Select rep"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REPS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          const count = data?.counts?.[tile.key] ?? 0;
          return (
            <div
              key={tile.key}
              className="flex flex-col gap-3 rounded-2xl border p-4"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: tile.bg, color: tile.accent }}>
                <Icon className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} />
              </div>
              <div>
                <p className="text-[30px] font-bold leading-none tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                  {loading ? "—" : count}
                </p>
                <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
                  {tile.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <PreviewCard title="Tasks" icon={CheckSquare} count={data?.counts.tasks ?? 0} loading={loading} empty="No open tasks">
          {data?.previews.tasks.map((t) => {
            const overdue = isPast(t.due_at);
            const action = [kindLabel(t.kind), t.what].filter(Boolean).join(" · ") || t.label || null;
            return (
              <PreviewRow
                key={t.id}
                who={t.who ?? "Unassigned contact"}
                what={action}
                sub={t.company_name}
                meta={t.due_at ? (overdue ? "Overdue" : formatTimeTodayOrDateNumeric(t.due_at)) : "No due date"}
                metaDanger={overdue}
                href={t.contact_id ? `/contact/${t.contact_id}` : "/tasks"}
              />
            );
          })}
        </PreviewCard>

        <PreviewCard title="Deals" icon={Briefcase} count={data?.counts.deals ?? 0} loading={loading} empty="No open deals">
          {data?.previews.deals.map((d) => (
            <PreviewRow
              key={d.id}
              who={d.who ?? d.title ?? "Untitled deal"}
              what={d.who ? d.title : null}
              sub={d.company_name}
              meta={[d.stage, d.value_cents ? formatCurrency(d.value_cents / 100) : null].filter(Boolean).join(" · ") || undefined}
              href={`/sales?search=${encodeURIComponent(d.title ?? d.who ?? "")}`}
            />
          ))}
        </PreviewCard>

        <PreviewCard title="Emails" icon={Mail} count={data?.counts.emails ?? 0} loading={loading} empty="No recent emails">
          {data?.previews.emails.map((e) => (
            <PreviewRow
              key={e.id}
              who={e.contact_name || "Unknown sender"}
              what={e.subject || "(no subject)"}
              meta={formatTimeTodayOrDateNumeric(e.received_at)}
              href={e.contact_id ? `/contact/${e.contact_id}` : e.contact_name ? `/crm?search=${encodeURIComponent(e.contact_name)}` : undefined}
            />
          ))}
        </PreviewCard>

        <PreviewCard title="Missed calls" icon={PhoneMissed} count={data?.counts.missed_calls ?? 0} loading={loading} empty="No missed calls">
          {data?.previews.missed_calls.map((c) => (
            <PreviewRow
              key={c.id}
              who={c.caller}
              what={c.reason || "Missed call — needs a callback"}
              meta={formatTimeTodayOrDateNumeric(c.received_at)}
              href={c.contact_id ? `/contact/${c.contact_id}` : "/missed-calls"}
            />
          ))}
        </PreviewCard>

        <PreviewCard title="Messages" icon={MessageSquare} count={data?.counts.messages ?? 0} loading={loading} empty="No recent messages">
          {data?.previews.messages.map((m) => (
            <PreviewRow
              key={m.id}
              who={m.contact_name || "Unknown sender"}
              what={m.body ? m.body.slice(0, 90) : "(no content)"}
              meta={formatTimeTodayOrDateNumeric(m.received_at)}
              href={m.contact_id ? `/contact/${m.contact_id}` : m.contact_name ? `/crm?search=${encodeURIComponent(m.contact_name)}` : undefined}
            />
          ))}
        </PreviewCard>
      </div>
    </div>
  );
}

// ── Preview card ────────────────────────────────────────────────────────────
function PreviewCard({
  title,
  icon: Icon,
  count,
  loading,
  empty,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  loading: boolean;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.filter(Boolean).length > 0 : !!children;
  return (
    <div className="flex flex-col rounded-2xl border" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
        <Icon className="h-4 w-4" style={{ color: "var(--color-text-muted)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {title}
        </span>
        <span
          className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
          style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
        >
          {count}
        </span>
      </div>
      {/* Scroll region — list scrolls INSIDE the card; header/count stay fixed above. */}
      <div className="flex max-h-[340px] flex-col overflow-y-auto p-1.5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="m-1 h-11 animate-pulse rounded-lg" style={{ background: "var(--color-border)" }} />
          ))
        ) : hasChildren ? (
          children
        ) : (
          <p className="px-2.5 py-6 text-center text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {empty}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A single glanceable row: WHO it's about (bold) + WHAT (muted) on the left,
 * a right-aligned meta chip (time / due, red when overdue). Nothing renders
 * blank — callers pass a non-empty `who`.
 */
function PreviewRow({
  who,
  what,
  sub,
  meta,
  metaDanger,
  href,
}: {
  who: string;
  what?: string | null;
  sub?: string | null;
  meta?: string;
  metaDanger?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className="flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {who}
        </span>
        {what && (
          <span className="mt-0.5 block truncate text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {what}
          </span>
        )}
        {sub && (
          <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--color-text-muted)" }}>
            {sub}
          </span>
        )}
      </div>
      {meta && (
        <span
          className="shrink-0 whitespace-nowrap text-[11px] font-medium"
          style={{ color: metaDanger ? "var(--color-danger)" : "var(--color-text-muted)" }}
        >
          {meta}
        </span>
      )}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
