"use client";

import { useEffect, useState } from "react";
import { CreditCard, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import Link from "next/link";

interface KpiCard {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  accent?: boolean;
}

interface Counts {
  pending_evidence: number;
  orders_in_production: number;
  completed_this_month: number;
}

export function AccountantDashboard() {
  const [counts, setCounts]   = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/payments/counts")
      .then((r) => r.json())
      .then((d) => {
        if (d.counts) setCounts(d.counts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const cards: KpiCard[] = [
    {
      label:  "Pending Evidence Review",
      value:  loading ? "—" : (counts?.pending_evidence ?? 0),
      sub:    "Orders awaiting payment confirmation",
      icon:   <Clock size={18} />,
      accent: true,
    },
    {
      label: "In Production",
      value: loading ? "—" : (counts?.orders_in_production ?? 0),
      sub:   "Orders currently in production",
      icon:  <TrendingUp size={18} />,
    },
    {
      label: "Completed This Month",
      value: loading ? "—" : (counts?.completed_this_month ?? 0),
      sub:   "Orders completed this month",
      icon:  <CheckCircle2 size={18} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Payments Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Review payment evidence and confirm orders for production.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-[10px] border p-5"
            style={{
              background:   "var(--color-surface)",
              borderColor:  card.accent ? "var(--color-accent)" : "var(--color-border)",
              borderWidth:  card.accent ? 2 : 1,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)", letterSpacing: "0.06em" }}>
                {card.label}
              </span>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-[8px]"
                style={{ background: card.accent ? "var(--color-badge-bg)" : "var(--color-row-alt)", color: card.accent ? "var(--color-accent)" : "var(--color-text-muted)" }}
              >
                {card.icon}
              </span>
            </div>
            <div className="text-3xl font-semibold" style={{ color: card.accent ? "var(--color-accent)" : "var(--color-text-primary)" }}>
              {card.value}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick action */}
      {counts && counts.pending_evidence > 0 && (
        <div
          className="rounded-[10px] border p-5 flex items-center justify-between gap-4"
          style={{ background: "var(--color-badge-bg)", borderColor: "var(--color-accent)" }}
        >
          <div className="flex items-center gap-3">
            <CreditCard size={20} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--color-badge-text)" }}>
                {counts.pending_evidence} order{counts.pending_evidence !== 1 ? "s" : ""} awaiting payment review
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Review uploaded evidence and record confirmed payments to release orders to production.
              </div>
            </div>
          </div>
          <Link
            href="/payments"
            className="shrink-0 rounded-[6px] px-4 py-2 text-sm font-medium"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)", textDecoration: "none" }}
          >
            Review Now
          </Link>
        </div>
      )}
    </div>
  );
}
