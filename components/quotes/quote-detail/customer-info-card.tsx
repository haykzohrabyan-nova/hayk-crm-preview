import { User, Phone, Mail } from "lucide-react";
import { formatPhone } from "@/lib/utils/phone";

interface CustomerForCard {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_company: string | null;
  customer: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

export function CustomerInfoCard({ ticket }: { ticket: CustomerForCard }) {
  const c = ticket.customer;
  const name = c
    ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
    : ticket.contact_name ?? "";
  const email = c?.email ?? ticket.contact_email ?? "";
  const phone = c?.phone ?? ticket.contact_phone ?? "";
  const company = c?.company ?? ticket.contact_company ?? "";

  return (
    <div
      className="rounded-xl p-5 sticky top-24"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--color-text-muted)" }}>
        Customer
      </h3>
      <div className="space-y-3">
        {name && (
          <div className="flex items-start gap-2">
            <User size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>{name}</p>
              {company && <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{company}</p>}
            </div>
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
        {!name && !email && !phone && (
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>No customer details recorded.</p>
        )}
      </div>
    </div>
  );
}
