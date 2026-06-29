import { type LeadStatus, type SalesStatus } from "@/lib/types";

type Status = LeadStatus | SalesStatus | string;

// All values reference CSS vars — change tokens in globals.css to retheme globally
const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Pending: {
    bg: "var(--color-neutral-bg)", text: "var(--color-neutral-text)", border: "var(--color-neutral-border)",
  },
  Validated: {
    bg: "var(--color-success-bg)", text: "var(--color-success)", border: "var(--color-success-border)",
  },
  Quoted: {
    bg: "var(--color-info-bg)", text: "var(--color-info-text)", border: "var(--color-info-border)",
  },
  "Routed to Sales": {
    bg: "var(--color-badge-bg)", text: "var(--color-badge-text)", border: "var(--color-info-border)",
  },
  "In Progress": {
    bg: "var(--color-in-progress-bg)", text: "var(--color-in-progress-text)", border: "var(--color-in-progress-border)",
  },
  "On Hold": {
    bg: "var(--color-warning-bg)", text: "var(--color-warning)", border: "var(--color-warning-border)",
  },
  "Follow Up Later": {
    bg: "var(--color-info-bg)", text: "var(--color-info-text)", border: "var(--color-info-border)",
  },
  Rejected: {
    bg: "var(--color-danger-bg)", text: "var(--color-danger)", border: "var(--color-danger-border)",
  },
  Duplicate: {
    bg: "var(--color-neutral-bg)", text: "var(--color-neutral-text)", border: "var(--color-neutral-border)",
  },
  Claimed: {
    bg: "var(--color-success-bg)", text: "var(--color-success)", border: "var(--color-success-border)",
  },
  Ongoing: {
    bg: "var(--color-success-bg)", text: "var(--color-success)", border: "var(--color-success-border)",
  },
  "Quote Sent": {
    bg: "var(--color-info-bg)", text: "var(--color-info-text)", border: "var(--color-info-border)",
  },
  Won: {
    bg: "var(--color-success-bg)", text: "var(--color-success)", border: "var(--color-success-border)",
  },
  Dropped: {
    bg: "var(--color-danger-bg)", text: "var(--color-danger)", border: "var(--color-danger-border)",
  },
};

interface StatusPillProps {
  status: Status;
  size?: "sm" | "md";
}

export function StatusPill({ status, size = "sm" }: StatusPillProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES["Pending"];
  const px = size === "md" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${px}`}
      style={{
        background: style.bg,
        color: style.text,
        borderColor: style.border,
      }}
    >
      {status}
    </span>
  );
}
