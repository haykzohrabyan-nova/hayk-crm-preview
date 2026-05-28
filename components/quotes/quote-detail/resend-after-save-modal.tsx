"use client";

import { Mail, X } from "lucide-react";
import type { ResendPromptKind } from "@/lib/utils/should-offer-resend-after-save";

interface ResendAfterSaveModalProps {
  open: boolean;
  kind: ResendPromptKind;
  /** Quote vs order wording */
  recordLabel: "quote" | "order";
  outreachLabel: string;
  onResend: () => void;
  onSkip: () => void;
  sending?: boolean;
}

export function ResendAfterSaveModal({
  open,
  kind,
  recordLabel,
  outreachLabel,
  onResend,
  onSkip,
  sending,
}: ResendAfterSaveModalProps) {
  if (!open) return null;

  const isAdmin = kind === "admin";
  const title = isAdmin ? `Notify customer about ${recordLabel} changes?` : "Resend updated quote to customer?";

  const body = isAdmin
    ? `Your changes are saved and the customer portal is updated. Send an email or message so they know the ${recordLabel} was revised.`
    : `Your changes are saved. The customer portal already shows the latest details, but their inbox still has the old version. Resend via ${outreachLabel}?`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={sending ? undefined : onSkip}
    >
      <div
        className="w-full max-w-[520px] rounded-[12px] p-6"
        style={{ background: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onSkip}
            disabled={sending}
            className="p-1 rounded-md hover:opacity-70 disabled:opacity-40"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--color-text-muted)" }}>
          {body}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium rounded-md border hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)", background: "var(--color-surface)" }}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onResend}
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
          >
            <Mail size={14} />
            {sending ? "Sending…" : isAdmin ? "Send update" : "Resend quote"}
          </button>
        </div>
      </div>
    </div>
  );
}
