"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import { Search, X, FilePlus, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AddCustomerModal } from "@/components/crm/add-customer-modal";
import { ListPagination } from "@/components/ui/list-pagination";
import { formatPhone } from "@/lib/utils/phone";
import { lookupLabel } from "@/lib/utils/lookups";
import {
  readStoredListPageSize,
  writeStoredListPageSize,
  type ListPageSize,
  type PaginationMeta,
} from "@/lib/utils/pagination";

type LookupOption = { value: string; label: string };

// ─── Types ───────────────────────────────────────────────────────────────────

type CustomerStatus = "new" | "known";
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

const CRM_LINK_CLASS =
  "hover:opacity-70 transition-opacity bg-transparent border-0 p-0 cursor-pointer text-left text-inherit font-inherit";

function CompanyCell({ customer, onOpen }: { customer: CrmCustomer; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={CRM_LINK_CLASS} style={{ color: "var(--color-tab-active)" }}>
      {customer.company || "—"}
    </button>
  );
}

function PhoneCell({ phone }: { phone: string | null }) {
  if (!phone) {
    return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  }
  return (
    <a
      href={`tel:${phone}`}
      className="hover:opacity-70 transition-opacity"
      style={{ color: "var(--color-tab-active)" }}
    >
      {formatPhone(phone)}
    </a>
  );
}

function EmailCell({ email }: { email: string | null }) {
  if (!email) {
    return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  }
  return (
    <a
      href={`mailto:${email}`}
      className="hover:opacity-70 transition-opacity break-all"
      style={{ color: "var(--color-tab-active)" }}
    >
      {email}
    </a>
  );
}

import { newQuoteUrlFromCustomer } from "@/lib/utils/new-quote-from-customer";

