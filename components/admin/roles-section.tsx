"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Lock, X, Shield } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  display_name: string;
  is_system: boolean;
  permitted_page_ids: string[];
  created_at: string;
}

interface Page {
  id: string;
  route: string;
  display_name: string;
  icon: string | null;
  section: string;
  sort_order: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function ToastBanner({ message, type, onDismiss }: { message: string; type: "success" | "error"; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex min-w-[260px] items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        borderLeftWidth: 4,
        borderLeftColor: type === "success" ? "#16A34A" : "#DC2626",
        color: "var(--color-text-primary)",
      }}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} style={{ color: "var(--color-text-muted)" }}><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ─── New Role Form ────────────────────────────────────────────────────────────

function NewRoleForm({ onCreated, onCancel }: { onCreated: (role: Role) => void; onCancel: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleDisplayNameChange(v: string) {
    setDisplayName(v);
    setName(slugify(v));
  }

  async function handleSubmit() {
    if (!displayName.trim() || !name.trim()) { setError("Both fields are required."); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, display_name: displayName }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to create role."); return; }
    onCreated(data.role);
  }

  const labelStyle = { color: "var(--color-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.06em", display: "block", marginBottom: 4 };
  const inputStyle = {
    width: "100%", borderRadius: 6, border: "1px solid var(--color-border)",
    background: "var(--color-surface)", color: "var(--color-text-primary)", padding: "6px 10px", fontSize: 13, outline: "none",
  };

  return (
    <div
      className="rounded-[10px] border p-4 space-y-3"
      style={{ background: "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))", borderColor: "color-mix(in srgb, var(--color-accent) 25%, var(--color-border))" }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>New Role</p>
      <div>
        <label style={labelStyle}>Display Name</label>
        <input style={inputStyle} value={displayName} onChange={(e) => handleDisplayNameChange(e.target.value)} placeholder="e.g. Manager" autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Slug (auto-generated)</label>
        <input
          style={{ ...inputStyle, opacity: 0.6 }}
          value={name}
          onChange={(e) => setName(slugify(e.target.value))}
          placeholder="e.g. manager"
        />
        <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>Lowercase, letters and underscores only. Cannot be changed after creation.</p>
      </div>
      {error && <p className="text-[12px] font-medium" style={{ color: "#DC2626" }}>{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="rounded-[6px] border px-3 py-1.5 text-[12px] font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function RolesSection() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [togglingPageId, setTogglingPageId] = useState<string | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/roles").then((r) => r.json()),
      fetch("/api/admin/pages").then((r) => r.json()),
    ]).then(([rolesData, pagesData]) => {
      const fetchedRoles: Role[] = rolesData.roles ?? [];
      setRoles(fetchedRoles);
      setPages(pagesData.pages ?? []);
      if (fetchedRoles.length > 0) setSelectedRoleId(fetchedRoles[0].id);
      setLoading(false);
    });
  }, []);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
  const isAdmin = selectedRole?.name === "admin";

  // ── Toggle permission ─────────────────────────────────────────────────────

  async function handleToggle(pageId: string, currentlyGranted: boolean) {
    if (!selectedRole || isAdmin) return;
    setTogglingPageId(pageId);

    if (currentlyGranted) {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}/permissions/${pageId}`, { method: "DELETE" });
      if (res.ok) {
        setRoles((prev) => prev.map((r) =>
          r.id === selectedRole.id
            ? { ...r, permitted_page_ids: r.permitted_page_ids.filter((id) => id !== pageId) }
            : r
        ));
      } else {
        showToast("Failed to revoke permission.", "error");
      }
    } else {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId }),
      });
      if (res.ok) {
        setRoles((prev) => prev.map((r) =>
          r.id === selectedRole.id
            ? { ...r, permitted_page_ids: [...r.permitted_page_ids, pageId] }
            : r
        ));
      } else {
        showToast("Failed to grant permission.", "error");
      }
    }
    setTogglingPageId(null);
  }

  // ── Delete role ───────────────────────────────────────────────────────────

  async function handleDeleteRole(role: Role) {
    if (!confirm(`Delete role "${role.display_name}"? This cannot be undone.`)) return;
    setDeletingRoleId(role.id);
    const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingRoleId(null);
    if (!res.ok) { showToast(data.error ?? "Failed to delete.", "error"); return; }
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    if (selectedRoleId === role.id) {
      const remaining = roles.filter((r) => r.id !== role.id);
      setSelectedRoleId(remaining[0]?.id ?? null);
    }
    showToast(`Role "${role.display_name}" deleted.`);
  }

  // ── Handle new role created ───────────────────────────────────────────────

  function handleRoleCreated(role: Role) {
    setRoles((prev) => [...prev, role]);
    setSelectedRoleId(role.id);
    setShowNewForm(false);
    showToast(`Role "${role.display_name}" created.`);
  }

  if (loading) {
    return (
      <div className="flex gap-6 animate-pulse">
        <div className="w-56 shrink-0 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded-[8px]" style={{ background: "var(--color-border)" }} />)}
        </div>
        <div className="flex-1 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded-[8px]" style={{ background: "var(--color-border)" }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">

      {/* ── Left: Role List ── */}
      <div className="w-56 shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>Roles</p>
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-all hover:opacity-80"
            style={{ background: "var(--color-btn-primary-bg)", color: "var(--color-btn-primary-text)" }}
          >
            <Plus className="h-3 w-3" /> New
          </button>
        </div>

        {showNewForm && (
          <NewRoleForm onCreated={handleRoleCreated} onCancel={() => setShowNewForm(false)} />
        )}

        {roles.map((role) => (
          <div
            key={role.id}
            className="group flex items-center justify-between rounded-[8px] px-3 py-2 cursor-pointer transition-all"
            style={{
              background: selectedRoleId === role.id ? "var(--color-btn-verify-bg)" : "transparent",
              color: selectedRoleId === role.id ? "var(--color-btn-verify-text)" : "var(--color-text-primary)",
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
                onClick={(e) => { e.stopPropagation(); handleDeleteRole(role); }}
                disabled={deletingRoleId === role.id}
                className="hidden group-hover:flex items-center justify-center rounded p-0.5 transition-all hover:opacity-70 disabled:opacity-30"
                style={{ color: "#DC2626" }}
                title="Delete role"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Right: Permission Matrix ── */}
      <div className="flex-1 min-w-0">
        {!selectedRole ? (
          <div className="flex items-center justify-center py-20" style={{ color: "var(--color-text-muted)" }}>
            Select a role to manage permissions.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
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

            {isAdmin ? (
              <div
                className="rounded-[10px] border p-4 text-sm"
                style={{ background: "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))", borderColor: "color-mix(in srgb, var(--color-accent) 25%, var(--color-border))", color: "var(--color-text-muted)" }}
              >
                Admin has unrestricted access to all pages. Permissions cannot be modified.
              </div>
            ) : (
              <div
                className="rounded-[10px] border overflow-hidden"
                style={{ borderColor: "var(--color-border)" }}
              >
                {pages.length === 0 ? (
                  <p className="p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>No pages found.</p>
                ) : (
                  pages.map((page, idx) => {
                    const granted = selectedRole.permitted_page_ids.includes(page.id);
                    const toggling = togglingPageId === page.id;
                    return (
                      <label
                        key={page.id}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                        style={{
                          background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                          borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                      >
                        <input
                          type="checkbox"
                          checked={granted}
                          disabled={toggling}
                          onChange={() => handleToggle(page.id, granted)}
                          className="rounded accent-[var(--color-accent)]"
                          style={{ width: 15, height: 15 }}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {page.display_name}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--color-text-muted)" }}>
                          {page.route}
                        </span>
                        {toggling && (
                          <span className="text-[11px] shrink-0" style={{ color: "var(--color-text-muted)" }}>…</span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            )}

            <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Changes take effect immediately — the next page load for any user with this role reflects updated permissions.
            </p>
          </>
        )}
      </div>

      {toast && <ToastBanner message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
