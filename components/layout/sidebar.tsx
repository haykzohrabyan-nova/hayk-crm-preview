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
  GitBranch,
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
import { clearTicketFormBootstrapClientCache } from "@/lib/client/ticket-form-bootstrap-cache";
import { useAppSession } from "@/components/layout/app-session-provider";
import type { Page } from "@/lib/types";
import type { NavSection } from "@/lib/auth/nav-sections";
// Hayk 2026-07-02 — preview role picker for the sidebar footer + nav filtering.
import { usePreviewRole, type PreviewRole } from "@/app/(app)/preview/_shared/role";
import { SidebarRolePicker } from "@/app/(app)/preview/_shared/RolePicker";

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
  GitBranch,
};

const COLLAPSE_KEY = "bazaar-sidebar-collapsed";

// Hayk 2026-07-01 — sidebar routes redirected to preview builds while we iterate.
// Real routes untouched — just the sidebar link target changes.
const PREVIEW_ROUTE_OVERRIDES: Record<string, string> = {
  "/dashboard":       "/preview/dashboard-variants",
  "/operations":      "/preview/operations-center",
  "/leads":           "/preview/leads",
  "/sales":           "/preview/sales-pipeline",  // DB route is /sales (see schema.sql)
  "/sales-pipeline":  "/preview/sales-pipeline",  // safety alias
  "/crm":             "/preview/crm",
  "/orders":          "/preview/orders",
  "/quotes":          "/preview/new-quote",
  "/inbox":           "/preview/inbox",
  // Hayk 2026-07-02 — payments preview (Arusyak's view). If a /payments DB
  // Page exists it redirects here; if not, PreviewPaymentsLink adds the entry.
  "/payments":        "/preview/payments",
};

// Hayk 2026-07-01 — Preview-only sidebar link for the unified Inbox hub.
// Real /inbox route doesn't exist yet — this hardcoded entry lives here until
// the DB nav_sections table gets the Inbox page. Slot: between Leads and Sales.
const PREVIEW_INBOX_LINK = {
  route: "/preview/inbox",
  label: "Inbox",
  icon: "Inbox" as const,
  insertAfterRoute: "/leads",
};

// Hayk 2026-07-02 — Preview-only sidebar link for the Payments Manager
// (Arusyak's accountant view). No /payments DB Page exists yet, so we
// inject the entry right after Orders. Role visibility handled per-page.
const PREVIEW_PAYMENTS_LINK = {
  route: "/preview/payments",
  label: "Payments",
  icon: "Briefcase" as const,
  insertAfterRoute: "/orders",
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
  const targetRoute = PREVIEW_ROUTE_OVERRIDES[page.route] ?? page.route;
  const active =
    page.route === "/dashboard"
      ? pathname === "/dashboard" || pathname === PREVIEW_ROUTE_OVERRIDES["/dashboard"]
      : pathname === page.route || pathname.startsWith(page.route + "/") || pathname === targetRoute || pathname.startsWith(targetRoute + "/");

  const displayLabel =
    page.route === "/dashboard" && roleName && DASHBOARD_ROLE_LABELS[roleName]
      ? DASHBOARD_ROLE_LABELS[roleName]
      : page.display_name;

  return (
    <Link
      href={targetRoute}
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
          : { color: "var(--color-sidebar-nav)" }
      }
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor =
            "var(--color-sidebar-hover-bg)";
          (e.currentTarget as HTMLElement).style.color =
            "var(--color-sidebar-nav-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "";
          (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav)";
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

// Hayk 2026-07-01 — Preview Inbox link. Unread count is loaded from the seed
// module lazily so this file has no static dependency on the preview code.
function PreviewInboxLink({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    import("@/app/(app)/preview/inbox/_seed")
      .then((m) => { if (!cancelled) setUnread(m.UNREAD_COUNT ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const active = pathname === "/preview/inbox" || pathname.startsWith("/preview/inbox/");
  return (
    <Link
      href="/preview/inbox"
      title={collapsed ? "Inbox" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
        collapsed && "justify-center px-0"
      )}
      style={
        active
          ? { backgroundColor: "var(--color-accent)", color: "var(--color-btn-primary-text)", fontWeight: 500 }
          : { color: "var(--color-sidebar-nav)" }
      }
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-sidebar-hover-bg)";
          (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "";
          (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav)";
        }
      }}
    >
      <div className="relative shrink-0">
        <Inbox className="h-4 w-4" />
        {collapsed && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold"
            style={{ background: "var(--color-danger)", color: "var(--color-text-inverse)" }}>
            {unread > 99 ? "99" : unread}
          </span>
        )}
      </div>
      {!collapsed && <span className="flex-1 truncate">Inbox</span>}
      {!collapsed && unread > 0 && (
        <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: active ? "rgba(0,0,0,0.2)" : "var(--color-danger)", color: "var(--color-text-inverse)" }}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

// Hayk 2026-07-02 — Preview Payments link (Arusyak's view).
function PreviewPaymentsLink({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const active = pathname === "/preview/payments" || pathname.startsWith("/preview/payments/");
  return (
    <Link
      href="/preview/payments"
      title={collapsed ? "Payments" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
        collapsed && "justify-center px-0"
      )}
      style={
        active
          ? { backgroundColor: "var(--color-accent)", color: "var(--color-btn-primary-text)", fontWeight: 500 }
          : { color: "var(--color-sidebar-nav)" }
      }
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-sidebar-hover-bg)";
          (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "";
          (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav)";
        }
      }}
    >
      <Briefcase className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="flex-1 truncate">Payments</span>}
    </Link>
  );
}

