"use client";

import { CreditCard, Smartphone, Clock } from "lucide-react";

const INTEGRATIONS = [
  {
    id: "stripe",
    name: "Stripe",
    description:
      "Accept card payments directly from quotes. Automatically mark tickets as paid when a client pays online. Supports one-time charges and prepayment splits.",
    icon: CreditCard,
    status: "coming_soon",
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
    status: "coming_soon",
    notes: [
      "Display Zelle details on quote PDFs",
      "Manual payment confirmation by rep",
      "Track payment status per ticket",
    ],
  },
];

export function IntegrationsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-[17px] font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Integrations
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Connect external payment processors and services. These integrations are planned and will be configured here when ready.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {INTEGRATIONS.map(({ id, name, description, icon: Icon, notes }) => (
          <div
            key={id}
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
                  <Icon className="h-5 w-5" style={{ color: "var(--color-badge-text)" }} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {name}
                  </p>
                </div>
              </div>

              {/* Coming soon badge */}
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
              >
                <Clock className="h-3 w-3" />
                Coming soon
              </span>
            </div>

            {/* Description */}
            <p className="text-sm mb-3" style={{ color: "var(--color-text-muted)" }}>
              {description}
            </p>

            {/* Planned features */}
            <ul className="space-y-1">
              {notes.map((note) => (
                <li key={note} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-accent)" }} />
                  {note}
                </li>
              ))}
            </ul>

            {/* Disabled button */}
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
  );
}
