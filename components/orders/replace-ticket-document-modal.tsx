"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, RefreshCw, Upload, X } from "lucide-react";

export type ReplaceDocumentKind = "payment_evidence" | "sales_permit";

const COPY: Record<
  ReplaceDocumentKind,
  { title: string; titleNew: string; viewLabel: string; acceptHint: string }
> = {
  payment_evidence: {
    title: "Replace payment proof",
    titleNew: "Upload payment proof",
    viewLabel: "View current file",
    acceptHint: "JPEG, PNG, WebP, or PDF — max 10 MB",
  },
  sales_permit: {
    title: "Replace sales permit",
    titleNew: "Upload sales permit",
    viewLabel: "View current permit",
    acceptHint: "JPEG, PNG, WebP, or PDF — max 10 MB",
  },
};

export function ReplaceTicketDocumentModal({
  open,
  kind,
  ticketId,
  referenceCode,
  existingFileName,
  existingPermitNumber,
  viewHref,
  onClose,
  onSuccess,
}: {
  open: boolean;
  kind: ReplaceDocumentKind;
  ticketId: string;
  referenceCode: string | null;
  existingFileName?: string | null;
  /** Current permit number — required when replacing sales permit. */
  existingPermitNumber?: string | null;
  viewHref: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const copy = COPY[kind];
  const hasExisting = !!existingFileName?.trim();
  const isSalesPermit = kind === "sales_permit";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [permitNumber, setPermitNumber] = useState("");
  const [permitNumberError, setPermitNumberError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPendingFile(null);
    setPermitNumber(existingPermitNumber?.trim() ?? "");
    setPermitNumberError(null);
    setSaving(false);
    setError(null);
  }, [open, ticketId, kind, existingPermitNumber]);

  if (!open) return null;

  async function handleSave() {
    if (!pendingFile) {
      setError("Choose a file to upload.");
      return;
    }
    if (isSalesPermit && !permitNumber.trim()) {
      setPermitNumberError("Sales Permit # is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setPermitNumberError(null);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      if (isSalesPermit) {
        fd.append("sales_permit_number", permitNumber.trim());
      }
      const uploadPath =
        kind === "payment_evidence"
          ? `/api/tickets/${ticketId}/evidence`
          : `/api/tickets/${ticketId}/sales-permit`;
      const res = await fetch(uploadPath, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Upload failed.");
        setSaving(false);
        return;
      }
      window.dispatchEvent(new Event("bazaar:tickets-changed"));
      window.dispatchEvent(new Event("bazaar:refresh-counts"));
      onSuccess();
      onClose();
    } catch {
      setError("Network error — please try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={saving ? undefined : onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[520px] rounded-[12px] p-6"
        style={{ background: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-document-title"
      >
        <div className="flex gap-3 mb-4">
          <RefreshCw size={22} className="shrink-0" style={{ color: "var(--color-tab-active)" }} />
          <div className="min-w-0">
            <h2
              id="replace-document-title"
              className="text-base font-semibold mb-1"
              style={{ color: "var(--color-text-primary)" }}
            >
              {hasExisting ? copy.title : copy.titleNew}
            </h2>
            {referenceCode && (
              <p className="text-sm font-mono" style={{ color: "var(--color-text-muted)" }}>
                {referenceCode}
              </p>
            )}
          </div>
        </div>

        {hasExisting && (
          <div
            className="rounded-lg border px-3 py-2.5 mb-4 flex items-center gap-2"
            style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
          >
            <FileText size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
            <span className="text-sm truncate flex-1" style={{ color: "var(--color-text-primary)" }}>
              {existingFileName}
            </span>
            <a
              href={viewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[13px] font-medium"
              style={{ color: "var(--color-tab-active)" }}
            >
              {copy.viewLabel}
            </a>
          </div>
        )}

        {isSalesPermit && (
          <div className="mb-4">
            <label
              htmlFor="replace-permit-number"
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              Sales Permit # <span style={{ color: "var(--color-danger)" }}>*</span>
            </label>
            <input
              id="replace-permit-number"
              type="text"
              value={permitNumber}
              disabled={saving}
              placeholder="Permit number…"
              onChange={(e) => {
                setPermitNumber(e.target.value);
                setPermitNumberError(null);
                setError(null);
              }}
              className="w-full px-3 py-2 rounded-md text-sm border outline-none disabled:opacity-60"
              style={{
                borderColor: permitNumberError ? "var(--color-danger)" : "var(--color-border)",
                background: "var(--color-bg)",
                color: "var(--color-text-primary)",
              }}
            />
            {permitNumberError && (
              <p className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>
                {permitNumberError}
              </p>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            setPendingFile(file);
            setError(null);
          }}
        />

        <div
          className="rounded-lg border border-dashed p-4 space-y-3 mb-4"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
        >
          <button
            type="button"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[6px] px-4 py-2.5 text-[13px] font-medium disabled:opacity-60 sm:w-auto"
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
          >
            <Upload size={16} />
            {pendingFile ? "Choose a different file" : hasExisting ? "Choose replacement file" : "Choose file"}
          </button>
          {pendingFile ? (
            <div
              className="flex items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
            >
              <span className="truncate min-w-0">{pendingFile.name}</span>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium"
                style={{ color: "var(--color-danger)" }}
              >
                <X size={14} />
                Remove
              </button>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {copy.acceptHint}
            </p>
          )}
        </div>

        {(hasExisting || isSalesPermit) && (
          <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>
            {kind === "payment_evidence"
              ? "Replacing clears payment proof review and returns this order to pending approval."
              : "Update the permit number and file together. Replacing clears tax-exempt review and returns this order to the pending queue."}
          </p>
        )}

        {error && (
          <div
            className="rounded-[6px] border px-3 py-2 text-sm mb-4"
            style={{
              borderColor: "var(--color-danger-border)",
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-[6px] border px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-muted)",
              background: "transparent",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !pendingFile || (isSalesPermit && !permitNumber.trim())}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {hasExisting ? "Replace file" : "Upload file"}
          </button>
        </div>
      </div>
    </div>
  );
}
