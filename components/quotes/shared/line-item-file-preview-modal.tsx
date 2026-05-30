"use client";

import { useEffect, useState } from "react";
import { X, FileText, ExternalLink, Loader2 } from "lucide-react";

type LineItemFilePreviewModalProps = {
  open: boolean;
  onClose: () => void;
  fileName: string;
  mimeType?: string;
  /** Saved file — staff API URL (redirects to signed storage URL). */
  previewUrl?: string;
  /** Unsaved local pick — preview before save. */
  localFile?: File | null;
};

const previewFrameStyle = {
  minHeight: "min(70vh, 640px)",
  borderColor: "var(--color-border)",
  background: "var(--color-bg)",
} as const;

function PreviewLoadingShell({ label = "Loading preview…" }: { label?: string }) {
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-3 rounded-md border"
      style={previewFrameStyle}
    >
      <Loader2
        size={28}
        className="animate-spin"
        style={{ color: "var(--color-text-muted)" }}
        aria-hidden
      />
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
    </div>
  );
}

function ImagePreview({ src, fileName }: { src: string; fileName: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  return (
    <div
      className="relative flex w-full items-center justify-center rounded-md border"
      style={previewFrameStyle}
    >
      {!loaded && !failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Loader2
            size={28}
            className="animate-spin"
            style={{ color: "var(--color-text-muted)" }}
            aria-hidden
          />
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading image…
          </p>
        </div>
      )}
      {failed ? (
        <p className="px-6 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          Could not load image — use Download instead.
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={fileName}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`max-h-[70vh] w-auto max-w-full object-contain transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          style={{ background: "var(--color-bg)" }}
        />
      )}
    </div>
  );
}

function PdfPreviewBody({ src, fileName }: { src: string; fileName: string }) {
  return (
    <object
      data={`${src}#toolbar=0&navpanes=0`}
      type="application/pdf"
      title={fileName}
      className="w-full rounded-md border"
      style={{
        height: "min(70vh, 640px)",
        borderColor: "var(--color-border)",
        background: "var(--color-bg)",
      }}
    >
      <p className="p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
        PDF preview is not supported in this browser.
      </p>
    </object>
  );
}

function FetchedPdfPreview({ previewUrl, fileName }: { previewUrl: string; fileName: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!previewUrl) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(previewUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load PDF");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewUrl]);

  if (failed) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-md border p-8 text-center"
        style={{
          minHeight: 200,
          borderColor: "var(--color-border)",
          background: "var(--color-bg)",
          color: "var(--color-text-muted)",
        }}
      >
        <FileText size={32} style={{ opacity: 0.45 }} />
        <p className="text-sm">Preview unavailable — use Download or open in a new tab.</p>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: "var(--color-accent-dark)" }}
        >
          <ExternalLink size={14} />
          Open in new tab
        </a>
      </div>
    );
  }

  if (!blobUrl) {
    return <PreviewLoadingShell />;
  }

  return <PdfPreviewBody src={blobUrl} fileName={fileName} />;
}

export function LineItemFilePreviewModal({
  open,
  onClose,
  fileName,
  mimeType,
  previewUrl,
  localFile,
}: LineItemFilePreviewModalProps) {
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !localFile) {
      setLocalBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(localFile);
    setLocalBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [open, localFile]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isPdf = mimeType === "application/pdf" || localFile?.type === "application/pdf";
  const isImage =
    mimeType?.startsWith("image/") || localFile?.type?.startsWith("image/");

  const localSrc = localBlobUrl ?? undefined;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${fileName}`}
    >
      <div
        className="relative flex w-full max-w-4xl max-h-[90vh] min-h-[min(70vh,640px)] flex-col rounded-[12px] border shadow-xl"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3 shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <p
            className="text-sm font-medium truncate min-w-0"
            style={{ color: "var(--color-text-primary)" }}
            title={fileName}
          >
            {fileName}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-md hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-auto p-4 min-h-0 min-w-[min(100%,320px)]">
          {localSrc && isImage && <ImagePreview src={localSrc} fileName={fileName} />}
          {localSrc && isPdf && !isImage && (
            <PdfPreviewBody src={localSrc} fileName={fileName} />
          )}
          {!localFile && previewUrl && isImage && (
            <ImagePreview src={previewUrl} fileName={fileName} />
          )}
          {!localFile && previewUrl && isPdf && !isImage && (
            <FetchedPdfPreview previewUrl={previewUrl} fileName={fileName} />
          )}
          {!isImage && !isPdf && (
            <div
              className="rounded-md border p-6 text-center text-sm"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-muted)",
              }}
            >
              Preview not available for this file type — use Download.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
