"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const DEFAULT_SETTINGS_TAB = "/admin/settings/users";

function cnSubNavLink(active: boolean) {
  return cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2",
    active
      ? "shadow-sm ring-1"
      : "",
  );
}

export function AdminSubNav() {
  const pathname = usePathname();
  const overviewActive = pathname === "/admin";
  const settingsActive = pathname.startsWith("/admin/settings");

  return (
    <nav className="flex flex-wrap gap-1 text-sm" aria-label="Admin sections">
      <Link
        href="/admin"
        className={cnSubNavLink(overviewActive)}
        style={
          overviewActive
            ? {
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
                borderColor: "var(--color-border)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }
            : { color: "var(--color-text-muted)" }
        }
      >
        Overview
      </Link>
      <Link
        href={DEFAULT_SETTINGS_TAB}
        className={cnSubNavLink(settingsActive)}
        style={
          settingsActive
            ? {
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
                borderColor: "var(--color-border)",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }
            : { color: "var(--color-text-muted)" }
        }
      >
        Settings
      </Link>
    </nav>
  );
}
