import Link from "next/link";
import { Users, KeyRound, ListFilter, Building2, Package, Plug, CreditCard, MessageSquare, Mail } from "lucide-react";

const CARDS = [
  {
    title: "Users",
    description: "Create, edit, and deactivate team members. Assign roles and reset passwords.",
    href: "/admin/settings/users",
    icon: Users,
    built: true,
  },
  {
    title: "Roles & Permissions",
    description: "Role definitions and page-level access control per role.",
    href: "/admin/settings/roles",
    icon: KeyRound,
    built: true,
  },
  {
    title: "Dropdown Options",
    description: "Edit sources, industries, hold reasons, reject reasons, and all dropdown lists used in lead forms and order/quote builder.",
    href: "/admin/settings/dropdowns",
    icon: ListFilter,
    built: true,
  },
  {
    title: "Company Info",
    description: "Company name, address, logo, and contact details used in PDF headers and quote documents. Also sets tax rate, rush surcharge, and high-value threshold.",
    href: "/admin/settings/company",
    icon: Building2,
    built: true,
  },
  {
    title: "Products",
    description: "Product types, materials, and material–product links for the line-item builder.",
    href: "/admin/settings/products",
    icon: Package,
    built: true,
  },
  {
    title: "Integrations",
    description: "Twilio SMS and Instantly AI email are live. Stripe and Zelle payment integrations — coming soon.",
    href: "/admin/settings/integrations",
    icon: Plug,
    built: true,
  },
  {
    title: "SMS Templates",
    description: "Edit SMS and WhatsApp message text for quotes, payments, invoice links, pickup, and follow-ups.",
    href: "/admin/settings/sms-templates",
    icon: MessageSquare,
    built: true,
  },
  {
    title: "Email Templates",
    description: "Edit customer email subject, body, and button labels for payment and tax-exempt resubmit requests.",
    href: "/admin/settings/email-templates",
    icon: Mail,
    built: true,
  },
  {
    title: "Payment",
    description: "Bank details for Wire and ACH payments, and Zelle contact info. Shown to customers on their quote page.",
    href: "/admin/settings/payment",
    icon: CreditCard,
    built: true,
  },
] as const;

export default function AdminOverviewPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1
          className="text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Admin
        </h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--color-text-muted)" }}>
          Central configuration for all system settings. Each section below matches a tab in Admin → Settings.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map(({ title, description, href, icon: Icon, built }) => (
          <Link
            key={href}
            href={href}
            className="group block rounded-[10px] focus-visible:outline-none focus-visible:ring-2"
            style={{ "--tw-ring-color": "var(--color-accent)" } as React.CSSProperties}
          >
            <div
              className="h-full rounded-[10px] border p-5 transition-shadow group-hover:shadow-md"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Icon
                    className="h-5 w-5 shrink-0"
                    style={{ color: built ? "var(--color-accent)" : "var(--color-text-muted)" }}
                    aria-hidden
                  />
                  <span
                    className="text-[15px] font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {title}
                  </span>
                </div>
                {!built && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" }}
                  >
                    Planned
                  </span>
                )}
              </div>
              <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
                {description}
              </p>
              <span
                className="text-sm font-medium group-hover:underline"
                style={{ color: built ? "var(--color-tab-active)" : "var(--color-text-muted)" }}
              >
                {built ? "Open →" : "Coming soon"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
