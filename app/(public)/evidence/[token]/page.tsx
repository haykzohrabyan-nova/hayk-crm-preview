"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, Upload, X, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils/ticket-math";

const PROOF_FILE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

import { paymentEvidenceMethodLabel } from "@/lib/utils/payment-evidence-method-label";

function RequiredMark() {
  return (
    <span className="ml-0.5" style={{ color: "var(--color-danger)" }} aria-hidden>
      *
    </span>
  );
}

function ProofFileUpload({
  file,
  onChange,
  disabled,
  invalid,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    onChange(files[0]);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={PROOF_FILE_ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {file ? (
        <div
          className="flex items-center gap-3 rounded-[6px] border px-3 py-3"
          style={{
            borderColor: "var(--color-success-border)",
            background: "var(--color-success-bg)",
          }}
        >
          <FileText size={18} style={{ color: "var(--color-success)", flexShrink: 0 }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
              {file.name}
            </p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {(file.size / 1024).toFixed(0)} KB · ready to submit
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="shrink-0 rounded-[6px] p-1.5 hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Remove file"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!disabled) handleFiles(e.dataTransfer.files);
          }}
          className="rounded-[6px] border-2 border-dashed px-4 py-6 text-center transition-colors"
          style={{
            borderColor: invalid
              ? "var(--color-danger)"
              : dragOver
                ? "var(--color-accent)"
                : "var(--color-border)",
            background: dragOver ? "var(--color-badge-bg)" : "var(--color-bg)",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <Upload
            size={28}
            className="mx-auto mb-2"
            style={{ color: dragOver ? "var(--color-accent-dark)" : "var(--color-text-muted)" }}
          />
          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            Upload payment proof
          </p>
          <p className="text-xs mt-1 mb-4" style={{ color: "var(--color-text-muted)" }}>
            JPEG, PNG, WebP, or PDF — up to 10 MB
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--color-btn-verify-bg)",
              color: "var(--color-btn-verify-text)",
            }}
          >
            <Upload size={16} />
            Choose file
          </button>
        </div>
      )}
    </div>
  );
}

type PageStatus = "loading" | "otp_required" | "upload" | "thank_you" | "already_submitted" | "error";

type StatusPayload = {
  status: string;
  reference_code?: string | null;
  company_name?: string | null;
  amount_due?: number;
  submitted_payment_method?: string;
  error?: string;
  code?: string;
};