// Hayk 2026-07-02 — Preview role → hidden nav routes. Empty array = show all.
// Routes here are matched against Page.route (i.e. the DB route field).
const PREVIEW_ROLE_HIDDEN_ROUTES: Record<PreviewRole, string[]> = {
  admin: [],
  sales: [
    // Payments module is being built by another agent — hide from sales.
    "/payments",
    "/reports",
    "/settings",
  ],
  sdr: [
    "/payments",
    "/reports",
    "/settings",
  ],
  designer: [
    // Designer sees almost nothing in CRM nav — only orders (files-only view).
    "/dashboard",
    "/leads",
    "/sales",
    "/sales-pipeline",
    "/crm",
    "/quotes",
    "/inbox",
    "/completed",
    "/payments",
    "/reports",
    "/settings",
    "/operations",
  ],
  accountant: [
    "/leads",
    "/sales",
    "/sales-pipeline",
  ],
  "print-manager": [
    "/leads",
    "/sales",
    "/sales-pipeline",
    "/payments",
    "/reports",
    "/inbox",
  ],
};

// Extra items to inject per role (preview-only synthetic nav entries).
type SyntheticNav = { route: string; label: string; icon: keyof typeof ICON_MAP };
const PREVIEW_ROLE_EXTRA_NAV: Record<PreviewRole, SyntheticNav[]> = {
  admin: [],
  sales: [],
  sdr: [],
  designer: [
    { route: "/preview/designer-home", label: "Designer Home", icon: "LayoutDashboard" },
  ],
  accountant: [],
  "print-manager": [],
};

// Hayk 2026-07-02 — Preview inbox is preview-only; hide it too for roles
// that shouldn't see it.
const PREVIEW_ROLES_HIDING_PREVIEW_INBOX: PreviewRole[] = ["designer", "print-manager"];

function roleLabel(name: string | undefined): string {
  if (name === "admin")      return "Administrator";
  if (name === "sales")      return "Sales Rep";
  if (name === "sdr")        return "SDR";
  if (name === "accountant") return "Accountant";
  return name ?? "";
}

