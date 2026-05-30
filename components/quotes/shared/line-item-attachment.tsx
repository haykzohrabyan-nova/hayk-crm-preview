"use client";

import { useRef } from "react";
import { Download, Paperclip, FileText, Image as ImageIcon, Eye, Trash2 } from "lucide-react";
import type { TicketFileMeta } from "@/lib/utils/ticket-line-items";

export type FormLineAttachment = {
  pendingFile?: File | null;
  file?: TicketFileMeta | null;
};

function viewAttachmentLabel(mime: string | undefined): string {
  if (mime === "application/pdf") return "View PDF";
  if (mime?.startsWith("image/")) return "View image";
  return "View file";
}

function ViewAttachmentIcon({ mime }: { mime?: string }) {
  if (mime === "application/pdf") return <FileText size={14} />;
  if (mime?.startsWith("image/")) return <ImageIcon size={14} />;
  return <Eye size={14} />;
}

const attachBtnCls =
  "inline-flex items-center justify-center gap-1.5 px-3 rounded-md text-sm font-medium border whitespace-nowrap h-[38px] box-border transition-opacity hover:opacity-85";

/** Attach / view / replace line-item file (image or PDF). */
export function LineItemAttachmentControl({
  attachment,
  ticketRef,
  onChange,
  compact = false,
}: {
  attachment?: FormLineAttachment;
  ticketRef?: string | null;
  onChange: (next: FormLineAttachment | undefined) => void;
  /** Shorter label for the finishings row. */
  compact?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pending = attachment?.pendingFile;
  const saved = attachment?.file;
  const hasFile = Boolean(pending || saved);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onChange({ pendingFile: file, file: undefined });
  }

  function clearFile() {
    onChange(undefined);
  }

  return (
    <div className={compact ? "shrink-0 flex flex-col items-end gap-1" : "space-y-1.5"}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={onFileSelected}
      />
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <button
          type="button"
          onClick={pickFile}
          className={attachBtnCls}
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text-primary)",
            background: hasFile ? "var(--color-badge-bg)" : "var(--color-surface)",
          }}
        >
          <Paperclip size={13} />
          {compact
            ? hasFile
              ? "Replace file"
              : "Attach file"
            : hasFile
              ? "Replace image or PDF"
              : "Attach image or PDF"}
        </button>
        {hasFile && (
          <button
            type="button"
            onClick={clearFile}
            className="p-2 rounded-md hover:opacity-70 h-[38px] flex items-center"
            style={{ color: "var(--color-danger)" }}
            aria-label="Remove attachment"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {pending && (
        <p className="text-xs max-w-[220px] truncate text-right" style={{ color: "var(--color-text-muted)" }}>
          {pending.name} · uploads on save
        </p>
      )}
      {saved?.id && ticketRef && !pending && (
        <a
          href={`/api/tickets/${ticketRef}/files/${saved.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs hover:opacity-70 max-w-[240px]"
          style={{ color: "var(--color-accent-dark)" }}
        >
          <Download size={13} className="shrink-0" />
          <span className="truncate">{saved.file_name}</span>
        </a>
      )}
      {saved && !ticketRef && !pending && (
        <span className="text-xs truncate max-w-[240px]" style={{ color: "var(--color-text-muted)" }}>
          {saved.file_name}
        </span>
      )}
    </div>
  );
}

/** Read-only attachment row for quote/order overview. */
export function LineItemAttachmentOverview({
  file,
  ticketRef,
  label = "Line attachment",
}: {
  file: TicketFileMeta;
  ticketRef?: string | null;
  label?: string;
}) {
  const canView = Boolean(file.id && ticketRef);

  return (
    <div
      className="border-t px-3.5 py-3 md:px-5 md:py-3.5 flex flex-wrap items-center justify-between gap-2"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--color-text-muted)" }}>
          {label}
        </p>
        <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }} title={file.file_name}>
          {file.file_name}
        </p>
      </div>
      {canView && (
        <a
          href={`/api/tickets/${ticketRef}/files/${file.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-opacity hover:opacity-85"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-btn-primary-bg)",
            color: "var(--color-btn-primary-text)",
          }}
        >
          <ViewAttachmentIcon mime={file.mime_type} />
          {viewAttachmentLabel(file.mime_type)}
        </a>
      )}
    </div>
  );
}

/** Move line-level attachment onto the first additional SKU when the first SKU is added. */
export function migrateLineAttachmentToFirstVariant(
  previousCount: number,
  nextVariants: import("./line-item-variants").FormLineVariant[],
  lineAttachment?: FormLineAttachment,
): { variants: import("./line-item-variants").FormLineVariant[]; lineAttachment?: FormLineAttachment } {
  if (previousCount > 0 || nextVariants.length === 0) {
    return { variants: nextVariants, lineAttachment };
  }
  const att = lineAttachment?.pendingFile || lineAttachment?.file;
  if (!att) {
    return { variants: nextVariants, lineAttachment };
  }
  const first = nextVariants[0];
  if (first.file || first.pendingFile) {
    return { variants: nextVariants, lineAttachment };
  }
  return {
    variants: [
      {
        ...first,
        pendingFile: lineAttachment?.pendingFile,
        file: lineAttachment?.file,
      },
      ...nextVariants.slice(1),
    ],
    lineAttachment: undefined,
  };
}
