"use client";

import { useRef, useState } from "react";
import { Download, Paperclip, FileText, Image as ImageIcon, Eye, Trash2 } from "lucide-react";
import type { TicketFileMeta } from "@/lib/utils/ticket-line-items";
import { LazyBlurImage } from "@/components/ui/lazy-blur-image";
import { LineItemFilePreviewModal } from "./line-item-file-preview-modal";

/**
 * Clickable thumbnail shown in read-only overview — images render inline,
 * PDFs show an icon card. Clicking opens the full `LineItemFilePreviewModal`.
 */
export function LineItemFileThumbnail({
  file,
  ticketRef,
  size = 72,
  fill = false,
}: {
  file: TicketFileMeta;
  ticketRef?: string | null;
  /** px — outer width/height of the thumbnail square. Ignored when fill=true. Default 72. */
  size?: number;
  /**
   * When true the button stretches to fill its container (w-full h-full) — use this when
   * the parent element controls sizing, e.g. the right-side panel of DetailLineItemCard.
   */
  fill?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const canAccess = Boolean(file.id && ticketRef);
  if (!canAccess) return null;

  const href     = `/api/tickets/${ticketRef}/files/${file.id}`;
  const isImage  = Boolean(file.mime_type?.startsWith("image/"));
  const fileName = file.file_name ?? "Attachment";

  const buttonCls = fill
    ? "block w-full h-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2"
    : "shrink-0 rounded-lg border overflow-hidden transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2";

  const buttonStyle = fill
    ? { background: "var(--color-row-alt)" }
    : {
        width:       size,
        height:      size,
        borderColor: "var(--color-border)",
        background:  "var(--color-row-alt)",
      };

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        title={`Preview ${fileName}`}
        aria-label={`Preview ${fileName}`}
        className={buttonCls}
        style={buttonStyle}
      >
        {isImage ? (
          <LazyBlurImage src={href} alt={fileName} fill loading="lazy" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1.5">
            <FileText size={fill || size >= 64 ? 22 : 16} style={{ color: "var(--color-text-muted)" }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
            >
              PDF
            </span>
            <span
              className="text-[9px] truncate w-full text-center px-1 leading-none"
              style={{ color: "var(--color-text-muted)" }}
            >
              {fileName}
            </span>
          </div>
        )}
      </button>
      <LineItemFilePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        fileName={fileName}
        mimeType={file.mime_type}
        previewUrl={href}
      />
    </>
  );
}

export type FormLineAttachment = {
  pendingFile?: File | null;
  file?: TicketFileMeta | null;
};

export function viewAttachmentLabel(mime: string | undefined): string {
  if (mime === "application/pdf") return "View PDF";
  if (mime?.startsWith("image/")) return "View image";
  return "View file";
}

export function ViewAttachmentIcon({ mime, size = 14 }: { mime?: string; size?: number }) {
  if (mime === "application/pdf") return <FileText size={size} />;
  if (mime?.startsWith("image/")) return <ImageIcon size={size} />;
  return <Eye size={size} />;
}

const iconActionCls =
  "p-2 rounded-md border flex items-center justify-center transition-opacity hover:opacity-85 h-[38px] box-border";

const iconActionStyle = {
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
  background: "var(--color-surface)",
} as const;

const overviewBtnBase =
  "inline-flex shrink-0 items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-opacity hover:opacity-85";

/** View (modal) + download for a saved or pending line-item file. */
export function LineItemSavedFileActions({
  file,
  ticketRef,
  className = "",
  variant = "icons",
  pendingFile,
}: {
  file?: TicketFileMeta | null;
  ticketRef?: string;
  className?: string;
  variant?: "icons" | "overview";
  /** Local file awaiting save — enables preview before upload. */
  pendingFile?: File | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const canDownloadSaved = Boolean(file?.id && ticketRef);
  const canPreview = Boolean(canDownloadSaved || pendingFile);
  if (!canPreview && !canDownloadSaved) return null;

  const href = canDownloadSaved
    ? `/api/tickets/${ticketRef}/files/${file!.id}`
    : undefined;
  const fileName = pendingFile?.name ?? file?.file_name ?? "Attachment";
  const mimeType = pendingFile?.type ?? file?.mime_type;
  const viewLabel = viewAttachmentLabel(mimeType);

  return (
    <>
      {canPreview && (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className={
            variant === "icons"
              ? `${iconActionCls} ${className}`.trim()
              : overviewBtnBase
          }
          style={
            variant === "icons"
              ? iconActionStyle
              : {
                  borderColor: "var(--color-border)",
                  background: "var(--color-btn-primary-bg)",
                  color: "var(--color-btn-primary-text)",
                }
          }
          aria-label={viewLabel}
          title={viewLabel}
        >
          <ViewAttachmentIcon mime={mimeType} size={variant === "icons" ? 16 : 14} />
          {variant === "overview" && viewLabel}
        </button>
      )}
      {canDownloadSaved && href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          download
          className={
            variant === "icons"
              ? `${iconActionCls} ${className}`.trim()
              : overviewBtnBase
          }
          style={
            variant === "icons"
              ? iconActionStyle
              : {
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text-primary)",
                }
          }
          aria-label={`Download ${fileName}`}
          title={`Download ${fileName}`}
        >
          <Download size={variant === "icons" ? 16 : 14} />
          {variant === "overview" && "Download"}
        </a>
      )}
      <LineItemFilePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        fileName={fileName}
        mimeType={mimeType}
        previewUrl={href}
        localFile={pendingFile}
      />
    </>
  );
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

  const showSavedActions = Boolean((saved?.id && ticketRef && !pending) || pending);

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
        {compact && showSavedActions && (
          <LineItemSavedFileActions
            file={saved}
            ticketRef={ticketRef ?? undefined}
            pendingFile={pending}
          />
        )}
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
      {!compact && showSavedActions && (
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <LineItemSavedFileActions
            file={saved}
            ticketRef={ticketRef ?? undefined}
            pendingFile={pending}
            variant="overview"
          />
        </div>
      )}
      {!compact && saved && !ticketRef && !pending && (
        <span className="text-xs truncate max-w-[240px]" style={{ color: "var(--color-text-muted)" }}>
          {saved.file_name}
        </span>
      )}
    </div>
  );
}