export function Sidebar() {
  const { theme, setTheme } = useTheme();
  const { me, sections } = useAppSession();
  const [previewRole] = usePreviewRole();
  const [collapsed, setCollapsed] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const userFullName = me?.fullName ?? null;
  const userRoleName = me?.roleName;
  const userId = me?.userId ?? null;

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored === "true") setCollapsed(true);
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

    fetchBadges();
    window.addEventListener("bazaar:refresh-counts", fetchBadges);

    return () => {
      window.removeEventListener("bazaar:refresh-counts", fetchBadges);
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

      const lookupsChannel = supabase
        .channel("lookups-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lookup_values" },
          (payload) => {
            console.log("[Realtime] lookup_values changed:", payload.eventType);
            clearTicketFormBootstrapClientCache();
            window.dispatchEvent(new Event("bazaar:lookups-changed"));
          }
        )
        .subscribe((status, err) => {
          console.log("[Realtime] lookups-realtime status:", status, err ?? "");
        });

      (supabase as unknown as Record<string, unknown>)["_sidebarLeadsCh"] = leadsChannel;
      (supabase as unknown as Record<string, unknown>)["_sidebarTicketsCh"] = ticketsChannel;
      (supabase as unknown as Record<string, unknown>)["_sidebarActivitiesCh"] = activitiesChannel;
      (supabase as unknown as Record<string, unknown>)["_sidebarCustomersCh"] = customersChannel;
      (supabase as unknown as Record<string, unknown>)["_sidebarLookupsCh"] = lookupsChannel;
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
      if (refs["_sidebarLookupsCh"]) {
        supabase.removeChannel(refs["_sidebarLookupsCh"] as Parameters<typeof supabase.removeChannel>[0]);
        delete refs["_sidebarLookupsCh"];
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
        borderRight: "1px solid var(--color-sidebar-divider)",
      }}
    >
      {/* Brand */}
      <div
        className="flex h-14 shrink-0 items-center px-3.5"
        style={{ borderBottom: "1px solid var(--color-sidebar-divider)" }}
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
          style={{ color: "var(--color-sidebar-nav)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "var(--color-sidebar-hover-bg)";
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
              <p className="truncate text-[13px] font-medium" style={{ color: "var(--color-sidebar-nav)" }}>
                {userFullName ?? "—"}
              </p>
              <p className="text-[11px]" style={{ color: "var(--color-sidebar-nav-faint)" }}>
                {roleLabel(userRoleName)}
              </p>
            </div>
          )}
          {!collapsed && (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--color-sidebar-nav-faint)" }} />
          )}
        </Link>
        {/* Divider */}
        <div className="mt-2" style={{ borderTop: "1px solid var(--color-sidebar-divider)" }} />
      </div>

      {/* Nav sections */}
      <nav className="flex flex-1 flex-col overflow-y-auto p-2">
        {sections.map(({ section, pages }, idx) => {
          // Hayk 2026-07-01 — hide Quoted Requests nav entry from the sidebar
          // while the /quotes page is still a placeholder. Underlying page and
          // access rules untouched.
          // Hayk 2026-07-02 — also filter by the preview-role toggle so Hayk can
          // preview the sidebar from other team members' eyes.
          const hidden = PREVIEW_ROLE_HIDDEN_ROUTES[previewRole] ?? [];
          const visiblePages = pages.filter(
            (p) => p.route !== "/quotes" && p.route !== "/completed" && !hidden.includes(p.route)
          );
          if (visiblePages.length === 0) return null;
          return (
          <div key={section} className={cn("flex flex-col gap-0.5", idx > 0 && "mt-3")}>
            {/* Section label (hidden when collapsed) */}
            {!collapsed && section === "admin" && (
              <p
                className="px-2.5 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{ color: "var(--color-sidebar-nav-faint)" }}
              >
                Admin
              </p>
            )}
            {visiblePages.map((page) => (
              <div key={page.id}>
                <NavLink
                  page={page}
                  collapsed={collapsed}
                  badge={badgeCounts[page.route]}
                  roleName={userRoleName}
                />
                {/* Hayk 2026-07-01 — inject preview Inbox link right after Leads */}
                {page.route === PREVIEW_INBOX_LINK.insertAfterRoute &&
                  !PREVIEW_ROLES_HIDING_PREVIEW_INBOX.includes(previewRole) && (
                  <PreviewInboxLink collapsed={collapsed} />
                )}
                {/* Hayk 2026-07-02 — inject Payments link right after Orders (accountant + admin only) */}
                {page.route === PREVIEW_PAYMENTS_LINK.insertAfterRoute &&
                  !PREVIEW_ROLE_HIDDEN_ROUTES[previewRole].includes("/payments") && (
                  <PreviewPaymentsLink collapsed={collapsed} />
                )}
              </div>
            ))}
          </div>
          );
        })}

        {/* Hayk 2026-07-02 — Synthetic preview-only nav items per role */}
        {PREVIEW_ROLE_EXTRA_NAV[previewRole].length > 0 && (
          <div className="mt-3 flex flex-col gap-0.5">
            {PREVIEW_ROLE_EXTRA_NAV[previewRole].map((item) => {
              const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
              return (
                <Link
                  key={item.route}
                  href={item.route}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                    collapsed && "justify-center px-0"
                  )}
                  style={{ color: "var(--color-sidebar-nav)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-sidebar-hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "";
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        )}

        {/* Hayk 2026-07-02 — Workflow board external link for designer + print-manager */}
        {(previewRole === "designer" || previewRole === "print-manager") && (
          <div className="mt-1">
            <a
              href="http://localhost:3004/board"
              target="_blank"
              rel="noopener noreferrer"
              title={collapsed ? "Workflow board" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                collapsed && "justify-center px-0"
              )}
              style={{ color: "var(--color-sidebar-nav)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-sidebar-hover-bg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "";
              }}
            >
              <GitBranch className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">Workflow board ↗</span>}
            </a>
          </div>
        )}
      </nav>

      {/* Bottom utility strip */}
      <div
        className="flex flex-col gap-0.5 p-2"
        style={{ borderTop: "1px solid var(--color-sidebar-divider)" }}
      >
        {/* Hayk 2026-07-02 — sidebar-footer role picker (fallback to floating chip) */}
        <div className={cn("pb-1", collapsed && "px-0")}>
          <SidebarRolePicker collapsed={collapsed} />
        </div>

        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={utilityButtonClass}
          style={{ color: "var(--color-sidebar-nav-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "var(--color-sidebar-hover-bg)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
            (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav-muted)";
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
          style={{ color: "var(--color-sidebar-nav-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "var(--color-sidebar-hover-bg)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
            (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav-muted)";
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>

        <button
          onClick={toggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={utilityButtonClass}
          style={{ color: "var(--color-sidebar-nav-faint)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "var(--color-sidebar-hover-bg)";
            (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = "";
            (e.currentTarget as HTMLElement).style.color = "var(--color-sidebar-nav-faint)";
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
