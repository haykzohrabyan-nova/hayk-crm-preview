"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Phone, Mail, Tag } from "lucide-react";
import { formatPhone } from "@/lib/utils/phone";
import { formatDate } from "@/lib/utils/format";
import { listLeadProductInterestLabels } from "@/lib/utils/format-lead-product-interests";
import { UrgencyPill } from "@/components/ui/urgency-pill";

export interface LinkedLeadInfo {
  id: string;
  urgency: string | null;
  source: string | null;
  sdr_comment: string | null;
  is_returning_customer: boolean;
  interests: Record<string, boolean> | null;
  quantities?: Record<string, string | number> | null;
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
  title?: string;
  productionReleasedAt?: string | null;
  cancelledAt?: string | null;
}

function LinkedLeadStatusFooter({
  dotColor,
  dotRing,
  children,
}: {
  dotColor: string;
  dotRing: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: dotColor, boxShadow: `0 0 0 3px ${dotRing}` }}
      />
      {children}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function LinkedLeadCard({
  lead,
  title = "Linked Lead",
  productionReleasedAt,
  cancelledAt,
}: LinkedLeadCardProps) {
  const customer = lead.customer;
  const fullName = customer
    ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
    : "";

  const interestLabels = listLeadProductInterestLabels(lead.interests, lead.quantities);

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

  const tags: { label: string; accent?: boolean }[] = [];
  if (industryLabel) tags.push({ label: industryLabel });

  return (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "0 1px 3px color-mix(in srgb, var(--color-text-primary) 6%, transparent)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 pt-4 pb-3 md:px-5 md:pt-[18px] md:pb-3.5 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-muted)" }}>
          {title}
        </h3>
        {lead.urgency && lead.urgency !== "Not Defined" && (
          <UrgencyPill urgency={lead.urgency} />
        )}
      </div>

      <div className="px-4 py-4 md:px-5 md:py-5">
        {fullName && (
          <div className="flex items-center gap-3.5 mb-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold shrink-0"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-accent-dark)" }}
            >
              {initials(fullName)}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                {fullName}
              </p>
              {customer?.company && (
                <p className="text-[13px] truncate mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  {customer.company}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {customer?.phone && (
            <a href={`tel:${customer.phone}`} className="flex items-center gap-2.5 text-[13px] hover:opacity-70 transition-opacity no-underline" style={{ color: "var(--color-text-muted)" }}>
              <Phone size={14} className="shrink-0" />
              <span style={{ color: "var(--color-text-primary)" }}>{formatPhone(customer.phone)}</span>
            </a>
          )}
          {customer?.email && (
            <a href={`mailto:${customer.email}`} className="flex items-center gap-2.5 text-[13px] hover:opacity-70 transition-opacity no-underline break-all" style={{ color: "var(--color-text-muted)" }}>
              <Mail size={14} className="shrink-0" />
              <span style={{ color: "var(--color-tab-active)" }}>{customer.email}</span>
            </a>
          )}
          {lead.source && (
            <div className="flex items-center gap-2.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              <Tag size={14} className="shrink-0" />
              <span>via {sourceLabel}</span>
            </div>
          )}
        </div>

        {lead.is_returning_customer && (
          <span
            className="inline-flex mt-3 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--color-success-bg)", color: "var(--color-success)" }}
          >
            Returning Customer
          </span>
        )}

        {lead.sdr_comment && (
          <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)" }}>
              SDR Notes
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{lead.sdr_comment}</p>
          </div>
        )}

        {interestLabels.length > 0 && (
          <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>
              Product Interests
            </p>
            <div className="flex flex-wrap gap-1.5">
              {interestLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium border"
                  style={{
                    background: "var(--color-badge-bg)",
                    borderColor: "var(--color-accent)",
                    color: "var(--color-accent-dark)",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 py-3.5 border-t" style={{ borderColor: "var(--color-border)" }}>
          {tags.map((tag) => (
            <span
              key={tag.label}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-medium border"
              style={{
                background: tag.accent ? "var(--color-badge-bg)" : "var(--color-row-alt)",
                borderColor: tag.accent ? "var(--color-accent)" : "var(--color-border)",
                color: tag.accent ? "var(--color-accent-dark)" : "var(--color-text-muted)",
              }}
            >
              {tag.label}
            </span>
          ))}
        </div>
      )}

      {(productionReleasedAt || cancelledAt) && (
        <div
          className="flex flex-col gap-2.5 px-5 py-3.5 border-t"
          style={{ background: "var(--color-row-alt)", borderColor: "var(--color-border)" }}
        >
          {productionReleasedAt && (
            <LinkedLeadStatusFooter
              dotColor="var(--color-info-text)"
              dotRing="var(--color-info-bg)"
            >
              Production started {formatDate(productionReleasedAt)}
            </LinkedLeadStatusFooter>
          )}
          {cancelledAt && (
            <LinkedLeadStatusFooter
              dotColor="var(--color-danger)"
              dotRing="var(--color-danger-bg)"
            >
              Order cancelled {formatDate(cancelledAt)}
            </LinkedLeadStatusFooter>
          )}
        </div>
      )}
    </div>
  );
}
