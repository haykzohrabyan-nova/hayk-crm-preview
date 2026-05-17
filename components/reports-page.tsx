"use client";

import { BarChart3, TrendingUp, DollarSign, Users, Award, Clock, ArrowRight } from "lucide-react";

const PLANNED_REPORTS = [
  {
    icon: <DollarSign className="h-5 w-5" />,
    title: "Revenue Over Time",
    description:
      "Monthly and quarterly revenue bar chart. See how income is trending and compare periods side by side.",
    dependency: "Requires Stripe payment data",
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: "Pipeline Forecast",
    description:
      "Based on your current open quotes and historical win rate, project how much revenue is likely to close this month.",
    dependency: "Requires Stripe payment data",
  },
  {
    icon: <Award className="h-5 w-5" />,
    title: "Win Rate & Close Time",
    description:
      "What percentage of leads convert to orders, and how many days does it take on average from routed to won.",
    dependency: "Available now — no payment data needed",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Rep Scorecards",
    description:
      "Per-rep breakdown: leads handled, quotes sent, orders closed, average deal value. Side-by-side comparison for team reviews.",
    dependency: "Requires Stripe payment data",
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Revenue by Product Type",
    description:
      "Which products (business cards, banners, stickers, etc.) bring in the most revenue. Prioritise your sales effort.",
    dependency: "Requires Stripe payment data",
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Revenue by Lead Source",
    description:
      "Walk-in, referral, Instagram, Google — which channels bring the highest-value customers.",
    dependency: "Requires Stripe payment data",
  },
  {
    icon: <Clock className="h-5 w-5" />,
    title: "Quote-to-Order Conversion Funnel",
    description:
      "Of all quotes sent, how many become orders? Where do deals fall off? Improve your follow-up process.",
    dependency: "Requires Stripe payment data",
  },
];

export function ReportsPage() {
  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Reports
        </h1>
      </div>

      {/* Coming Soon Banner */}
      <div
        className="rounded-[12px] p-6 flex flex-col sm:flex-row items-start gap-5"
        style={{ background: "var(--color-btn-verify-bg)", border: "1px solid transparent" }}
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <BarChart3 className="h-6 w-6" style={{ color: "var(--color-btn-verify-text)" }} />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold mb-1" style={{ color: "var(--color-btn-verify-text)" }}>
            Reports — Coming After Payment Processing
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-btn-verify-text)", opacity: 0.75 }}>
            Full reporting charts will be built once Stripe is connected. Revenue figures need to reflect
            actual payments received — not just quote totals — so every chart tells the real story.
            The page structure, routing, and data APIs are already planned.
          </p>
          <div
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full px-3 py-1"
            style={{ background: "rgba(255,255,255,0.15)", color: "var(--color-btn-verify-text)" }}
          >
            <span className="h-2 w-2 rounded-full bg-current opacity-75" />
            Priority: After Stripe integration
          </div>
        </div>
      </div>

      {/* Planned reports grid */}
      <div>
        <h2
          className="mb-4 text-[13px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Planned Reports
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLANNED_REPORTS.map((r) => (
            <div
              key={r.title}
              className="rounded-[10px] border p-5 flex flex-col gap-3"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]"
                  style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }}
                >
                  <span style={{ color: "var(--color-accent)" }}>{r.icon}</span>
                </div>
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {r.title}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                    {r.description}
                  </p>
                </div>
              </div>
              <div
                className="mt-auto flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 self-start"
                style={{
                  background: r.dependency.startsWith("Available")
                    ? "color-mix(in srgb, var(--color-success) 12%, transparent)"
                    : "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                  color: r.dependency.startsWith("Available")
                    ? "var(--color-success)"
                    : "var(--color-warning)",
                }}
              >
                {r.dependency.startsWith("Available") ? "✓" : "⏳"} {r.dependency}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What's available now */}
      <div
        className="rounded-[10px] border p-5"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
          What's available right now
        </p>
        <p className="text-[13px] mb-4" style={{ color: "var(--color-text-muted)" }}>
          While this page is being built, the Admin Dashboard already shows live KPI cards — total
          revenue, leads, won deals, pipeline value, active users, and SDR performance.
        </p>
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-[6px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
          style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
        >
          Go to Dashboard
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

    </div>
  );
}
