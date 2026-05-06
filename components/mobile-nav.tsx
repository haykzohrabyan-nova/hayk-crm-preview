"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  Settings,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Mobile top bar */}
      <header
        className="flex h-14 w-full shrink-0 items-center justify-between px-4 lg:hidden"
        style={{
          backgroundColor: "var(--color-topbar)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <span
          className="text-[13px] font-semibold tracking-widest select-none"
          style={{ color: "var(--color-accent)", letterSpacing: "0.05em" }}
        >
          BAZAARPRINTING
          <span className="ml-1 text-[11px] font-normal opacity-60">CRM</span>
        </span>

        <button
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{ color: "rgba(255,255,255,0.7)" }}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-200 ease-in-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          backgroundColor: "var(--color-topbar)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Drawer header */}
        <div
          className="flex h-14 shrink-0 items-center justify-between px-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span
            className="text-[13px] font-semibold tracking-widest select-none"
            style={{ color: "var(--color-accent)", letterSpacing: "0.05em" }}
          >
            BAZAARPRINTING
            <span className="ml-1 text-[11px] font-normal opacity-60">CRM</span>
          </span>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md"
            style={{ color: "rgba(255,255,255,0.6)" }}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors"
                style={
                  active
                    ? {
                        backgroundColor: "var(--color-accent)",
                        color: "var(--color-btn-primary-text)",
                        fontWeight: 500,
                      }
                    : {
                        color: "rgba(255,255,255,0.65)",
                      }
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom utility strip */}
        <div
          className="flex flex-col gap-0.5 p-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] w-full transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" />
            )}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>

          <button
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] w-full transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
