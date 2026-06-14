"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, KeyRound, ListFilter, Building2, Package, Plug, CreditCard, MessageSquare, Mail, ArrowUpDown, Webhook, UserRoundPlus, PackagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Users",               href: "/admin/settings/users",     icon: Users     },
  { label: "Roles & Permissions", href: "/admin/settings/roles",     icon: KeyRound  },
  { label: "Dropdown Options",    href: "/admin/settings/dropdowns", icon: ListFilter },
  { label: "Company Info",        href: "/admin/settings/company",   icon: Building2 },
  { label: "Products",            href: "/admin/settings/products",      icon: Package   },
  { label: "Integrations",        href: "/admin/settings/integrations",  icon: Plug           },
  { label: "SMS Templates",       href: "/admin/settings/sms-templates", icon: MessageSquare  },
  { label: "Email Templates",     href: "/admin/settings/email-templates", icon: Mail         },
  { label: "Payment",             href: "/admin/settings/payment",       icon: CreditCard     },
  { label: "Lead import",         href: "/admin/settings/import-export",    icon: ArrowUpDown    },
  { label: "Customer import",     href: "/admin/settings/customer-import", icon: UserRoundPlus  },
  { label: "Order import",        href: "/admin/settings/order-import",     icon: PackagePlus    },
  { label: "Webhook",             href: "/admin/settings/webhook",          icon: Webhook        },
] as const;

function cnTab(active: boolean) {
  return cn(
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-[color,background-color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2",
    active ? "shadow-sm" : "",
  );
}

export function SettingsTabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 pb-5" aria-label="Settings sections">
      {TABS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cnTab(active)}
            style={
              active
                ? {
                    background: "var(--color-btn-verify-bg)",
                    color: "var(--color-btn-verify-text)",
                  }
                : {
                    background: "color-mix(in srgb, var(--color-border) 40%, transparent)",
                    color: "var(--color-text-muted)",
                  }
            }
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background =
                  "color-mix(in srgb, var(--color-border) 70%, transparent)";
                (e.currentTarget as HTMLElement).style.color = "var(--color-text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background =
                  "color-mix(in srgb, var(--color-border) 40%, transparent)";
                (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
              }
            }}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
