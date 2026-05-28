"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";

/** Shared layout pieces for quote / order detail overview (redesign). */

export function DetailStatCard({
  label,
  value,
  subValue,
  accent = false,
  valueColor,
  className = "",
  compact = false,
}: {
  label: string;
  value: string;
  subValue?: string;
  accent?: boolean;
  valueColor?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl md:rounded-[14px] border p-3.5 md:p-[18px_20px] transition-shadow md:hover:shadow-md ${className}`}
      style={{
        background: accent ? "var(--color-btn-primary-bg)" : "var(--color-surface)",
        borderColor: accent ? "var(--color-accent-dark)" : "var(--color-border)",
        boxShadow: "0 1px 3px color-mix(in srgb, var(--color-text-primary) 6%, transparent)",
      }}
    >
      <p
        className="text-[10px] md:text-[11px] font-medium uppercase tracking-[0.08em] mb-1.5 md:mb-2"
        style={{ color: accent ? "color-mix(in srgb, var(--color-btn-primary-text) 65%, transparent)" : "var(--color-text-muted)" }}
      >
        {label}
      </p>
      <p
        className={`${compact ? "text-base leading-tight" : "text-lg md:text-[22px] leading-none"} font-semibold tabular-nums break-words`}
        style={{ color: valueColor ?? (accent ? "var(--color-btn-primary-text)" : "var(--color-text-primary)") }}
      >
        {value}
      </p>
      {subValue && (
        <p
          className="text-xs mt-1"
          style={{ color: accent ? "color-mix(in srgb, var(--color-btn-primary-text) 70%, transparent)" : "var(--color-text-muted)" }}
        >
          {subValue}
        </p>
      )}
    </div>
  );
}

export function DetailSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] shrink-0" style={{ color: "var(--color-text-muted)" }}>
        {children}
      </p>
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

/** Collapsible block — default closed. Use for Timeline, Pricing, payment settings on detail pages. */
export function DetailCollapsibleSection({
  title,
  defaultOpen = false,
  children,
  titleClassName = "text-xs font-semibold uppercase tracking-[0.08em]",
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  titleClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left rounded-[6px] -mx-1 px-1 py-0.5 transition-opacity hover:opacity-80"
        aria-expanded={open}
      >
        <span className={`shrink-0 ${titleClassName}`} style={{ color: "var(--color-text-muted)" }}>
          {title}
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
        <ChevronDown
          size={16}
          className="shrink-0 transition-transform duration-200"
          style={{
            color: "var(--color-text-muted)",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </>
  );
}

export function DetailSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`px-4 py-5 md:px-7 md:py-6 border-b last:border-b-0 ${className}`}
      style={{ borderColor: "var(--color-border)" }}
    >
      {children}
    </div>
  );
}

export function DetailNotesBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg px-4 py-3.5 text-sm min-h-12 whitespace-pre-wrap"
      style={{
        background: "var(--color-row-alt)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-muted)",
        fontStyle: children ? "normal" : "italic",
      }}
    >
      {children || "—"}
    </div>
  );
}

export function DetailSpecPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex text-[11.5px] px-2 py-0.5 rounded-full border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
    >
      {children}
    </span>
  );
}

export function DetailLineItemCard({
  name,
  specs,
  price,
}: {
  name: string;
  specs: string[];
  price: number;
}) {
  return (
    <div
      className="rounded-lg px-3.5 py-3.5 md:px-5 md:py-4 flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_auto] sm:gap-2 sm:items-center border"
      style={{ background: "var(--color-row-alt)", borderColor: "var(--color-border)" }}
    >
      <div className="min-w-0">
        <p className="text-sm md:text-[15px] font-semibold leading-snug" style={{ color: "var(--color-text-primary)" }}>
          {name}
        </p>
        {specs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {specs.map((s) => (
              <DetailSpecPill key={s}>{s}</DetailSpecPill>
            ))}
          </div>
        )}
      </div>
      {price > 0 && (
        <p className="text-lg md:text-xl font-semibold tabular-nums sm:text-right shrink-0" style={{ color: "var(--color-text-primary)" }}>
          {formatCurrency(price)}
        </p>
      )}
    </div>
  );
}

export function DetailPricingTable({ rows, totalLabel = "Order Total" }: { rows: { label: string; value: string; muted?: boolean }[]; totalLabel?: string }) {
  const totalRow = rows[rows.length - 1];
  const bodyRows = rows.slice(0, -1);

  return (
    <table className="w-full border-collapse">
      <tbody>
        {bodyRows.map((row) => (
          <tr key={row.label} className="border-b" style={{ borderColor: "var(--color-border)" }}>
            <td className="py-2.5 text-sm" style={{ color: row.muted ? "var(--color-text-muted)" : "var(--color-text-primary)" }}>
              {row.label}
            </td>
            <td className="py-2.5 text-sm text-right font-medium tabular-nums" style={{ color: row.muted ? "var(--color-text-muted)" : "var(--color-text-primary)" }}>
              {row.value}
            </td>
          </tr>
        ))}
        <tr>
          <td className="pt-3.5 text-base font-semibold border-t-2" style={{ color: "var(--color-text-primary)", borderColor: "var(--color-text-primary)" }}>
            {totalRow?.label ?? totalLabel}
          </td>
          <td className="pt-3.5 text-base font-semibold text-right tabular-nums border-t-2" style={{ color: "var(--color-text-primary)", borderColor: "var(--color-text-primary)" }}>
            {totalRow?.value ?? "—"}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function DetailDataGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 border rounded-lg overflow-hidden"
      style={{ borderColor: "var(--color-border)" }}
    >
      {children}
    </div>
  );
}

export function DetailDataCell({
  label,
  value,
  valueColor,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col px-4 py-3 border-b border-r sm:[&:nth-child(2n)]:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0 ${className}`}
      style={{ borderColor: "var(--color-border)" }}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.07em] mb-1" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <span className="text-sm font-medium break-words" style={{ color: valueColor ?? "var(--color-text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

export function DetailFollowUpCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      className="min-w-0 rounded-lg px-3 py-3 md:px-4 md:py-3.5 border"
      style={{ background: "var(--color-row-alt)", borderColor: "var(--color-border)" }}
    >
      <p className="text-[11px] uppercase tracking-[0.07em] mb-1" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p className="text-[15px] font-semibold" style={{ color: valueColor ?? "var(--color-text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

export function DetailStatusDotBadge({
  label,
  variant = "info",
  compact = false,
}: {
  label: string;
  variant?: "info" | "warning" | "success" | "danger" | "accent";
  compact?: boolean;
}) {
  const styles: Record<string, { bg: string; text: string; dot: string }> = {
    info:    { bg: "var(--color-info-bg)",    text: "var(--color-info-text)",    dot: "var(--color-info-text)" },
    warning: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text-deep)", dot: "var(--color-warning)" },
    success: { bg: "var(--color-success-bg)", text: "var(--color-success)",      dot: "var(--color-success)" },
    danger:  { bg: "var(--color-danger-bg)",  text: "var(--color-danger)",       dot: "var(--color-danger)" },
    accent:  { bg: "var(--color-badge-bg)",   text: "var(--color-badge-text)",   dot: "var(--color-accent)" },
  };
  const s = styles[variant] ?? styles.info;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium shrink-0 whitespace-nowrap ${
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 md:px-3 text-xs"
      }`}
      style={{ background: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {label}
    </span>
  );
}
