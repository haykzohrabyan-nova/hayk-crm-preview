"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Clock, ExternalLink, UserCheck, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";
import { formatQuoteListDueNow, getQuoteListDueNowAmount } from "@/lib/utils/quote-list-due-now";
import { quoteDetailPath, ticketPathSegment } from "@/lib/utils/reference-codes";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteTicket {
  id: string;
  ticket_status: string;
  title: string | null;
  reference_code: string | null;
  quote_channel: string | null;
  quote_final_total: number | null;
  ticket_payment_strategy: "full" | "partial" | "net" | null;
  ticket_deposit_type: "percent" | "fixed" | null;
  ticket_deposit_value: number | null;
  prepayment_type: string | null;
  prepayment_value: string | null;
  quote_reminder_date: string | null;
  created_at: string;
  updated_at: string;
  created_by_name?: string; // injected by API for routed tickets
  routed_by_id: string | null;
  customer: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  created_by: { id: string; full_name: string | null } | null;
}

type Tab = "all" | "draft" | "sent" | "approved" | "routed";

const BASE_TABS: { id: Tab; label: string; status?: string }[] = [
  { id: "all",      label: "All" },
  { id: "draft",    label: "Draft",    status: "draft" },
  { id: "sent",     label: "Sent",     status: "sent" },
  { id: "approved", label: "Won",      status: "approved" },
];

