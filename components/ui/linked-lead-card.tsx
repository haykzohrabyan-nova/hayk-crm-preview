"use client";

import { useEffect, useState } from "react";
import { User, Phone, Mail, Tag } from "lucide-react";
import { formatPhone } from "@/lib/utils/phone";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LinkedLeadInfo {
  id: string;
  urgency: string | null;
  source: string | null;
  initial_interest: string | null;
  sdr_comment: string | null;
  is_returning_customer: boolean;
  interests: Record<string, boolean> | null;
  customer: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
    industry: string | null;
  } | null;
}

interface LookupOption { value: string; label: string; }

interface LinkedLeadCardProps {
  lead: LinkedLeadInfo;
  /** Display title — defaults to "Linked Lead" */
  title?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LinkedLeadCard({ lead, title = "Linked Lead" }: LinkedLeadCardProps) {
  const customer = lead.customer;
  const fullName = customer
    ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
    : "";

  const interestItems = Object.entries(lead.interests ?? {})
    .filter(([, v]) => v)
    .map(([key]) => key);

  // Fetch source + industry labels from lookups
  const [sourceLookups, setSourceLookups] = useState<LookupOption[]>([]);
  const [industryLookups, setIndustryLookups] = useState<LookupOption[]>([]);

  useEffect(() => {
    fetch("/api/lookups?categories=source,industry")
      .then((r) => r.json())
      .then((d) => {
        setSourceLookups(d.source ?? []);
        setIndustryLookups(d.industry ?? []);
      })
      .catch(() => {});
  }, []);

  const sourceLabel = sourceLookups.find((s) => s.value === lead.source)?.label ?? lead.source;
  const industryLabel = industryLookups.find((i) => i.value === customer?.industry)?.label ?? customer?.industry;

  return (
    <div
      className="rounded-xl p-5 sticky top-24"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
          {title}
        </h3>
        {lead.urgency && lead.urgency !== "Not Defined" && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
            style={{
              background:
                lead.urgency === "High" ? "var(--color-danger-bg)"
                : lead.urgency === "Medium" ? "var(--color-warning-bg)"
                : "var(--color-success-bg)",
              color:
                lead.urgency === "High" ? "var(--color-danger)"
                : lead.urgency === "Medium" ? "var(--color-warning)"
                : "var(--color-success)",
            }}
          >
            {lead.urgency}
          </span>
        )}
      </div>

      <div className="space-y-3">

        {/* Name + company + industry */}
        {fullName && (
          <div className="flex items-start gap-2">
            <User size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{fullName}</p>
              {customer?.company && (
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{customer.company}</p>
              )}
              {industryLabel && (
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{industryLabel}</p>
              )}
            </div>
          </div>
        )}

        {/* Returning customer badge */}
        {lead.is_returning_customer && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
          >
            Returning Customer
          </span>
        )}

        {/* Phone */}
        {customer?.phone && (
          <a href={`tel:${customer.phone}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <Phone size={14} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
              {formatPhone(customer.phone)}
            </span>
          </a>
        )}

        {/* Email */}
        {customer?.email && (
          <a href={`mailto:${customer.email}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <Mail size={14} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-sm break-all" style={{ color: "var(--color-text-primary)" }}>{customer.email}</span>
          </a>
        )}

        {/* Source */}
        {lead.source && (
          <div className="flex items-center gap-2">
            <Tag size={14} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>via {sourceLabel}</span>
          </div>
        )}

        {/* Initial interest */}
        {lead.initial_interest && (
          <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
              What they need
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>{lead.initial_interest}</p>
          </div>
        )}

        {/* Product interests */}
        {interestItems.length > 0 && (
          <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-text-muted)" }}>
              Product Interests
            </p>
            <ul className="space-y-1">
              {interestItems.map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-text-primary)" }}>
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--color-accent)" }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SDR notes */}
        {lead.sdr_comment && (
          <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
              SDR Notes
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{lead.sdr_comment}</p>
          </div>
        )}

      </div>
    </div>
  );
}
