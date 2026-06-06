"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const iconShell =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border transition-opacity hover:opacity-80 disabled:opacity-50";

const iconStyle = {
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
  background: "var(--color-surface)",
};

const tooltipContentStyle = {
  background: "var(--color-topbar)",
  color: "var(--color-text-inverse)",
  border: "1px solid var(--color-border)",
};

function PaymentsActionTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent
        side="top"
        sideOffset={6}
        className="px-2 py-1 text-[12px] font-medium shadow-none max-w-[220px] text-center [&>svg]:hidden"
        style={tooltipContentStyle}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Compact action cluster for payments table rows — icon secondary + one primary CTA. */
export function PaymentsRowActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-1 flex-nowrap">{children}</div>;
}

export function PaymentsRowIconLink({
  href,
  title,
  icon: Icon,
}: {
  href: string;
  title: string;
  icon: LucideIcon;
}) {
  return (
    <PaymentsActionTooltip label={title}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={iconShell}
        style={{ ...iconStyle, textDecoration: "none" }}
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon size={15} aria-hidden />
      </a>
    </PaymentsActionTooltip>
  );
}

export function PaymentsRowIconButton({
  title,
  icon: Icon,
  onClick,
  disabled,
}: {
  title: string;
  icon: LucideIcon;
  onClick: (e: MouseEvent) => void;
  disabled?: boolean;
}) {
  const button = (
    <button
      type="button"
      className={iconShell}
      style={iconStyle}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      <Icon size={15} aria-hidden />
    </button>
  );

  if (disabled) {
    return (
      <PaymentsActionTooltip label={title}>
        <span className="inline-flex cursor-not-allowed">{button}</span>
      </PaymentsActionTooltip>
    );
  }

  return <PaymentsActionTooltip label={title}>{button}</PaymentsActionTooltip>;
}

export function PaymentsRowTextLink({
  href,
  label,
  warning,
  onClick,
}: {
  href: string;
  label: string;
  warning?: boolean;
  onClick?: (e: MouseEvent) => void;
}) {
  return (
    <a
      href={href}
      className="inline-flex shrink-0 items-center rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium border whitespace-nowrap"
      style={{
        borderColor: warning ? "var(--color-warning-border)" : "var(--color-border)",
        color: warning ? "var(--color-warning-text-deep)" : "var(--color-text-primary)",
        background: warning ? "var(--color-warning-bg)" : "var(--color-surface)",
        textDecoration: "none",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {label}
    </a>
  );
}

export function PaymentsRowPrimaryButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  icon: LucideIcon;
  onClick: (e: MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium border border-transparent disabled:opacity-60 whitespace-nowrap ml-0.5"
      style={{
        background: "var(--color-btn-primary-bg)",
        color: "var(--color-btn-primary-text)",
      }}
    >
      {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Icon size={14} aria-hidden />}
      {label}
    </button>
  );
}
