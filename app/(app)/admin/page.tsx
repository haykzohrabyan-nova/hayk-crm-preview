import Link from "next/link";
import { Users, KeyRound, ListFilter, Building2, Package, Plug } from "lucide-react";
import { SpecBadge } from "@/components/ui/spec-preview";

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
    description: "Edit sources, industries, hold reasons, reject reasons, and other dropdown lists used in lead forms.",
    href: "/admin/settings/dropdowns",
    icon: ListFilter,
    built: false,
  },
  {
    title: "Company Info",
    description: "Company name, address, logo, and contact details used in PDF headers and quote documents.",
    href: "/admin/settings/company",
    icon: Building2,
    built: false,
  },
  {
    title: "Products",
    description: "Product types, materials, and finishes available in the Ticket Builder order line items.",
    href: "/admin/settings/products",
    icon: Package,
    built: false,
  },
  {
    title: "Integrations",
    description: "Connect payment processors and external services. Stripe (card payments) and Zelle integration — coming soon.",
    href: "/admin/settings/integrations",
    icon: Plug,
    built: false,
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
                {!built && <SpecBadge label="Planned" />}
              </div>
              <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
                {description}
              </p>
              <span
                className="text-sm font-medium group-hover:underline"
                style={{ color: built ? "var(--color-tab-active)" : "var(--color-text-muted)" }}
              >
                {built ? "Open →" : "View spec →"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
