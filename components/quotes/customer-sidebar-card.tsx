"use client";

import { User, Phone, Mail, Globe, Building2 } from "lucide-react";
import { formatPhone } from "@/lib/utils/phone";
import { authorityLabel } from "@/lib/utils/authority";

export interface CustomerSidebarCardProps {
  title?: string;
  firstName?: string;
  lastName?: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  authority?: string | null;
}

export function CustomerSidebarCard({
  title = "Customer",
  firstName,
  lastName,
  company,
  phone,
  email,
  website,
  authority,
}: CustomerSidebarCardProps) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const decisionMaker = authorityLabel(authority);
  const websiteHref = website
    ? website.startsWith("http") ? website : `https://${website}`
    : null;

  return (
    <div
      className="rounded-xl p-5 sticky top-24"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-text-muted)" }}>
        {title}
      </h3>
      <div className="space-y-3">
        {fullName && (
          <div className="flex items-start gap-2">
            <User size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{fullName}</p>
          </div>
        )}

        {company && (
          <div className="flex items-start gap-2">
            <Building2 size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>{company}</p>
          </div>
        )}

        {phone && (
          <a href={`tel:${phone}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <Phone size={14} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{formatPhone(phone)}</span>
          </a>
        )}

        {email && (
          <a href={`mailto:${email}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <Mail size={14} style={{ color: "var(--color-text-muted)" }} />
            <span className="text-sm break-all" style={{ color: "var(--color-text-primary)" }}>{email}</span>
          </a>
        )}

        {website && websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
          >
            <Globe size={14} className="shrink-0" style={{ color: "var(--color-text-muted)" }} />
            <span className="text-sm break-all" style={{ color: "var(--color-text-primary)" }}>{website}</span>
          </a>
        )}

        {decisionMaker && (
          <div className="pt-2 border-t space-y-1" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Decision Maker
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>{decisionMaker}</p>
          </div>
        )}

        {!fullName && !phone && !email && !company && (
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No customer details recorded.</p>
        )}
      </div>
    </div>
  );
}
