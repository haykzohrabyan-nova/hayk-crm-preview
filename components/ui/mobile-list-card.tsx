"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";

/** Card shell for mobile table rows — matches leads-page + mobile-table-cards rule. */
export function MobileListCard({
  children,
  onClick,
  className = "",
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[10px] border p-4 space-y-3 text-left w-full ${onClick ? "cursor-pointer transition-opacity hover:opacity-95" : ""} ${className}`}
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function MobileListCardRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: ReactNode;
  valueColor?: string;
}) {
  return (
    <div className="flex justify-between gap-3 items-start">
      <span className="shrink-0">{label}</span>
      <span
        className="normal-case tracking-normal text-right font-medium truncate max-w-[58%]"
        style={{ color: valueColor ?? "var(--color-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function MobileListCardFields({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[11px] uppercase tracking-[0.06em] space-y-1.5"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </div>
  );
}

export function MobileListCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[10px] border p-4 space-y-3 animate-pulse"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <div className="h-4 w-28 rounded" style={{ background: "var(--color-border)" }} />
          <div className="h-3 w-full rounded" style={{ background: "var(--color-border)" }} />
          <div className="h-3 w-2/3 rounded" style={{ background: "var(--color-border)" }} />
        </div>
      ))}
    </>
  );
}

export function MobileListCardEmpty({ message }: { message: string }) {
  return (
    <div
      className="rounded-[10px] border p-8 text-center text-sm"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
    >
      {message}
    </div>
  );
}

/** Scrollable tabs + full-width search on mobile (ticket list pages). */
export function TicketListToolbar({
  tabs,
  activeTab,
  onTabChange,
  tabCounts,
  search,
  onSearchChange,
  searchPlaceholder,
  endAdornment,
}: {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  tabCounts?: Record<string, number>;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  endAdornment?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between border-b mb-0"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="flex overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const count = tabCounts?.[t.id] ?? 0;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className="px-3 py-2.5 sm:px-4 text-sm relative transition-colors whitespace-nowrap shrink-0"
              style={{
                color: active ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
                fontWeight: active ? 500 : 400,
              }}
            >
              {t.label}
              {count > 0 && (
                <span
                  className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                  style={{
                    background: active ? "var(--color-badge-bg)" : "color-mix(in srgb, var(--color-badge-bg) 70%, transparent)",
                    color: "var(--color-badge-text)",
                  }}
                >
                  {count}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ background: "var(--color-tab-underline)" }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 mb-2 w-full lg:w-auto shrink-0 sm:flex-row sm:items-center">
        {endAdornment}
        <div className="relative w-full lg:w-52 shrink-0">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--color-text-muted)" }} />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-8 pr-3 py-2 sm:py-1.5 text-sm rounded-md border outline-none"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />
        </div>
      </div>
    </div>
  );
}
