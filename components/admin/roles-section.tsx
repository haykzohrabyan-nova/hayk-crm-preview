"use client";

import { useState, useEffect } from "react";
import { Trash2, Lock, X, Shield, Zap } from "lucide-react";
import { isAdminOnlyPageRoute } from "@/lib/auth/admin-only-pages";
import { ToastBanner } from "@/components/ui/toast-banner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  display_name: string;
  is_system: boolean;
  permitted_page_ids: string[];
  permitted_action_ids: string[];
  created_at: string;
}

type Page = {
  id: string;
  route: string;
  display_name: string;
  icon: string | null;
  section: string;
  sort_order: number;
};

type Permission = {
  id: string;
  key: string;
  display_name: string;
  area: string;
  description: string | null;
  sort_order: number;
};

type RightTab = "pages" | "actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

const AREA_LABELS: Record<string, string> = {
  leads:    "Leads",
  sales:    "Sales",
  quotes:   "Quotes",
  orders:   "Orders",
  payments: "Payments",
  crm:      "CRM",
  admin:    "Admin",
};

const AREA_ORDER = ["leads", "sales", "quotes", "orders", "payments", "crm", "admin"];

function groupByArea(permissions: Permission[]): Record<string, Permission[]> {
  const grouped: Record<string, Permission[]> = {};
  for (const p of permissions) {
    (grouped[p.area] ??= []).push(p);
  }
  return grouped;
}


// ─── New Role Form ─────────────────────────────────────────────────────────────

