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
  MessageSquareQuote,
  Bell,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/layout/theme-provider";
import { createClient } from "@/lib/supabase/client";
import { revokeMfaTrustOnSignOut } from "@/lib/auth/remember-mfa-client";
import { filterPagesForRole } from "@/lib/auth/admin-only-pages";
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
  MessageSquareQuote,
  Bell,
};

const COLLAPSE_KEY = "bazaar-sidebar-collapsed";

type NavSection = {
  section: "main" | "admin" | "bottom";
  pages: Page[];
};

// Role-specific display name overrides for the /dashboard page
const DASHBOARD_ROLE_LABELS: Record<string, string> = {
  admin:      "Admin Dashboard",
  sales:      "Sales Dashboard",
  sdr:        "SDR Dashboard",
  accountant: "Accountant Dashboard",
};

function NavLink({
  page,
  collapsed,
  badge,
  roleName,
}: {
  page: Page;
  collapsed: boolean;
  badge?: number;
  roleName?: string;
}) {
  const pathname = usePathname();
  const Icon = ICON_MAP[page.icon ?? ""] ?? LayoutDashboard;
  const active =
    page.route === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === page.route || pathname.startsWith(page.route + "/");

  const displayLabel =
    page.route === "/dashboard" && roleName && DASHBOARD_ROLE_LABELS[roleName]
      ? DASHBOARD_ROLE_LABELS[roleName]
      : page.display_name;

  return (
    <Link
      href={page.route}
      title={collapsed ? displayLabel : undefined}
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
            style={{ background: "var(--color-danger)", color: "var(--color-text-inverse)" }}>
            {badge > 99 ? "99" : badge}
          </span>
        )}
      </div>
      {!collapsed && <span className="flex-1 truncate">{displayLabel}</span>}
      {/* Expanded badge — pill at right */}
      {!collapsed && badge && badge > 0 && (
        <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: active ? "rgba(0,0,0,0.2)" : "var(--color-danger)", color: "var(--color-text-inverse)" }}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function roleLabel(name: string | undefined): string {
  if (name === "admin")      return "Administrator";
  if (name === "sales")      return "Sales Rep";
  if (name === "sdr")        return "SDR";
  if (name === "accountant") return "Accountant";
  return name ?? "";
}

