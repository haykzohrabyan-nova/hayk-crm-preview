"use client";

import { useState } from "react";
import { CreditCard, Smartphone, Clock, MessageSquare, Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";

// ─── Coming-soon cards ────────────────────────────────────────────────────────

const COMING_SOON = [
  {
    id: "stripe",
    name: "Stripe",
    description:
      "Accept card payments directly from quotes. Automatically mark tickets as paid when a client pays online. Supports one-time charges and prepayment splits.",
    icon: CreditCard,
    notes: [
      "Send a payment link from the quote detail page",
      "Auto-update ticket status on successful charge",
      "Sync prepayment and balance amounts",
    ],
  },
  {
    id: "zelle",
    name: "Zelle",
    description:
      "Record and track Zelle payments on quotes and orders. Link your business Zelle account so reps can include payment instructions on quote PDFs.",
    icon: Smartphone,
    notes: [
      "Display Zelle details on quote PDFs",
      "Manual payment confirmation by rep",
      "Track payment status per ticket",
    ],
  },
];

// ─── Twilio card ──────────────────────────────────────────────────────────────

function TwilioCard() {
  const [phone, setPhone] = useState("");
  const [smsState, setSmsState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [waState, setWaState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [smsMsg, setSmsMsg] = useState("");
  const [waMsg, setWaMsg] = useState("");

  async function send(channel: "sms" | "whatsapp") {
    const setS = channel === "sms" ? setSmsState : setWaState;
    const setM = channel === "sms" ? setSmsMsg : setWaMsg;
    setS("loading");
    setM("");
    try {
      const res = await fetch("/api/admin/integrations/twilio/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: phone.trim(), channel }),
      });
      const data = await res.json();
      if (data.ok) {
        setS("ok");
        setM(`Sent — SID: ${data.sid}`);
      } else {
        setS("error");
        setM(data.error ?? "Unknown error");
      }
    } catch (err) {
      setS("error");
      setM(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <div
      className="rounded-[10px] border p-5"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--color-badge-bg)" }}
          >
            <MessageSquare className="h-5 w-5" style={{ color: "var(--color-badge-text)" }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Twilio
            </p>
            <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              SMS &amp; WhatsApp
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
          style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
        >
          <CheckCircle2 className="h-3 w-3" />
          Active
        </span>
      </div>

      <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
        Send SMS and WhatsApp messages for quote delivery, follow-up reminders, and customer notifications.
      </p>

      {/* Test input */}
      <div className="space-y-3">
        <div>
          <label
            className="block text-[11px] font-medium uppercase tracking-wider mb-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Test phone number
          </label>
          <PhoneInput
            value={phone}
            onChange={(digits) => setPhone(digits)}
            placeholder="(555) 000-0000"
          />
        </div>

        {/* SMS button + feedback */}
        <div className="space-y-1">
          <button
            disabled={!phone.trim() || smsState === "loading"}
            onClick={() => send("sms")}
            className="w-full rounded-md py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
          >
            {smsState === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send Test SMS
          </button>
          {smsMsg && (
            <p
              className="text-[12px] font-medium"
              style={{ color: smsState === "ok" ? "var(--color-success)" : "var(--color-danger)" }}
            >
              {smsState === "ok" ? <CheckCircle2 className="inline h-3 w-3 mr-1" /> : <AlertCircle className="inline h-3 w-3 mr-1" />}
              {smsMsg}
            </p>
          )}
        </div>

        {/* WhatsApp button + feedback */}
        <div className="space-y-1">
          <button
            disabled={!phone.trim() || waState === "loading"}
            onClick={() => send("whatsapp")}
            className="w-full rounded-md py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
          >
            {waState === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send Test WhatsApp
          </button>
          {waMsg && (
            <p
              className="text-[12px] font-medium"
              style={{ color: waState === "ok" ? "var(--color-success)" : "var(--color-danger)" }}
            >
              {waState === "ok" ? <CheckCircle2 className="inline h-3 w-3 mr-1" /> : <AlertCircle className="inline h-3 w-3 mr-1" />}
              {waMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Instantly card ───────────────────────────────────────────────────────────

function InstantlyCard() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function sendTest() {
    setState("loading");
    setMsg("");
    try {
      const res = await fetch("/api/admin/integrations/instantly/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_email: email.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setState("ok");
        setMsg("Email sent — check your inbox.");
      } else {
        setState("error");
        setMsg(data.error ?? "Unknown error");
      }
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <div
      className="rounded-[10px] border p-5"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--color-badge-bg)" }}
          >
            <Mail className="h-5 w-5" style={{ color: "var(--color-badge-text)" }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Instantly AI
            </p>
            <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Email outreach
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
          style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
        >
          <CheckCircle2 className="h-3 w-3" />
          Active
        </span>
      </div>

      <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
        Send quote emails, enroll leads in outreach campaigns, and automate follow-up sequences.
      </p>

      {/* Test input */}
      <div className="space-y-3">
        <div>
          <label
            className="block text-[11px] font-medium uppercase tracking-wider mb-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Test email address
          </label>
          <EmailInput
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <button
            disabled={!email.trim() || state === "loading"}
            onClick={sendTest}
            className="w-full rounded-md py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
          >
            {state === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send Test Email
          </button>
          {msg && (
            <p
              className="text-[12px] font-medium"
              style={{ color: state === "ok" ? "var(--color-success)" : "var(--color-danger)" }}
            >
              {state === "ok" ? <CheckCircle2 className="inline h-3 w-3 mr-1" /> : <AlertCircle className="inline h-3 w-3 mr-1" />}
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function IntegrationsSection() {
  return (
    <div className="space-y-8">
      <div>
        <h2
          className="text-[17px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Integrations
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Connect external services. Use the test buttons to verify each integration is working before using it in production.
        </p>
      </div>

      {/* Live integrations */}
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
          Connected
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TwilioCard />
          <InstantlyCard />
        </div>
      </div>

      {/* Coming soon */}
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-muted)" }}>
          Coming soon
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {COMING_SOON.map(({ id, name, description, icon: Icon, notes }) => (
            <div
              key={id}
              className="rounded-[10px] border p-5"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--color-badge-bg)" }}
                  >
                    <Icon className="h-5 w-5" style={{ color: "var(--color-badge-text)" }} />
                  </div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {name}
                  </p>
                </div>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                  style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
                >
                  <Clock className="h-3 w-3" />
                  Coming soon
                </span>
              </div>

              <p className="text-sm mb-3" style={{ color: "var(--color-text-muted)" }}>
                {description}
              </p>

              <ul className="space-y-1">
                {notes.map((note) => (
                  <li key={note} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-accent)" }} />
                    {note}
                  </li>
                ))}
              </ul>

              <button
                disabled
                className="mt-4 w-full rounded-md py-2 text-sm font-medium opacity-40 cursor-not-allowed"
                style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
              >
                Configure {name}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
