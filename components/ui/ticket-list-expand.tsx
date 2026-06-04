"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { TicketLineItemsQuickPreview } from "@/components/quotes/ticket-line-items-quick-preview";

export function ExpandChevron({ open }: { open: boolean }) {
  return open ? (
    <ChevronDown size={16} aria-hidden />
  ) : (
    <ChevronRight size={16} aria-hidden />
  );
}

export function TicketListViewButton({
  label = "View",
  onClick,
  className = "",
}: {
  label?: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border whitespace-nowrap transition-opacity hover:opacity-70 ${className}`}
      style={{
        borderColor: "var(--color-border)",
        color: "var(--color-text-primary)",
        background: "var(--color-surface)",
      }}
    >
      <ExternalLink size={14} aria-hidden />
      {label}
    </button>
  );
}

export function TicketListExpandChevronCell({ open }: { open: boolean }) {
  return (
    <td className="px-3 py-3 w-10">
      <span style={{ color: "var(--color-text-muted)" }}>
        <ExpandChevron open={open} />
      </span>
    </td>
  );
}

export function TicketListExpandPreviewRow({
  colSpan,
  ticketId,
  ticketRef,
  previewId,
}: {
  colSpan: number;
  ticketId: string;
  ticketRef: string;
  previewId: string;
}) {
  return (
    <tr style={{ background: "var(--color-row-alt)" }}>
      <td colSpan={colSpan} className="p-0 border-b" style={{ borderColor: "var(--color-border)" }}>
        <TicketLineItemsQuickPreview
          ticketId={ticketId}
          ticketRef={ticketRef}
          expanded
          previewId={previewId}
        />
      </td>
    </tr>
  );
}