const STATUS_STYLE: Record<CustomerStatus, { bg: string; text: string; label: string }> = {
  new: { bg: "var(--color-neutral-bg)", text: "var(--color-neutral-text)", label: "New Contact" },
  known: { bg: "var(--color-info-bg)", text: "var(--color-info-text)", label: "Known Customer" },
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
  const [pagination, setPagination] = useState<PaginationMeta>({
    limit: 25,
    offset: 0,
    total: 0,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [heatFilter, setHeatFilter] = useState<HeatFilter>("all");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<ListPageSize>(() => readStoredListPageSize());
  const [industryLookups, setIndustryLookups] = useState<LookupOption[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, statusFilter, heatFilter, pageSize]);

  const fetchPageData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (heatFilter !== "all") params.set("heat", heatFilter);
      params.set("limit", String(pageSize));
      params.set("offset", String(offset));
      const qs = params.toString();
      const res = await fetch(`/api/crm/page-data${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      if (!res.ok) {
        if (!silent) {
          setToast({ message: data.error ?? "Failed to load customers.", type: "error" });
          setCustomers([]);
        }
        return;
      }
      setCustomers(data.customers ?? []);
      if (data.pagination) setPagination(data.pagination);
    } catch {
      if (!silent) {
        setToast({ message: "Failed to load customers.", type: "error" });
        setCustomers([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [debouncedSearch, statusFilter, heatFilter, offset, pageSize]);

  useCoalescedRefresh(fetchPageData, [debouncedSearch, statusFilter, heatFilter, offset, pageSize], {
    events: ["bazaar:customers-changed", "bazaar:leads-changed", "bazaar:tickets-changed"],
  });

  useEffect(() => {
    fetch("/api/lookups?categories=industry")
      .then((r) => r.json())
      .then((d) => setIndustryLookups(d.industry ?? []))
      .catch(() => {});
  }, []);

  function handlePageSizeChange(size: ListPageSize) {
    writeStoredListPageSize(size);
    setPageSize(size);
    setOffset(0);
  }

  function selectStatusFilter(next: StatusFilter) {
    setStatusFilter(next);
    setOffset(0);
  }

  function selectHeatFilter(next: HeatFilter) {
    setHeatFilter(next);
    setOffset(0);
  }

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
        <button
          type="button"
          onClick={() => setAddCustomerOpen(true)}
          className="flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
        >
          <UserPlus size={15} />
          Add Customer
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative" style={{ minWidth: 260 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="search"
            name="crm-list-search"
            autoComplete="off"
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
              onClick={() => selectStatusFilter(f.id)}
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
              onClick={() => selectHeatFilter(heatFilter === f.id ? "all" : f.id)}
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

        {!loading && pagination.total > 0 && (
          <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {pagination.total} customer{pagination.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              {["Name", "Company", "Phone", "Email", "Status", "Industry", "Leads", "Last Activity", ""].map((h) => (
                <th
                  key={h}
                  className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap ${["Status", "Leads", ""].includes(h) ? "text-center" : "text-left"}`}
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton />
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {debouncedSearch ? "No customers match your search." : "No customers found."}
                </td>
              </tr>
            ) : (
              customers.map((c, idx) => (
                <tr
                  key={c.id}
                  className="transition-colors"
                  style={{
                    background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                    borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                >
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
                    {fullName(c)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-sm">
                    <CompanyCell customer={c} onOpen={() => router.push(`/crm/customers/${c.id}`)} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                    <PhoneCell phone={c.phone} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                    <EmailCell email={c.email} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={c.customer_status} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs max-w-[140px] truncate" style={{ color: "var(--color-text-muted)" }} title={lookupLabel(industryLookups, c.industry, "")}>
                    {lookupLabel(industryLookups, c.industry)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {c.lead_count}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {relativeTime(c.last_activity)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => router.push(`/crm/customers/${c.id}`)}
                        className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97]"
                        style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                      >
                        View
                      </button>
                      <button
                        onClick={() => router.push(newQuoteUrlFromCustomer(c))}
                        className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-all active:scale-[0.97] flex items-center gap-1"
                        style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                        title="New quote for this customer"
                      >
                        <FilePlus size={11} />
                        Add Quote
                      </button>
                    </div>
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
        ) : customers.length === 0 ? (
          <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            {debouncedSearch ? "No customers match your search." : "No customers found."}
          </div>
        ) : (
          customers.map((c) => (
            <div
              key={c.id}
              className="rounded-[10px] border p-4 space-y-3"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{fullName(c)}</p>
                  <p className="text-xs mt-0.5">
                    <CompanyCell customer={c} onOpen={() => router.push(`/crm/customers/${c.id}`)} />
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusBadge status={c.customer_status} />
                </div>
              </div>
              <div className="text-[11px] uppercase tracking-[0.06em] space-y-1" style={{ color: "var(--color-text-muted)" }}>
                {c.industry && (
                  <div className="flex justify-between">
                    <span>Industry</span>
                    <span className="normal-case tracking-normal">{lookupLabel(industryLookups, c.industry)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-2">
                  <span>Phone</span>
                  <span className="normal-case tracking-normal"><PhoneCell phone={c.phone} /></span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span>Email</span>
                  <span className="normal-case tracking-normal truncate max-w-[60%] text-right"><EmailCell email={c.email} /></span>
                </div>
                <div className="flex justify-between"><span>Leads</span><span className="normal-case tracking-normal">{c.lead_count}</span></div>
                <div className="flex justify-between"><span>Last activity</span><span className="normal-case tracking-normal">{relativeTime(c.last_activity)}</span></div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/crm/customers/${c.id}`)}
                  className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium"
                  style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
                >
                  View Profile
                </button>
                <button
                  onClick={() => router.push(newQuoteUrlFromCustomer(c))}
                  className="flex-1 rounded-[6px] py-1.5 text-[13px] font-medium flex items-center justify-center gap-1.5"
                  style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
                >
                  <FilePlus size={13} />
                  Add Quote
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ListPagination
        total={pagination.total}
        offset={offset}
        pageSize={pageSize}
        onOffsetChange={setOffset}
        onPageSizeChange={handlePageSizeChange}
        loading={loading}
      />

      {toast && (
        <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}

      <AddCustomerModal
        open={addCustomerOpen}
        industries={industryLookups}
        onClose={() => setAddCustomerOpen(false)}
        onCreated={(customerId) => {
          window.dispatchEvent(new Event("bazaar:customers-changed"));
          void fetchPageData(true);
          setToast({ message: "Customer added.", type: "success" });
          router.push(`/crm/customers/${customerId}`);
        }}
      />
    </div>
  );
}