/** Read-only attachment row for quote/order overview — shows a thumbnail instead of a button. */
export function LineItemAttachmentOverview({
  file,
  ticketRef,
  label = "Line attachment",
  size = 216,
}: {
  file: TicketFileMeta;
  ticketRef?: string | null;
  label?: string;
  size?: number;
}) {
  const canAccess = Boolean(file.id && ticketRef);
  const href = canAccess ? `/api/tickets/${ticketRef}/files/${file.id}` : undefined;

  return (
    <div
      className="border-t px-3.5 py-3 md:px-5 md:py-3.5 flex items-center gap-3"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      {/* Thumbnail — clickable, opens full modal */}
      {canAccess && (
        <LineItemFileThumbnail file={file} ticketRef={ticketRef} size={size} />
      )}

      {/* File info + download */}
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-0.5" style={{ color: "var(--color-text-muted)" }}>
            {label}
          </p>
          <p className="text-sm truncate" style={{ color: "var(--color-text-primary)" }} title={file.file_name}>
            {file.file_name}
          </p>
        </div>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            download
            title={`Download ${file.file_name ?? "file"}`}
            aria-label={`Download ${file.file_name ?? "file"}`}
            className={`${iconActionCls} shrink-0`}
            style={iconActionStyle}
          >
            <Download size={16} />
          </a>
        )}
      </div>
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

/** Apply line ↔ first-SKU attachment rules when the variant list changes in the form. */
export function applyVariantListAttachmentChanges(
  previousVariants: import("./line-item-variants").FormLineVariant[],
  nextVariants: import("./line-item-variants").FormLineVariant[],
  lineAttachment?: FormLineAttachment,
): { variants: import("./line-item-variants").FormLineVariant[]; lineAttachment?: FormLineAttachment } {
  let attachment = lineAttachment;
  let variants = nextVariants;

  if (previousVariants.length > 0 && variants.length < previousVariants.length) {
    const prevFirst = previousVariants[0];
    const firstRemoved = !variants.some((v) => v.id === prevFirst.id);
    if (firstRemoved && (prevFirst.file || prevFirst.pendingFile)) {
      const lineHasFile = attachment?.file || attachment?.pendingFile;
      if (!lineHasFile) {
        attachment = {
          pendingFile: prevFirst.pendingFile,
          file: prevFirst.file,
        };
      }
    }
  }

  return migrateLineAttachmentToFirstVariant(previousVariants.length, variants, attachment);
}