export default function PaymentEvidenceResubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: routeToken } = use(params);
  const [token, setToken] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [otp, setOtp] = useState("");
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [amountDue, setAmountDue] = useState<number | null>(null);
  const [submittedMethod, setSubmittedMethod] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ method?: string; file?: string }>({});
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async (t: string) => {
    setErr(null);
    const res = await fetch(`/api/public/evidence/${t}/status`, { credentials: "same-origin" });
    const data = (await res.json()) as StatusPayload;
    if (!res.ok) {
      setPageStatus("error");
      setErr(data.error ?? "This link is not valid.");
      return;
    }
    setReferenceCode(data.reference_code ?? null);
    setCompanyName(data.company_name ?? null);
    setAmountDue(typeof data.amount_due === "number" ? data.amount_due : null);
    const method = data.submitted_payment_method?.trim() ?? null;
    setSubmittedMethod(method);
    if (!method) {
      setPageStatus("error");
      setErr(data.error ?? "Payment method for this order could not be loaded.");
      return;
    }
    if (data.status === "already_submitted") setPageStatus("already_submitted");
    else if (data.status === "upload") setPageStatus("upload");
    else if (data.status === "otp_required") setPageStatus("otp_required");
    else setPageStatus("error");
  }, []);

  useEffect(() => {
    setToken(routeToken);
    void loadStatus(routeToken);
  }, [routeToken, loadStatus]);

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!token || otp.replace(/\D/g, "").length < 6) {
      setErr("Enter the 6-digit code from your message.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/public/evidence/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otp }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Verification failed.");
        setBusy(false);
        return;
      }
      setPageStatus("upload");
      setBusy(false);
    } catch {
      setErr("Network error. Please try again.");
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors: { file?: string } = {};
    if (!submittedMethod) {
      setErr("Payment method for this order could not be loaded.");
      return;
    }
    if (!file) errors.file = "Payment proof document is required.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErr("Please complete all required fields.");
      return;
    }
    if (!token || !file) return;

    setBusy(true);
    setErr(null);
    setFieldErrors({});
    const form = new FormData();
    form.set("method", submittedMethod);
    if (receiptId.trim()) form.set("receiptId", receiptId.trim());
    form.set("file", file);

    try {
      const res = await fetch(`/api/public/evidence/${token}/upload`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "OTP_REQUIRED") {
          setPageStatus("otp_required");
          setOtp("");
          setErr("Enter your verification code again, then re-upload your payment proof.");
        } else if (data.code === "ALREADY_SUBMITTED") {
          setPageStatus("already_submitted");
        } else {
          setErr(data.error ?? "Upload failed.");
        }
        setBusy(false);
        return;
      }
      setPageStatus("thank_you");
      setBusy(false);
    } catch {
      setErr("Network error. Please try again.");
      setBusy(false);
    }
  }

  const shellStyle = {
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    minHeight: "100vh",
  };

  if (pageStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen" style={shellStyle}>
        <Loader2 className="animate-spin" size={28} style={{ color: "var(--color-text-muted)" }} />
      </div>
    );
  }

  if (pageStatus === "thank_you" || pageStatus === "already_submitted") {
    return (
      <div className="flex items-center justify-center min-h-screen p-6" style={shellStyle}>
        <div
          className="max-w-md w-full rounded-[10px] border p-8 text-center space-y-4"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <CheckCircle2 size={40} style={{ color: "var(--color-success)" }} className="mx-auto" />
          <h1 className="text-lg font-semibold">Thank you</h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Your updated payment proof{referenceCode ? ` for ${referenceCode}` : ""} was received and is under
            review{companyName ? ` by ${companyName}` : ""}. You do not need to upload again unless we contact you.
          </p>
        </div>
      </div>
    );
  }

  if (pageStatus === "error") {
    return (
      <div className="flex items-center justify-center min-h-screen p-6" style={shellStyle}>
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>{err ?? "Link unavailable."}</p>
      </div>
    );
  }

  const canSubmit = !!submittedMethod && !!file && !busy;

  return (
    <div className="flex items-center justify-center min-h-screen p-6" style={shellStyle}>
      <div
        className="max-w-md w-full rounded-[10px] border p-6 space-y-5"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div>
          <h1 className="text-lg font-semibold">Upload payment proof</h1>
          {referenceCode && (
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
              Order {referenceCode}
              {companyName ? ` · ${companyName}` : ""}
            </p>
          )}
        </div>

        {amountDue != null && amountDue > 0 && (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Amount on file: <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(amountDue)}</strong>
          </p>
        )}

        {pageStatus === "otp_required" ? (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Enter the 6-digit verification code from your email or text message.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full h-10 rounded-[6px] border px-3 text-sm tracking-[0.3em] text-center"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
              placeholder="000000"
            />
            {err && <p className="text-xs" style={{ color: "var(--color-danger)" }}>{err}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-[6px] text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
            >
              {busy ? "Verifying…" : "Continue"}
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            Fields marked with <span style={{ color: "var(--color-danger)" }}>*</span> are required.
          </p>

          <div>
            <p
              className="block text-xs font-medium uppercase tracking-wide mb-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Payment method
            </p>
            <p
              className="w-full rounded-[6px] border px-3 py-2.5 text-sm"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
              }}
              aria-readonly="true"
            >
              {paymentEvidenceMethodLabel(submittedMethod!)}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
              Same method you used when you paid — upload new proof for this method only.
            </p>
          </div>

          <div>
            <label
              htmlFor="receipt-id"
              className="block text-xs font-medium uppercase tracking-wide mb-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Confirmation / reference # (optional)
            </label>
            <input
              id="receipt-id"
              type="text"
              value={receiptId}
              onChange={(e) => setReceiptId(e.target.value)}
              disabled={busy}
              className="w-full h-10 rounded-[6px] border px-3 text-sm"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
              placeholder="Wire or check reference"
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium uppercase tracking-wide mb-2"
              style={{ color: "var(--color-text-muted)" }}
            >
              Payment proof
              <RequiredMark />
            </label>
            <ProofFileUpload
              file={file}
              onChange={(f) => {
                setFile(f);
                setFieldErrors((p) => ({ ...p, file: undefined }));
              }}
              disabled={busy}
              invalid={!!fieldErrors.file}
            />
            {fieldErrors.file && (
              <p className="text-xs mt-1" style={{ color: "var(--color-danger)" }}>
                {fieldErrors.file}
              </p>
            )}
          </div>

          {err && <p className="text-xs" style={{ color: "var(--color-danger)" }}>{err}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-2.5 rounded-[6px] text-sm font-medium disabled:opacity-60"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
          >
            {busy ? "Uploading…" : "Submit payment proof"}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
