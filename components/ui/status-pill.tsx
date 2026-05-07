import { type LeadStatus, type SalesStatus } from "@/lib/types";

type Status = LeadStatus | SalesStatus | string;

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; border: string; darkBg: string; darkText: string; darkBorder: string }
> = {
  Pending: {
    bg: "#F2F2F0", text: "#999999", border: "#E0E0DC",
    darkBg: "#27272A", darkText: "#71717A", darkBorder: "#3F3F46",
  },
  Validated: {
    bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0",
    darkBg: "#052E16", darkText: "#22C55E", darkBorder: "#166534",
  },
  Quoted: {
    bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE",
    darkBg: "#1E3A5F", darkText: "#60A5FA", darkBorder: "#1E40AF",
  },
  "Routed to Sales": {
    bg: "#EAF0FB", text: "#1B2B4B", border: "#C7D7F5",
    darkBg: "#2D1F0E", darkText: "#FB923C", darkBorder: "#92400E",
  },
  "On Hold": {
    bg: "#FFFBEB", text: "#D97706", border: "#FDE68A",
    darkBg: "#431407", darkText: "#F59E0B", darkBorder: "#92400E",
  },
  Rejected: {
    bg: "#FEF2F2", text: "#DC2626", border: "#FECACA",
    darkBg: "#450A0A", darkText: "#EF4444", darkBorder: "#991B1B",
  },
  Duplicate: {
    bg: "#F2F2F0", text: "#999999", border: "#E0E0DC",
    darkBg: "#27272A", darkText: "#71717A", darkBorder: "#3F3F46",
  },
  Ongoing: {
    bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0",
    darkBg: "#052E16", darkText: "#22C55E", darkBorder: "#166534",
  },
  "Quote Sent": {
    bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE",
    darkBg: "#1E3A5F", darkText: "#60A5FA", darkBorder: "#1E40AF",
  },
  Won: {
    bg: "#F0FDF4", text: "#15803D", border: "#86EFAC",
    darkBg: "#052E16", darkText: "#4ADE80", darkBorder: "#166534",
  },
  Dropped: {
    bg: "#FEF2F2", text: "#DC2626", border: "#FECACA",
    darkBg: "#450A0A", darkText: "#EF4444", darkBorder: "#991B1B",
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
