"use client";

import { ExternalLink } from "lucide-react";
import { stripePaymentDashboardUrl } from "@/lib/stripe/dashboard-url";
import { OpenInStripeLink } from "@/components/ui/open-in-stripe-link";

export interface StripeEvidenceFields {
  stripe_payment_intent_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_charge_id?: string | null;
  stripe_card_brand?: string | null;
  stripe_card_last4?: string | null;
  stripe_receipt_url?: string | null;
  stripe_customer_email?: string | null;
  stripe_amount_cents?: number | null;
  stripe_payment_status?: string | null;
  stripe_amount_refunded_cents?: number | null;
  stripe_last_refunded_at?: string | null;
}

function formatCard(brand: string | null | undefined, last4: string | null | undefined): string {
  if (!brand && !last4) return "—";
  const b = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card";
  return last4 ? `${b} •••• ${last4}` : b;
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function IdRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4 text-xs">
      <span
        className="uppercase tracking-wide font-medium shrink-0"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[11px] break-all text-right"
        style={{ color: "var(--color-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function StripeEvidencePanel({ ticket }: { ticket: StripeEvidenceFields }) {
  if (!ticket.stripe_payment_intent_id) return null;

  const dashboardUrl = stripePaymentDashboardUrl(ticket.stripe_payment_intent_id);

  return (
    <div
      className="rounded-[10px] border p-4 space-y-3"
      style={{
        background: "var(--color-info-bg)",
        borderColor: "var(--color-info-border)",
      }}
    >
      <div className="text-[13px] font-medium" style={{ color: "var(--color-info-text-deep)" }}>
        Stripe card payment
      </div>
      <div className="space-y-2">
        <IdRow label="Amount charged" value={formatCents(ticket.stripe_amount_cents)} />
        {(ticket.stripe_amount_refunded_cents ?? 0) > 0 && (
          <IdRow label="Refunded" value={formatCents(ticket.stripe_amount_refunded_cents)} />
        )}
        <IdRow label="Card" value={formatCard(ticket.stripe_card_brand, ticket.stripe_card_last4)} />
        <IdRow label="Status" value={ticket.stripe_payment_status ?? undefined} />
        <IdRow label="Email" value={ticket.stripe_customer_email ?? undefined} />
        <IdRow label="Payment Intent" value={ticket.stripe_payment_intent_id} />
        <IdRow label="Checkout Session" value={ticket.stripe_checkout_session_id} />
        <IdRow label="Charge" value={ticket.stripe_charge_id} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {ticket.stripe_receipt_url && (
          <a
            href={ticket.stripe_receipt_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-primary)",
              background: "var(--color-surface)",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={14} />
            Receipt
          </a>
        )}
        <OpenInStripeLink href={dashboardUrl} />
      </div>
    </div>
  );
}
