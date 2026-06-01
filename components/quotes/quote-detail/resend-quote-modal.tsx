"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail, MessageSquare, X } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { validateEmail } from "@/lib/utils/email";
import { validatePhone } from "@/lib/utils/phone";

export interface SendChannelOpts {
  channel: "email" | "sms" | "both";
  email: string;
  phone: string;
}

interface ResendQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Async — throw or reject to show an error inside the modal. */
  onSend: (opts: SendChannelOpts) => Promise<void>;
  initialChannel?: "email" | "sms" | "both" | null;
  initialEmail?: string;
  initialPhone?: string;
  /** "quote" = sending/resending the quote; "invoice" = resending the order/production link */
  mode?: "quote" | "invoice";
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
  mode = "quote",
}: ResendQuoteModalProps) {
  const [channel, setChannel] = useState<"email" | "sms" | "both">(initialChannel ?? "email");
  const [email, setEmail]     = useState(initialEmail);
  const [phone, setPhone]     = useState(initialPhone);
  const [sending, setSending] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setChannel(initialChannel ?? "email");
    setEmail(initialEmail);
    setPhone(initialPhone);
    setSending(false);
    setErr(null);
  }, [isOpen, initialChannel, initialEmail, initialPhone]);

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
    setSending(true);
    try {
      await onSend({ channel, email: email.trim(), phone: phone.trim() });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send. Please try again.");
      setSending(false);
    }
  }

  const title = mode === "invoice" ? "Resend Invoice Link" : "Send Quote";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-xl"
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
            {sending ? "Sending…" : title}
          </button>
        </div>
      </div>
    </div>
  );
}