function NewRoleForm({
  onCreated,
  onCancel,
}: {
  onCreated: (role: Role) => void;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleDisplayNameChange(v: string) {
    setDisplayName(v);
    setName(slugify(v));
  }

  async function handleSubmit() {
    if (!displayName.trim() || !name.trim()) {
      setError("Both fields are required.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, display_name: displayName }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create role.");
      return;
    }
    onCreated(data.role);
  }

  const labelStyle = {
    color: "var(--color-text-muted)",
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 4,
  };
  const inputStyle = {
    width: "100%",
    borderRadius: 6,
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text-primary)",
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div
      className="rounded-[10px] border p-4 space-y-3"
      style={{
        background: "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))",
        borderColor: "color-mix(in srgb, var(--color-accent) 25%, var(--color-border))",
      }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        New Role
      </p>
      <div>
        <label style={labelStyle}>Display Name</label>
        <input
          style={inputStyle}
          value={displayName}
          onChange={(e) => handleDisplayNameChange(e.target.value)}
          placeholder="e.g. Manager"
          autoFocus
        />
      </div>
      <div>
        <label style={labelStyle}>Slug (auto-generated)</label>
        <input
          style={{ ...inputStyle, opacity: 0.6 }}
          value={name}
          onChange={(e) => setName(slugify(e.target.value))}
          placeholder="e.g. manager"
        />
        <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          Lowercase, letters and underscores only. Cannot be changed after creation.
        </p>
      </div>
      {error && (
        <p className="text-[12px] font-medium" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="rounded-[6px] border px-3 py-1.5 text-[12px] font-medium"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !displayName.trim()}
          className="rounded-[6px] px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
          style={{ background: "var(--color-btn-verify-bg)", color: "var(--color-btn-verify-text)" }}
        >
          {saving ? "Creating…" : "Create Role"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RolesSection() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("pages");
  const [loading, setLoading] = useState(true);
  const [togglingPageId, setTogglingPageId] = useState<string | null>(null);
  const [togglingPermissionId, setTogglingPermissionId] = useState<string | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [showNewRoleForm, setShowNewRoleForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/roles").then((r) => r.json()),
      fetch("/api/admin/pages").then((r) => r.json()),
      fetch("/api/admin/permissions").then((r) => r.json()),
    ]).then(([rolesData, pagesData, permsData]) => {
      const fetchedRoles: Role[] = (rolesData.roles ?? []).map((r: Omit<Role, "permitted_action_ids"> & { permitted_action_ids?: string[] }) => ({
        ...r,
        permitted_action_ids: r.permitted_action_ids ?? [],
      }));
      setRoles(fetchedRoles);
      setPages(pagesData.pages ?? []);
      setPermissions(permsData.permissions ?? []);
      if (fetchedRoles.length > 0) setSelectedRoleId(fetchedRoles[0].id);
      setLoading(false);
    });
  }, []);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
  const isAdmin = selectedRole?.name === "admin";
  const isSystemRole = selectedRole?.is_system ?? false;
  const isPermissionLocked = isSystemRole;

  // ── Toggle page permission ─────────────────────────────────────────────────

  async function handleTogglePage(page: Page, currentlyGranted: boolean) {
    if (!selectedRole || isPermissionLocked) return;
    if (!currentlyGranted && isAdminOnlyPageRoute(page.route)) {
      showToast("Admin-only pages cannot be assigned to other roles.", "error");
      return;
    }
    setTogglingPageId(page.id);

    if (currentlyGranted) {
      const res = await fetch(
        `/api/admin/roles/${selectedRole.id}/permissions/${page.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setRoles((prev) =>
          prev.map((r) =>
            r.id === selectedRole.id
              ? { ...r, permitted_page_ids: r.permitted_page_ids.filter((id) => id !== page.id) }
              : r,
          ),
        );
      } else {
        showToast("Failed to revoke permission.", "error");
      }
    } else {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: page.id }),
      });
      if (res.ok) {
        setRoles((prev) =>
          prev.map((r) =>
            r.id === selectedRole.id
              ? { ...r, permitted_page_ids: [...r.permitted_page_ids, page.id] }
              : r,
          ),
        );
      } else {
        showToast("Failed to grant permission.", "error");
      }
    }
    setTogglingPageId(null);
  }

  // ── Toggle action grant ────────────────────────────────────────────────────

  async function handleToggleAction(permission: Permission, currentlyGranted: boolean) {
    if (!selectedRole || isPermissionLocked) return;
    setTogglingPermissionId(permission.id);

    if (currentlyGranted) {
      const res = await fetch(
        `/api/admin/roles/${selectedRole.id}/action-grants/${permission.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setRoles((prev) =>
          prev.map((r) =>
            r.id === selectedRole.id
              ? {
                  ...r,
                  permitted_action_ids: r.permitted_action_ids.filter((id) => id !== permission.id),
                }
              : r,
          ),
        );
      } else {
        showToast("Failed to revoke action permission.", "error");
      }
    } else {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}/action-grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission_id: permission.id }),
      });
      if (res.ok) {
        setRoles((prev) =>
          prev.map((r) =>
            r.id === selectedRole.id
              ? {
                  ...r,
                  permitted_action_ids: [...r.permitted_action_ids, permission.id],
                }
              : r,
          ),
        );
      } else {
        showToast("Failed to grant action permission.", "error");
      }
    }
    setTogglingPermissionId(null);
  }

  // ── Delete role ────────────────────────────────────────────────────────────

  async function handleDeleteRole(role: Role) {
    if (!confirm(`Delete role "${role.display_name}"? This cannot be undone.`)) return;
    setDeletingRoleId(role.id);
    const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingRoleId(null);
    if (!res.ok) {
      showToast(data.error ?? "Failed to delete.", "error");
      return;
    }
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    if (selectedRoleId === role.id) {
      const remaining = roles.filter((r) => r.id !== role.id);
      setSelectedRoleId(remaining[0]?.id ?? null);
    }
    showToast(`Role "${role.display_name}" deleted.`);
  }

  // ── Skeleton ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex gap-6 animate-pulse">
        <div className="w-56 shrink-0 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 rounded-[8px]" style={{ background: "var(--color-border)" }} />
          ))}
        </div>
        <div className="flex-1 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded-[8px]" style={{ background: "var(--color-border)" }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Actions tab content ────────────────────────────────────────────────────

  const grouped = groupByArea(permissions);
  const areaKeys = AREA_ORDER.filter((a) => grouped[a]?.length > 0);

  const grantedCount = selectedRole?.permitted_action_ids.length ?? 0;
  const totalCount = permissions.length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6">

      {/* ── Left: Role List ─────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--color-text-muted)" }}
          >
            Roles
          </p>
          {!showNewRoleForm && (
            <button
              onClick={() => setShowNewRoleForm(true)}
              className="rounded px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-70"
              style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
            >
              + New
            </button>
          )}
        </div>

        {showNewRoleForm && (
          <NewRoleForm
            onCreated={(role) => {
              setRoles((prev) => [...prev, role]);
              setSelectedRoleId(role.id);
              setShowNewRoleForm(false);
            }}
            onCancel={() => setShowNewRoleForm(false)}
          />
        )}

        {roles.map((role) => (
          <div
            key={role.id}
            className="group flex items-center justify-between rounded-[8px] px-3 py-2 cursor-pointer transition-all"
            style={{
              background:
                selectedRoleId === role.id ? "var(--color-btn-verify-bg)" : "transparent",
              color:
                selectedRoleId === role.id
                  ? "var(--color-btn-verify-text)"
                  : "var(--color-text-primary)",
            }}
            onClick={() => setSelectedRoleId(role.id)}
          >
            <div className="flex items-center gap-2 min-w-0">
              {role.is_system && (
                <Lock className="h-3 w-3 shrink-0" style={{ opacity: 0.6 }} />
              )}
              <span className="text-[13px] font-medium truncate">{role.display_name}</span>
            </div>
            {!role.is_system && selectedRoleId !== role.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteRole(role);
                }}
                disabled={deletingRoleId === role.id}
                className="hidden group-hover:flex items-center justify-center rounded p-0.5 transition-all hover:opacity-70 disabled:opacity-30"
                style={{ color: "var(--color-danger)" }}
                title="Delete role"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Right: Permission Panel ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {!selectedRole ? (
          <div
            className="flex items-center justify-center py-20"
            style={{ color: "var(--color-text-muted)" }}
          >
            Select a role to manage permissions.
          </div>
        ) : (
          <>
            {/* Role header */}
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              <h3
                className="text-[15px] font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {selectedRole.display_name}
              </h3>
              {selectedRole.is_system && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                >
                  <Lock className="h-2.5 w-2.5" /> System
                </span>
              )}
            </div>

            {/* Tab switcher */}
            <div
              className="flex border-b mb-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              {(
                [
                  { id: "pages" as RightTab, label: "Page Access", icon: <Shield className="h-3.5 w-3.5" /> },
                  {
                    id: "actions" as RightTab,
                    label: "Actions",
                    icon: <Zap className="h-3.5 w-3.5" />,
                    badge: rightTab === "actions" || isAdmin ? null : `${grantedCount}/${totalCount}`,
                  },
                ] as Array<{ id: RightTab; label: string; icon: React.ReactNode; badge?: string | null }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRightTab(tab.id)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{
                    color:
                      rightTab === tab.id
                        ? "var(--color-tab-active)"
                        : "var(--color-tab-inactive)",
                    borderBottom:
                      rightTab === tab.id
                        ? "2px solid var(--color-tab-underline)"
                        : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.badge && (
                    <span
                      className="ml-1 inline-flex h-4 min-w-[24px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                      style={{
                        background: "color-mix(in srgb, var(--color-badge-bg) 70%, transparent)",
                        color: "var(--color-badge-text)",
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Page Access tab ── */}
            {rightTab === "pages" && (
              <>
                {isPermissionLocked ? (
                  <div
                    className="rounded-[10px] border p-4 text-sm"
                    style={{
                      background:
                        "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))",
                      borderColor:
                        "color-mix(in srgb, var(--color-accent) 25%, var(--color-border))",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {isAdmin
                      ? "Admin has unrestricted access to all pages. Permissions cannot be modified."
                      : "System role page permissions are fixed and cannot be changed here. Update defaults via a database migration if needed."}
                  </div>
                ) : (
                  <div
                    className="rounded-[10px] border overflow-hidden"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    {pages.length === 0 ? (
                      <p className="p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
                        No pages found.
                      </p>
                    ) : (
                      pages.map((page, idx) => {
                        const granted = selectedRole.permitted_page_ids.includes(page.id);
                        const toggling = togglingPageId === page.id;
                        const isAdminOnlyPage = isAdminOnlyPageRoute(page.route);
                        const checkboxDisabled = toggling || (isAdminOnlyPage && !granted);
                        return (
                          <label
                            key={page.id}
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                            style={{
                              background:
                                idx % 2 === 1
                                  ? "var(--color-row-alt)"
                                  : "var(--color-surface)",
                              borderTop:
                                idx > 0 ? "1px solid var(--color-border)" : undefined,
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = "var(--color-row-hover)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background =
                                idx % 2 === 1
                                  ? "var(--color-row-alt)"
                                  : "var(--color-surface)")
                            }
                          >
                            <input
                              type="checkbox"
                              checked={granted}
                              disabled={checkboxDisabled}
                              onChange={() => handleTogglePage(page, granted)}
                              className="rounded accent-[var(--color-accent)]"
                              style={{ width: 15, height: 15 }}
                            />
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span
                                className="text-[13px] font-medium"
                                style={{ color: "var(--color-text-primary)" }}
                              >
                                {page.display_name}
                              </span>
                              {isAdminOnlyPage && (
                                <span
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{
                                    background: "var(--color-badge-bg)",
                                    color: "var(--color-badge-text)",
                                  }}
                                >
                                  <Lock className="h-3 w-3" />
                                  Admin only
                                </span>
                              )}
                            </div>
                            <span
                              className="text-[11px] font-mono shrink-0"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {page.route}
                            </span>
                            {toggling && (
                              <span
                                className="text-[11px] shrink-0"
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                …
                              </span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
                <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  Changes take effect immediately — the next page load for any user with this
                  role reflects updated permissions.
                </p>
              </>
            )}

            {/* ── Actions tab ── */}
            {rightTab === "actions" && (
              <>
                {isAdmin ? (
                  <div
                    className="rounded-[10px] border p-4 text-sm"
                    style={{
                      background:
                        "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))",
                      borderColor:
                        "color-mix(in srgb, var(--color-accent) 25%, var(--color-border))",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Admin has all action permissions by default. Individual grants cannot be
                    removed from the Admin role.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {areaKeys.map((area) => {
                      const areaPerms = grouped[area];
                      return (
                        <div key={area}>
                          <p
                            className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {AREA_LABELS[area] ?? area}
                          </p>
                          <div
                            className="rounded-[10px] border overflow-hidden"
                            style={{ borderColor: "var(--color-border)" }}
                          >
                            {areaPerms.map((perm, idx) => {
                              const granted =
                                selectedRole.permitted_action_ids.includes(perm.id);
                              const toggling = togglingPermissionId === perm.id;
                              const checkboxDisabled = isPermissionLocked || toggling;

                              return (
                                <label
                                  key={perm.id}
                                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
                                  style={{
                                    background:
                                      idx % 2 === 1
                                        ? "var(--color-row-alt)"
                                        : "var(--color-surface)",
                                    borderTop:
                                      idx > 0 ? "1px solid var(--color-border)" : undefined,
                                    cursor: checkboxDisabled ? "default" : "pointer",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!checkboxDisabled)
                                      e.currentTarget.style.background =
                                        "var(--color-row-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                      idx % 2 === 1
                                        ? "var(--color-row-alt)"
                                        : "var(--color-surface)";
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={granted}
                                    disabled={checkboxDisabled}
                                    onChange={() => handleToggleAction(perm, granted)}
                                    className="mt-0.5 rounded accent-[var(--color-accent)]"
                                    style={{ width: 15, height: 15 }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <span
                                      className="text-[13px] font-medium"
                                      style={{ color: "var(--color-text-primary)" }}
                                    >
                                      {perm.display_name}
                                    </span>
                                    {perm.description && (
                                      <p
                                        className="mt-0.5 text-[11px] leading-relaxed"
                                        style={{ color: "var(--color-text-muted)" }}
                                      >
                                        {perm.description}
                                      </p>
                                    )}
                                  </div>
                                  <span
                                    className="shrink-0 font-mono text-[10px]"
                                    style={{ color: "var(--color-text-muted)", marginTop: 2 }}
                                  >
                                    {perm.key}
                                  </span>
                                  {toggling && (
                                    <span
                                      className="shrink-0 text-[11px]"
                                      style={{ color: "var(--color-text-muted)", marginTop: 2 }}
                                    >
                                      …
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  Action grants are stored in the database and loaded into every user session
                  (cached 45 s). These are informational in Phase 0 — enforcement is being
                  migrated from hardcoded role checks incrementally.
                </p>
              </>
            )}
          </>
        )}
      </div>

      {toast && (
        <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
