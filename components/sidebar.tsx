"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { createClient } from "@/lib/supabase/client";
import type { Page } from "@/lib/types";

const ICON_MAP: Record<string, LucideIcon> = {
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
};

const COLLAPSE_KEY = "bazaar-sidebar-collapsed";

type NavSection = {
  section: "main" | "admin" | "bottom";
  pages: Page[];
};

function NavLink({
  page,
  collapsed,
  badge,
}: {
  page: Page;
  collapsed: boolean;
  badge?: number;
}) {
  const pathname = usePathname();
  const Icon = ICON_MAP[page.icon ?? ""] ?? LayoutDashboard;
  const active =
    page.route === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === page.route || pathname.startsWith(page.route + "/");

  return (
    <Link
      href={page.route}
      title={collapsed ? page.display_name : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
        collapsed && "justify-center px-0"
      )}
      style={
        active
          ? {
              backgroundColor: "var(--color-accent)",
              color: "var(--color-btn-primary-text)",
              fontWeight: 500,
            }
          : { color: "rgba(255,255,255,0.65)" }
      }
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor =
            "rgba(255,255,255,0.08)";
          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "";
          (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)";
        }
      }}
    >
      <div className="relative shrink-0">
        <Icon className="h-4 w-4" />
        {/* Collapsed badge — dot on icon */}
        {collapsed && badge && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold"
            style={{ background: "#DC2626", color: "#fff" }}>
            {badge > 99 ? "99" : badge}
          </span>
        )}
      </div>
      {!collapsed && <span className="flex-1 truncate">{page.display_name}</span>}
      {/* Expanded badge — pill at right */}
      {!collapsed && badge && badge > 0 && (
        <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: active ? "rgba(0,0,0,0.2)" : "#DC2626", color: "#fff" }}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState<NavSection[]>([]);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    async function loadNav() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role_id, roles(name)")
        .eq("id", user.id)
        .single();

      const roleName = (profile?.roles as unknown as { name: string } | null)?.name;

      let pages: Page[] = [];

      if (roleName === "admin") {
        // Admin sees all pages
        const { data } = await supabase
          .from("pages")
          .select("*")
          .order("sort_order");
        pages = data ?? [];
      } else {
        // Other roles: fetch pages via role_permissions join
        const { data } = await supabase
          .from("role_permissions")
          .select("pages(*)")
          .eq("role_id", profile!.role_id);
        pages = (data ?? [])
          .map((row: unknown) => (row as { pages: Page }).pages)
          .filter((p): p is Page => p !== null && typeof p === "object")
          .sort((a, b) => a.sort_order - b.sort_order);
      }

      // Only show the top-level /admin link in the sidebar, not sub-pages like
      // /admin/users, /admin/roles, etc. — those are navigated via the /admin card grid.
      const main = pages.filter((p) => p.section === "main");
      const admin = pages.filter(
        (p) => p.section === "admin" && p.route === "/admin"
      );
      const bottom = pages.filter((p) => p.section === "bottom");

      const result: NavSection[] = [];
      if (main.length) result.push({ section: "main", pages: main });
      if (admin.length) result.push({ section: "admin", pages: admin });
      if (bottom.length) result.push({ section: "bottom", pages: bottom });
      setSections(result);
    }
    loadNav();
  }, []);

  // Fetch sidebar badge counts and refresh every 60 seconds
  useEffect(() => {
    function fetchBadges() {
      fetch("/api/sidebar-counts")
        .then((r) => r.json())
        .then((d) => { if (d.counts) setBadgeCounts(d.counts); })
        .catch(() => {});
    }
    fetchBadges();
    const interval = setInterval(fetchBadges, 60_000);
    // Also refresh immediately when any page action fires this event
    window.addEventListener("bazaar:refresh-counts", fetchBadges);
    return () => {
      clearInterval(interval);
      window.removeEventListener("bazaar:refresh-counts", fetchBadges);
    };
  }, []);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, String(next));
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  const utilityButtonClass = cn(
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
    collapsed && "justify-center px-0"
  );

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col transition-all duration-200",
        collapsed ? "w-14" : "w-56"
      )}
      style={{
        backgroundColor: "var(--color-topbar)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Brand */}
      <div
        className="flex h-14 shrink-0 items-center px-3.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        {collapsed ? (
          <span
            className="mx-auto select-none text-xs font-bold tracking-widest"
            style={{ color: "var(--color-accent)" }}
          >
            B
          </span>
        ) : (
          <span
            className="select-none truncate text-[13px] font-semibold"
            style={{ color: "var(--color-accent)", letterSpacing: "0.05em" }}
          >
            BAZAARPRINTING
            <span className="ml-1 text-[11px] font-normal opacity-60">CRM</span>
          </span>
        )}
      </div>

      {/* Nav sections */}
      <nav className="flex flex-1 flex-col overflow-y-auto p-2">
        {sections.map(({ section, pages }, idx) => (
          <div key={section} className={cn("flex flex-col gap-0.5", idx > 0 && "mt-3")}>
            {/* Section label (hidden when collapsed) */}
            {!collapsed && section === "admin" && (
              <p
                className="px-2.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                Admin
              </p>
            )}
            {pages.map((page) => (
              <NavLink
                key={page.id}
                page={page}
                collapsed={collapsed}
                badge={badgeCounts[page.route]}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom utility strip */}
      <div
        className="flex flex-col gap-0.5 p-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={utilityButtonClass}
          style={{ color: "rgba(255,255,255,0.55)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "rgba(255,255,255,0.08)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
          }}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && (
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          )}
        </button>

        <button
          onClick={handleSignOut}
          title={collapsed ? "Sign out" : undefined}
          className={utilityButtonClass}
          style={{ color: "rgba(255,255,255,0.55)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "rgba(255,255,255,0.08)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>

        <button
          onClick={toggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={utilityButtonClass}
          style={{ color: "rgba(255,255,255,0.45)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "rgba(255,255,255,0.08)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
          }}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronLeft className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
