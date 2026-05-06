"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabItem {
  href: string;
  label: string;
  count?: number;
}

const tabs: TabItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export function TabNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex h-11 w-full shrink-0 items-end gap-1 px-6"
      style={{
        backgroundColor: "var(--color-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {tabs.map(({ href, label, count }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className="relative flex h-full items-center gap-1.5 px-3.5 pb-px text-[13px] transition-colors whitespace-nowrap"
            style={{
              color: active
                ? "var(--color-tab-active)"
                : "var(--color-tab-inactive)",
              fontWeight: active ? 500 : 400,
              borderBottom: active
                ? "2px solid var(--color-tab-underline)"
                : "2px solid transparent",
            }}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none"
                style={{
                  backgroundColor: "var(--color-badge-bg)",
                  color: "var(--color-badge-text)",
                }}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
