"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, RefreshCw, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/utils/phone";

// ─── Types ───────────────────────────────────────────────────────────────────

type CustomerStatus = "new" | "known" | "returning";
type HeatTag = "hot" | "warm" | "cold" | null;
type StatusFilter = "all" | CustomerStatus;
type HeatFilter = "all" | "hot" | "warm" | "cold";

interface CrmCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  heat_tag: HeatTag;
  lead_count: number;
  last_activity: string;
  customer_status: CustomerStatus;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function fullName(c: CrmCustomer): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<CustomerStatus, { bg: string; text: string; label: string }> = {
  new: { bg: "var(--color-neutral-bg)", text: "var(--color-neutral-text)", label: "New Contact" },
  known: { bg: "var(--color-info-bg)", text: "var(--color-info-text)", label: "Known Customer" },
  returning: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text-deep)", label: "Returning" },
};

function StatusBadge({ status }: { status: CustomerStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ─── Heat Badge ──────────────────────────────────────────────────────────────

const HEAT_STYLE: Record<string, { bg: string; text: string }> = {
  hot: { bg: "var(--color-danger-bg)", text: "var(--color-danger)" },
  warm: { bg: "var(--color-warning-bg)", text: "var(--color-warning)" },
  cold: { bg: "var(--color-info-bg)", text: "var(--color-info-text)" },
};

function HeatBadge({ tag }: { tag: HeatTag }) {
  if (!tag) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  const s = HEAT_STYLE[tag];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ background: s.bg, color: s.text }}
    >
      {tag}
    </span>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function ToastBanner({ message, type, onDismiss }: { message: string; type: "success" | "error"; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex min-w-[260px] items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        borderLeftWidth: 4,
        borderLeftColor: type === "success" ? "var(--color-success)" : "var(--color-danger)",
        color: "var(--color-text-primary)",
      }}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} style={{ color: "var(--color-text-muted)" }}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Table Skeleton ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr
          key={i}
          style={{
            background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-row-alt)",
            borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
          }}
        >
          {Array.from({ length: 8 }).map((_, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-3.5 animate-pulse rounded" style={{ background: "var(--color-border)", width: j === 0 ? "55%" : "75%" }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CRMPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [heatFilter, setHeatFilter] = useState<HeatFilter>("all");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/customers");
    const data = await res.json();
    setCustomers(data.customers ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Re-fetch silently whenever any lead changes (e.g. SDR routes a lead →
  // that customer becomes visible in the CRM for the first time).
  useEffect(() => {
    window.addEventListener("bazaar:leads-changed", fetchCustomers);
    return () => window.removeEventListener("bazaar:leads-changed", fetchCustomers);
  }, [fetchCustomers]);

  // ── Client-side filters ───────────────────────────────────────────────────

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.company?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || c.customer_status === statusFilter;
    const matchesHeat = heatFilter === "all" || c.heat_tag === heatFilter;
    return matchesSearch && matchesStatus && matchesHeat;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "new", label: "New Contact" },
    { id: "known", label: "Known Customer" },
  ];

  const HEAT_FILTERS: { id: HeatFilter; label: string }[] = [
    { id: "hot", label: "Hot" },
    { id: "warm", label: "Warm" },
    { id: "cold", label: "Cold" },
  ];

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          CRM
        </h1>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchCustomers} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative" style={{ minWidth: 260 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className="rounded-full px-3 py-1 text-[12px] font-medium transition-all"
              style={{
                background: statusFilter === f.id ? "var(--color-btn-verify-bg)" : "var(--color-surface)",
                color: statusFilter === f.id ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
                border: "1px solid",
                borderColor: statusFilter === f.id ? "transparent" : "var(--color-border)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-5 w-px" style={{ background: "var(--color-border)" }} />

        {/* Heat filter pills — click to select, click again to deselect */}
        <div className="flex gap-1">
          {HEAT_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setHeatFilter((prev) => prev === f.id ? "all" : f.id)}
              className="rounded-full px-3 py-1 text-[12px] font-medium transition-all capitalize"
              style={{
                background: heatFilter === f.id ? "var(--color-btn-primary-bg)" : "var(--color-surface)",
                color: heatFilter === f.id ? "var(--color-btn-primary-text)" : "var(--color-text-muted)",
                border: "1px solid",
                borderColor: heatFilter === f.id ? "transparent" : "var(--color-border)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {!loading && (
          <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              {["Name", "Company", "Phone", "Email", "Status", "Heat", "Leads", "Last Activity", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No customers found.
                </td>
              </tr>
            ) : (
              filtered.map((c, idx) => (
                <tr
                  key={c.id}
                  className="cursor-pointer transition-colors"
                  style={{
                    background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                    borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                  onClick={() => router.push(`/crm/customers/${c.id}`)}
                >
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
                    {fullName(c)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                    {c.company || "—"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {c.phone ? formatPhone(c.phone) : "—"}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {c.email || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={c.customer_status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <HeatBadge tag={c.heat_tag} />
                  </td>
                  <td className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {c.lead_count}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {relativeTime(c.last_activity)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/crm/customers/${c.id}`); }}
                      className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                      style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="flex flex-col gap-3 lg:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[10px] border p-4 space-y-3 animate-pulse" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
              <div className="h-4 w-32 rounded" style={{ background: "var(--color-border)" }} />
              <div className="h-3 w-24 rounded" style={{ background: "var(--color-border)" }} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            No customers found.
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="rounded-[10px] border p-4 space-y-3 cursor-pointer"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
              onClick={() => router.push(`/crm/customers/${c.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{fullName(c)}</p>
                  {c.company && <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{c.company}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <HeatBadge tag={c.heat_tag} />
                  <StatusBadge status={c.customer_status} />
                </div>
              </div>
              <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                {c.phone && <div className="flex justify-between"><span>Phone</span><span className="normal-case tracking-normal">{formatPhone(c.phone)}</span></div>}
                {c.email && <div className="flex justify-between"><span>Email</span><span className="normal-case tracking-normal">{c.email}</span></div>}
                <div className="flex justify-between"><span>Leads</span><span className="normal-case tracking-normal">{c.lead_count}</span></div>
                <div className="flex justify-between"><span>Last activity</span><span className="normal-case tracking-normal">{relativeTime(c.last_activity)}</span></div>
              </div>
              <button
                className="w-full rounded-[6px] py-1.5 text-[13px] font-medium"
                style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
              >
                View Profile
              </button>
            </div>
          ))
        )}
      </div>

      {toast && (
        <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
