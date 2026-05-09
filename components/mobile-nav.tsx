"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  LayoutDashboard,
  Inbox,
  Briefcase,
  BookUser,
  FileText,
  BarChart3,
  Settings,
  ShieldCheck,
  Users,
  KeyRound,
  ListFilter,
  Megaphone,
  ClipboardList,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/client";
import type { Page } from "@/lib/types";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Inbox, Briefcase, BookUser, FileText, BarChart3,
  Settings, ShieldCheck, Users, KeyRound, ListFilter, Megaphone, ClipboardList, Bell,
};

function roleLabel(name: string | undefined): string {
  if (name === "admin") return "Administrator";
  if (name === "sales") return "Sales Rep";
  if (name === "sdr") return "SDR";
  return name ?? "";
}

export function MobileNav() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [userRoleName, setUserRoleName] = useState<string | undefined>(undefined);

  // Load role-based nav pages (same logic as Sidebar)
  useEffect(() => {
    async function loadNav() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role_id, full_name, roles(name)")
        .eq("id", user.id)
        .single();

      const roleName = (profile?.roles as unknown as { name: string } | null)?.name;
      setUserFullName(profile?.full_name ?? null);
      setUserRoleName(roleName);
      let allPages: Page[] = [];

      if (roleName === "admin") {
        const { data } = await supabase.from("pages").select("*").order("sort_order");
        allPages = data ?? [];
      } else {
        const { data } = await supabase
          .from("role_permissions")
          .select("pages(*)")
          .eq("role_id", profile!.role_id);
        allPages = (data ?? [])
          .map((row: unknown) => (row as { pages: Page }).pages)
          .filter((p): p is Page => p !== null && typeof p === "object")
          .sort((a, b) => a.sort_order - b.sort_order);
      }

      // Mirror sidebar exactly: main + bottom sections, plus only the top-level
      // /admin link. Pages with section='admin-sub' are internal sub-pages
      // navigated via the /admin tab layout — never shown in nav.
      setPages(
        allPages.filter(
          (p) =>
            p.section === "main" ||
            p.section === "bottom" ||
            (p.section === "admin" && p.route === "/admin")
        )
      );
    }
    loadNav();
  }, []);

  // Fetch badge counts
  useEffect(() => {
    function fetchBadges() {
      fetch("/api/sidebar-counts")
        .then((r) => r.json())
        .then((d) => { if (d.counts) setBadgeCounts(d.counts); })
        .catch(() => {});
    }
    fetchBadges();
    window.addEventListener("bazaar:refresh-counts", fetchBadges);
    return () => window.removeEventListener("bazaar:refresh-counts", fetchBadges);
  }, []);

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

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
          className="text-[13px] font-semibold select-none"
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-200 ease-in-out lg:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
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
            className="text-[13px] font-semibold select-none"
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

        {/* User profile card */}
        <div className="shrink-0 px-2 pt-2">
          <Link
            href="/profile"
            className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors"
            style={{ color: "rgba(255,255,255,0.85)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
              style={{ background: "var(--color-accent)", color: "var(--color-btn-primary-text)" }}
            >
              {userFullName?.trim()[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
                {userFullName ?? "—"}
              </p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                {roleLabel(userRoleName)}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
          </Link>
          <div className="mt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />
        </div>

        {/* Nav items — role-based, same as sidebar */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {pages.map((page) => {
            const Icon = ICON_MAP[page.icon ?? ""] ?? LayoutDashboard;
            const active =
              page.route === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === page.route || pathname.startsWith(page.route + "/");
            const badge = badgeCounts[page.route];

            return (
              <Link
                key={page.id}
                href={page.route}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors"
                style={
                  active
                    ? { backgroundColor: "var(--color-accent)", color: "var(--color-btn-primary-text)", fontWeight: 500 }
                    : { color: "rgba(255,255,255,0.65)" }
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{page.display_name}</span>
                {badge && badge > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 text-[10px] font-bold"
                    style={{
                      background: active ? "rgba(0,0,0,0.2)" : "var(--color-danger)",
                      color: "#fff",
                    }}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom strip */}
        <div
          className="flex flex-col gap-0.5 p-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] w-full transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>

          <button
            onClick={handleSignOut}
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
