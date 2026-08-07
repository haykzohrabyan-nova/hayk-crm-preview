"use client";

// "Log a lead" — a manager's manual front door to /api/leads/ingest. Lets you
// simulate an inbound from any channel and watch the intake brain route it:
//   • warm lead   -> a follow-up task lands on the assigned rep
//   • known customer -> an "Answer …" task lands on the customer's owner
//   • brand-new   -> it appears here in the Inbox to be claimed
// Kept deliberately simple; reuses the shared ui primitives.

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CHANNELS: { value: string; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "sms", label: "SMS" },
  { value: "ig_dm", label: "Instagram DM" },
  { value: "webform", label: "Web form" },
  { value: "ad_lead", label: "Ad lead" },
  { value: "walk_in", label: "Walk-in" },
];

type Result = { status: string; owner?: string; auto?: Record<string, unknown> };

export function LogLeadDialog({ onLogged }: { onLogged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [channel, setChannel] = useState("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setCompany("");
    setMessage("");
    setChannel("email");
    setResult(null);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/leads/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          // A unique source_id per submission so the RPC's (source, source_id)
          // dedupe never suppresses a fresh manual test.
          source: "manual_inbox",
          source_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel,
          name: name || undefined,
          email: email || undefined,
          phone: phone || undefined,
          company: company || undefined,
          message: message || undefined,
          subject: message ? message.slice(0, 80) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not log the lead.");
        return;
      }
      setResult(data as Result);
      onLogged(); // refresh the inbox list behind the dialog
    } catch {
      setError("Could not log the lead.");
    } finally {
      setBusy(false);
    }
  }

  const routedLine = result ? describe(result) : null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Log a lead
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Log a lead</DialogTitle>
            <DialogDescription>
              Simulate an inbound from any channel and watch it route.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
              Channel
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="h-9 rounded-[8px] border px-2 text-[13px] outline-none"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </Field>
              <Field label="Company">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Co" />
              </Field>
              <Field label="Email">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" type="email" />
              </Field>
              <Field label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(818) 555-0100" />
              </Field>
            </div>

            <Field label="Message">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Looking for a quote on 1,000 gloss labels…"
                className="rounded-[8px] border px-2.5 py-2 text-[13px] outline-none"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              />
            </Field>

            {error && (
              <p className="text-[12px] font-medium" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}
            {routedLine && (
              <div
                className="rounded-[8px] border px-3 py-2 text-[12px]"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}
              >
                {routedLine}
              </div>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button size="sm" onClick={submit} disabled={busy || (!email && !phone && !name)}>
                {busy ? "Routing…" : "Log lead"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>
      {label}
      {children}
    </label>
  );
}

// Plain-English "here's what happened" line from the ingest response.
function describe(r: Result): string {
  const a = (r.auto ?? {}) as Record<string, boolean>;
  const extras: string[] = [];
  if (a.lead_followup_task) extras.push("follow-up task on the rep");
  if (a.account_answer_task) extras.push("answer task on the owner");
  if (a.deal_created) extras.push("a deal");
  if (a.deal_task_created) extras.push("a deal task");
  const tail = extras.length ? ` Created: ${extras.join(", ")}.` : "";
  switch (r.status) {
    case "warm_lead":
      return `Warm lead — auto-assigned to a rep.${tail}`;
    case "account_message":
      return `Known customer — logged to their account.${tail}`;
    case "team_lead_new":
      return "Brand-new lead — waiting in the Inbox to be claimed.";
    case "team_lead_known":
      return "New lead at a known company — waiting in the Inbox to be claimed.";
    case "duplicate":
      return "Duplicate — this inbound was already logged.";
    case "existing_contact_logged":
      return "Existing contact — logged, no action needed.";
    case "internal_identity_suppressed":
      return "Suppressed — that identity is on the internal registry.";
    case "identity_review":
      return "Needs identity review — email and phone point to different people.";
    default:
      return `Routed: ${r.status}.`;
  }
}
