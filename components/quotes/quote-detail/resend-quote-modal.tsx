"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Mail, MessageSquare, X } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { validateEmail } from "@/lib/utils/email";
import { validatePhone } from "@/lib/utils/phone";

export interface SendChannelOpts {
  channel: "email" | "sms" | "both";
  email: string;
  phone: string;
  message?: string;
}

export type ResendQuoteModalMode =
  | "quote"
  | "invoice"
  | "payment_evidence_resubmit"
  | "tax_exempt_resubmit";

interface ResendQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Async — throw or reject to show an error inside the modal. */
  onSend: (opts: SendChannelOpts) => Promise<void>;
  initialChannel?: "email" | "sms" | "both" | null;
  initialEmail?: string;
  initialPhone?: string;
  initialMessage?: string;
  collectMessage?: boolean;
  mode?: ResendQuoteModalMode;
}

const CHANNEL_OPTS: { value: "email" | "sms" | "both"; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms",   label: "SMS" },
  { value: "both",  label: "Both" },
];

export function ResendQuoteModal({
  isOpen,
  onClose,
  onSend,
  initialChannel = "email",
  initialEmail = "",
  initialPhone = "",
  initialMessage = "",
  collectMessage = false,
  mode = "quote",
}: ResendQuoteModalProps) {
  const [channel, setChannel] = useState<"email" | "sms" | "both">(initialChannel ?? "email");
  const [email, setEmail]     = useState(initialEmail);
  const [phone, setPhone]     = useState(initialPhone);
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  // Reset fields only when the modal opens — not when parent re-renders while open
  // (avoids wiping a typed email/phone if list data refreshes in the background).
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setChannel(initialChannel ?? "email");
      setEmail(initialEmail);
      setPhone(initialPhone);
      setMessage(initialMessage);
      setSending(false);
      setErr(null);
    }
    if (!isOpen) {
      setSending(false);
      setErr(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialChannel, initialEmail, initialPhone, initialMessage]);

  if (!isOpen) return null;

  const needsEmail = channel === "email" || channel === "both";
  const needsPhone = channel === "sms"   || channel === "both";

  async function handleSend() {
    setErr(null);
    if (needsEmail) {
      if (!email.trim()) { setErr("Email address is required."); return; }
      const emailErr = validateEmail(email.trim());
      if (emailErr) { setErr(emailErr); return; }
    }
    if (needsPhone) {
      if (!phone.trim()) { setErr("Phone number is required."); return; }
      const phoneErr = validatePhone(phone.trim());
      if (phoneErr) { setErr(phoneErr); return; }
    }
    if (collectMessage && !message.trim()) {
      setErr("Message to customer is required.");
      return;
    }
    setSending(true);
    try {
      await onSend({
        channel,
        email: email.trim(),
        phone: phone.trim(),
        ...(collectMessage ? { message: message.trim() } : {}),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send. Please try again.");
      setSending(false);
    }
  }

  const title =
    mode === "invoice"
      ? "Resend Invoice Link"
      : mode === "payment_evidence_resubmit"
        ? "Request updated payment proof"
        : mode === "tax_exempt_resubmit"
          ? "Request updated tax-exempt permit"
          : "Send Quote";

  const sendLabel =
    mode === "payment_evidence_resubmit" || mode === "tax_exempt_resubmit"
      ? "Send request"
      : title;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div
        className={`w-full ${collectMessage ? "max-w-md" : "max-w-sm"} rounded-xl shadow-xl`}
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          padding: "24px",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="hover:opacity-70 disabled:opacity-40"
            style={{ color: "var(--color-text-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Channel selector */}
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: "var(--color-text-muted)" }}>
              Send via
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CHANNEL_OPTS.map(({ value, label }) => {
                const active = channel === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChannel(value)}
                    disabled={sending}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50"
                    style={{
                      borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                      background:  active ? "var(--color-badge-bg)"  : "var(--color-surface)",
                      color:       active ? "var(--color-tab-active)" : "var(--color-text-muted)",
                    }}
                  >
                    {value === "email" && <Mail size={15} />}
                    {value === "sms"   && <MessageSquare size={15} />}
                    {value === "both"  && (
                      <span className="flex gap-0.5">
                        <Mail size={13} />
                        <MessageSquare size={13} />
                      </span>
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phone */}
          {needsPhone && (
            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Phone number
              </label>
              <PhoneInput
                value={phone}
                onChange={(val) => setPhone(val)}
                disabled={sending}
              />
            </div>
          )}

          {/* Email */}
          {needsEmail && (
            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Email address
              </label>
              <EmailInput
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={sending}
              />
            </div>
          )}

          {collectMessage && (
            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                Message to customer
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
                rows={6}
                className="w-full rounded-[6px] border px-3 py-2 text-sm resize-y min-h-[120px]"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
          )}

          {err && (
            <p
              className="text-xs px-3 py-2 rounded-lg border"
              style={{
                borderColor: "var(--color-danger-border)",
                background:  "var(--color-danger-bg)",
                color:       "var(--color-danger)",
              }}
            >
              {err}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="flex-1 py-2.5 rounded-lg border text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{
              borderColor: "var(--color-border)",
              color:       "var(--color-text-muted)",
              background:  "var(--color-surface)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: "var(--color-btn-primary-bg)",
              color:      "var(--color-btn-primary-text)",
            }}
          >
            {sending && <Loader2 size={14} className="animate-spin" />}
            {sending ? "Sending…" : sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