export function Sidebar() {
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState<NavSection[]>([]);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [userRoleName, setUserRoleName] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);

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
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role_id, full_name, roles(name)")
        .eq("id", user.id)
        .single();

      const roleName = (profile?.roles as unknown as { name: string } | null)?.name;
      setUserFullName(profile?.full_name ?? null);
      setUserRoleName(roleName);

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
        pages = filterPagesForRole(
          (data ?? [])
            .map((row: unknown) => (row as { pages: Page }).pages)
            .filter((p): p is Page => p !== null && typeof p === "object")
            .sort((a, b) => a.sort_order - b.sort_order),
          roleName,
        );
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

  // Fetch sidebar badge counts — scoped to visible nav routes only.
  useEffect(() => {
    const visibleRoutes = sections.flatMap((s) => s.pages.map((p) => p.route));
    if (visibleRoutes.length === 0) return;

    function fetchBadges() {
      const routes = encodeURIComponent(visibleRoutes.join(","));
      fetch(`/api/sidebar-counts?routes=${routes}`)
        .then((r) => r.json())
        .then((d) => { if (d.counts) setBadgeCounts(d.counts); })
        .catch(() => {});
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function debouncedFetchBadges() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchBadges, 300);
    }

    fetchBadges();
    window.addEventListener("bazaar:refresh-counts", debouncedFetchBadges);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("bazaar:refresh-counts", debouncedFetchBadges);
    };
  }, [sections]);

  // Realtime subscriptions — badge refresh via bazaar:refresh-counts event.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;

      if (!session) {
        console.log("[Realtime] no session — skipping channel setup");
        return;
      }

      console.log("[Realtime] session ready, opening channels uid=", session.user.id);

      const leadsChannel = supabase
        .channel("leads-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "leads" },
          (payload) => {
            console.log("[Realtime] leads event:", payload.eventType, payload);
            window.dispatchEvent(new Event("bazaar:refresh-counts"));
            window.dispatchEvent(new Event("bazaar:leads-changed"));
          }
        )
        .subscribe((status, err) => {
          console.log("[Realtime] leads-realtime status:", status, err ?? "");
        });

      const ticketsChannel = supabase
        .channel("tickets-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "job_tickets" },
          (payload) => {
            console.log("[Realtime] tickets event:", payload.eventType, payload);
            window.dispatchEvent(new Event("bazaar:refresh-counts"));
            window.dispatchEvent(new Event("bazaar:tickets-changed"));
          }
        )
        .subscribe((status, err) => {
          console.log("[Realtime] tickets-realtime status:", status, err ?? "");
        });

      const activitiesChannel = supabase
        .channel("activities-realtime")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "activities" },
          (payload) => {
            console.log("[Realtime] activities event:", payload);
            window.dispatchEvent(new Event("bazaar:activities-changed"));
            // Ticket/lead activity (e.g. routed quote claimed) — other Sales users
            // often cannot receive job_tickets Realtime (RLS hides row after claim).
            const row = payload.new as { ticket_id?: string | null; lead_id?: string | null };
            if (row.ticket_id || row.lead_id) {
              window.dispatchEvent(new Event("bazaar:refresh-counts"));
              window.dispatchEvent(new Event("bazaar:tickets-changed"));
            }
          }
        )
        .subscribe((status, err) => {
          console.log("[Realtime] activities-realtime status:", status, err ?? "");
        });

      const customersChannel = supabase
        .channel("customers-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "customers" },
          (payload) => {
            console.log("[Realtime] customers event:", payload.eventType, payload);
            window.dispatchEvent(new Event("bazaar:customers-changed"));
          }
        )
        .subscribe((status, err) => {
          console.log("[Realtime] customers-realtime status:", status, err ?? "");
        });

      (supabase as unknown as Record<string, unknown>)["_sidebarLeadsCh"] = leadsChannel;
      (supabase as unknown as Record<string, unknown>)["_sidebarTicketsCh"] = ticketsChannel;
      (supabase as unknown as Record<string, unknown>)["_sidebarActivitiesCh"] = activitiesChannel;
      (supabase as unknown as Record<string, unknown>)["_sidebarCustomersCh"] = customersChannel;
    });

    return () => {
      cancelled = true;
      const refs = supabase as unknown as Record<string, unknown>;
      if (refs["_sidebarLeadsCh"]) {
        supabase.removeChannel(refs["_sidebarLeadsCh"] as Parameters<typeof supabase.removeChannel>[0]);
        delete refs["_sidebarLeadsCh"];
      }
      if (refs["_sidebarTicketsCh"]) {
        supabase.removeChannel(refs["_sidebarTicketsCh"] as Parameters<typeof supabase.removeChannel>[0]);
        delete refs["_sidebarTicketsCh"];
      }
      if (refs["_sidebarActivitiesCh"]) {
        supabase.removeChannel(refs["_sidebarActivitiesCh"] as Parameters<typeof supabase.removeChannel>[0]);
        delete refs["_sidebarActivitiesCh"];
      }
      if (refs["_sidebarCustomersCh"]) {
        supabase.removeChannel(refs["_sidebarCustomersCh"] as Parameters<typeof supabase.removeChannel>[0]);
        delete refs["_sidebarCustomersCh"];
      }
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
    try {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", reason: "manual", user_id: userId }),
      });
    } catch {
      // best-effort — never block sign-out
    }
    await revokeMfaTrustOnSignOut();
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

      {/* User profile card */}
      <div className="shrink-0 px-2 pt-2">
        <Link
          href="/profile"
          className="group flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors"
          style={{ color: "rgba(255,255,255,0.85)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
          }}
          title={collapsed ? (userFullName ?? "My Profile") : undefined}
        >
          {/* Avatar circle */}
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
            style={{ background: "var(--color-accent)", color: "var(--color-btn-primary-text)" }}
          >
            {userFullName?.trim()[0]?.toUpperCase() ?? "?"}
          </div>
          {/* Name + role — hidden when collapsed */}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
                {userFullName ?? "—"}
              </p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                {roleLabel(userRoleName)}
              </p>
            </div>
          )}
          {!collapsed && (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "rgba(255,255,255,0.35)" }} />
          )}
        </Link>
        {/* Divider */}
        <div className="mt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />
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
                roleName={userRoleName}
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