// Routed tab appended for sales/admin only
const ROUTED_TAB: { id: Tab; label: string; status: string } = {
  id: "routed", label: "Routed to Sales", status: "routed",
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:     { bg: "var(--color-neutral-bg)",  text: "var(--color-neutral-text)", label: "Draft" },
  sent:      { bg: "var(--color-info-bg)",     text: "var(--color-info-text)",    label: "Sent" },
  approved:  { bg: "var(--color-success-bg)",  text: "var(--color-success)",      label: "Approved" },
  cancelled: { bg: "var(--color-danger-bg)",   text: "var(--color-danger)",       label: "Cancelled" },
  routed:    { bg: "var(--color-warning-bg)",  text: "var(--color-warning)",      label: "Routed" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

function displayName(q: QuoteTicket): string {
  const c = q.customer;
  return [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "—";
}

// Parse a YYYY-MM-DD date string as local midnight (not UTC midnight)
function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return parseLocalDate(dateStr) < new Date();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // ─── Fetch current user role ─────────────────────────────────────────────

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
  }, []);

  const canSeeRouted = userRole === "sales" || userRole === "admin" || userRole === "sdr";
  const TABS = canSeeRouted ? [...BASE_TABS, ROUTED_TAB] : BASE_TABS;

  // ─── Fetch counts ────────────────────────────────────────────────────────

  const fetchCounts = useCallback(() => {
    fetch("/api/tickets/counts")
      .then((r) => r.json())
      .then((d) => {
        if (d.counts) {
          // Active quote-stage only — exclude order / in_production / completed (those live on other pages)
          setTabCounts({
            all:      d.counts.drafts + d.counts.sent + d.counts.approved,
            draft:    d.counts.drafts,
            sent:     d.counts.sent,
            approved: d.counts.approved,
            routed:   d.counts.routed ?? 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  // ─── Fetch quotes ────────────────────────────────────────────────────────

  const fetchQuotes = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch("/api/tickets?kind=quote")
      .then((r) => r.json())
      .then((d) => { if (d.tickets) setQuotes(d.tickets); })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => {
    fetchQuotes();
    fetchCounts();
  }, [fetchQuotes, fetchCounts]);

  // Realtime: refresh on ticket changes (same-tab window events)
  useEffect(() => {
    function onChanged() { fetchQuotes(true); fetchCounts(); }
    window.addEventListener("bazaar:tickets-changed", onChanged);
    window.addEventListener("bazaar:refresh-counts",  onChanged);
    return () => {
      window.removeEventListener("bazaar:tickets-changed", onChanged);
      window.removeEventListener("bazaar:refresh-counts",  onChanged);
    };
  }, [fetchQuotes, fetchCounts]);

  // ─── Claim action ────────────────────────────────────────────────────────

  async function handleClaim(q: QuoteTicket) {
    if (!userId) return;
    setClaimingId(q.id);
    const pathSeg = ticketPathSegment(q);
    try {
      const res = await fetch(`/api/tickets/${pathSeg}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_status: "draft", claim_ownership: true }),
      });
      if (res.ok) {
        window.dispatchEvent(new Event("bazaar:refresh-counts"));
        router.push(quoteDetailPath(q));
      }
    } finally {
      setClaimingId(null);
    }
  }

  // ─── Filter ──────────────────────────────────────────────────────────────

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  const filtered = quotes.filter((q) => {
    // Orders / production have moved off Quotes — never show here
    if (q.ticket_status === "order" || q.ticket_status === "in_production" || q.ticket_status === "completed") return false;
    // Routed tickets only appear in the dedicated "routed" tab
    if (q.ticket_status === "routed" && tab !== "routed") return false;
    if (activeTab.status && q.ticket_status !== activeTab.status) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = displayName(q).toLowerCase();
      const company = (q.customer?.company ?? "").toLowerCase();
      const title = (q.title ?? "").toLowerCase();
      const ref = (q.reference_code ?? "").toLowerCase();
      const shortId = q.id.slice(0, 8).toLowerCase();
      if (!name.includes(s) && !company.includes(s) && !title.includes(s) && !ref.includes(s) && !shortId.includes(s)) return false;
    }
    return true;
  });

  // ─── Render ──────────────────────────────────────────────────────────────

  const isRoutedTab = tab === "routed";

  return (
    <div className="space-y-5" style={{ color: "var(--color-text-primary)" }}>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Quoted Requests
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            All formal quotes sent or drafted for clients
          </p>
        </div>
        <button
          onClick={() => router.push("/quotes/new")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
        >
          <Plus size={15} /> New Quote
        </button>
      </div>

      {/* Routed tab banner */}
      {isRoutedTab && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
          style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
          <p style={{ color: "var(--color-warning-text-deep)" }}>
            {userRole === "sdr"
              ? "These quotes exceeded the high-value threshold and were handed off to Sales. You can view them in read-only mode."
              : "These quotes were created by SDR users but exceed the high-value threshold. Claim one to take ownership and complete it."}
          </p>
        </div>
      )}

      {/* Tabs + search row */}
      <div className="flex items-end justify-between border-b mb-0" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex">
          {TABS.map((t) => {
            const count = tabCounts[t.id] ?? 0;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2.5 text-sm relative transition-colors"
                style={{
                  color: tab === t.id ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
                  fontWeight: tab === t.id ? 500 : 400,
                }}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                    style={{
                      background: tab === t.id
                        ? t.id === "routed" ? "var(--color-warning-bg)" : "var(--color-badge-bg)"
                        : "color-mix(in srgb, var(--color-badge-bg) 70%, transparent)",
                      color: t.id === "routed" ? "var(--color-warning)" : "var(--color-badge-text)",
                      border: t.id === "routed" ? "1px solid var(--color-warning-border)" : "none",
                    }}
                  >
                    {count}
                  </span>
                )}
                {tab === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ background: "var(--color-tab-underline)" }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotes…"
            className="pl-8 pr-3 py-1.5 text-sm rounded-md border outline-none w-52"
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-b-xl border border-t-0 overflow-hidden"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {loading ? (
          <TableSkeleton cols={isRoutedTab ? 8 : 9} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {search
                ? "No quotes match your search."
                : isRoutedTab
                ? "No routed quotes — all clear!"
                : "No quotes yet."}
            </p>
          </div>
        ) : isRoutedTab ? (
          /* ── Routed tab: dedicated layout ────────────────────────────── */
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Contact", "Quote #", "Title", "Total", "Due Now", "Routed By", "Date", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, idx) => (
                <tr
                  key={q.id}
                  className="transition-colors"
                  style={{ background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)")}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(q)}</p>
                    {q.customer?.company && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{q.customer.company}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {q.reference_code ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm truncate max-w-[200px]" style={{ color: "var(--color-text-primary)" }}>
                      {q.title ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold" style={{ color: "var(--color-warning)" }}>
                      {q.quote_final_total != null ? formatCurrency(q.quote_final_total) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-sm font-medium"
                      style={{
                        color: getQuoteListDueNowAmount(q) != null
                          ? "var(--color-warning)"
                          : "var(--color-text-muted)",
                      }}
                    >
                      {formatQuoteListDueNow(q)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                      {q.created_by_name ?? "SDR"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {relativeTime(q.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {userRole === "sdr" ? (
                      <button
                        onClick={() => router.push(quoteDetailPath(q))}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                      >
                        <ExternalLink size={12} />
                        View
                      </button>
                    ) : (
                      <button
                        disabled={claimingId === q.id}
                        onClick={() => handleClaim(q)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                      >
                        <UserCheck size={12} />
                        {claimingId === q.id ? "Claiming…" : "Claim"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /* ── Standard tabs ───────────────────────────────────────────── */
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Contact", "Quote #", "Title", "Channel", "Total", "Due Now", "Status", "Follow-up", "Created"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, idx) => {
                const statusStyle = STATUS_STYLE[q.ticket_status] ?? STATUS_STYLE.draft;
                const overdue = isOverdue(q.quote_reminder_date);
                return (
                  <tr
                    key={q.id}
                    className="cursor-pointer transition-colors"
                    style={{
                      background: idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)")}
                    onClick={() => router.push(quoteDetailPath(q))}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{displayName(q)}</p>
                      {q.customer?.company && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{q.customer.company}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {q.reference_code ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm truncate max-w-[200px]" style={{ color: "var(--color-text-primary)" }}>
                        {q.title ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                        {q.quote_channel ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {q.quote_final_total != null ? formatCurrency(q.quote_final_total) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-sm font-medium"
                        style={{
                          color: getQuoteListDueNowAmount(q) != null
                            ? "var(--color-warning)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        {formatQuoteListDueNow(q)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: statusStyle.bg, color: statusStyle.text }}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {q.quote_reminder_date ? (
                        <span
                          className="flex items-center gap-1 text-xs font-medium"
                          style={{ color: overdue ? "var(--color-danger)" : "var(--color-text-muted)" }}
                        >
                          <Clock size={12} />
                          {new Date(q.quote_reminder_date + "T00:00:00").toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {relativeTime(q.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(quoteDetailPath(q)); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-opacity hover:opacity-70"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", background: "var(--color-bg)" }}
                      >
                        <ExternalLink size={11} /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs mt-3 text-right" style={{ color: "var(--color-text-muted)" }}>
          {filtered.length} quote{filtered.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          {[...Array(cols)].map((__, j) => (
            <div key={j} className="h-4 rounded flex-1" style={{ background: "var(--color-border)" }} />
          ))}
        </div>
      ))}
    </div>
  );
}
