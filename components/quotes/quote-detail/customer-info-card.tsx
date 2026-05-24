"use client";

import { useEffect, useState } from "react";
import { Phone, Mail, Tag } from "lucide-react";
import { formatPhone } from "@/lib/utils/phone";
import { lookupLabel } from "@/lib/utils/lookups";

interface CustomerForCard {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_company: string | null;
  quote_source?: string | null;
  linked_lead_id?: string | null;
  customer: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
    industry?: string | null;
    website?: string | null;
  } | null;
}

interface LookupOption {
  value: string;
  label: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function CustomerInfoCard({ ticket }: { ticket: CustomerForCard }) {
  const c = ticket.customer;
  const name = c
    ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
    : ticket.contact_name ?? "";
  const email = c?.email ?? ticket.contact_email ?? "";
  const phone = c?.phone ?? ticket.contact_phone ?? "";
  const company = c?.company ?? ticket.contact_company ?? "";
  const industry = c?.industry ?? null;
  const website = c?.website ?? null;
  const showQuoteMeta = !ticket.linked_lead_id && ticket.quote_source;

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

  const industryLabel = lookupLabel(industryLookups, industry, "");
  const sourceLabel = lookupLabel(sourceLookups, ticket.quote_source, "");

  const tags: { key: string; label: string; accent?: boolean }[] = [];
  if (industryLabel) tags.push({ key: "industry", label: industryLabel });
  if (sourceLabel && showQuoteMeta) tags.push({ key: "source", label: sourceLabel, accent: true });

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
        className="px-4 pt-4 pb-3 md:px-5 md:pt-[18px] md:pb-3.5 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--color-text-muted)" }}>
          Customer
        </h3>
      </div>

      <div className="px-4 py-4 md:px-5 md:py-5">
        {name ? (
          <div className="flex items-center gap-3.5 mb-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold shrink-0"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-accent-dark)" }}
            >
              {initials(name)}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{name}</p>
              {company && (
                <p className="text-[13px] truncate mt-0.5" style={{ color: "var(--color-text-muted)" }}>{company}</p>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-2.5 text-[13px] hover:opacity-70 transition-opacity no-underline" style={{ color: "var(--color-text-muted)" }}>
              <Phone size={14} className="shrink-0" />
              <span style={{ color: "var(--color-text-primary)" }}>{formatPhone(phone)}</span>
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-2.5 text-[13px] hover:opacity-70 transition-opacity no-underline break-all" style={{ color: "var(--color-text-muted)" }}>
              <Mail size={14} className="shrink-0" />
              <span style={{ color: "var(--color-tab-active)" }}>{email}</span>
            </a>
          )}
          {showQuoteMeta && sourceLabel && (
            <div className="flex items-center gap-2.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              <Tag size={14} className="shrink-0" />
              <span>via {sourceLabel}</span>
            </div>
          )}
          {website && (
            <a
              href={website.startsWith("http") ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs truncate hover:opacity-70 transition-opacity no-underline"
              style={{ color: "var(--color-tab-active)" }}
            >
              {website}
            </a>
          )}
        </div>

        {!name && !email && !phone && (
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No customer details recorded.</p>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 py-3.5 border-t" style={{ borderColor: "var(--color-border)" }}>
          {tags.map((tag) => (
            <span
              key={tag.key}
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
    </div>
  );
}
