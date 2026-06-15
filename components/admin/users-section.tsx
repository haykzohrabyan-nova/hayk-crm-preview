"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Pencil,
  X,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmailInput } from "@/components/ui/email-input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { validateEmail } from "@/lib/utils/email";
import { RoleSessionPill } from "@/components/admin/user-session-card";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  display_name: string;
  is_system: boolean;
}

interface UserRow {
  id: string;
  full_name: string | null;
  email: string;
  role_id: string;
  role_name: string;
  role_display_name: string;
  is_active: boolean;
  must_change_password: boolean;
  mfa_required: boolean;
  created_at: string;
}

interface EmailDelivery {
  attempted: boolean;
  ok: boolean;
  error?: string;
  login_url?: string;
}

function logEmailDelivery(
  context: "create" | "reset",
  email: string,
  delivery?: EmailDelivery,
) {
  if (!delivery) return;
  const label = context === "reset" ? "password-reset" : "welcome";
  if (delivery.ok) {
    console.info(
      `[admin-user-email:${label}] Instantly accepted send to ${email}`,
      delivery.login_url ? `— login button: ${delivery.login_url}` : "",
    );
  } else {
    console.warn(`[admin-user-email:${label}] failed for ${email}`, delivery.error ?? "unknown error");
  }
}

function emailDeliveryToast(
  base: string,
  email: string,
  delivery?: EmailDelivery,
  reset = false,
): { message: string; type: "success" | "error" } {
  if (!delivery?.attempted) {
    return { message: base, type: "success" };
  }
  if (delivery.ok) {
    const kind = reset ? "Password reset email sent" : "Welcome email sent";
    return { message: `${base} — ${kind} to ${email}.`, type: "success" };
  }
  const kind = reset ? "password reset email" : "welcome email";
  return {
    message: `${base} — ${kind} failed${delivery.error ? `: ${delivery.error}` : ""}. Share the password manually.`,
    type: "error",
  };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}


function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0].substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: "success" | "error";
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex min-w-[260px] items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg",
        type === "success"
          ? "border-l-[4px] border-l-green-500"
          : "border-l-[4px] border-l-destructive",
      )}
    >
      <span className="flex-1 text-foreground">{message}</span>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Create User Dialog ───────────────────────────────────────────────────────

function CreateUserDialog({
  roles,
  open,
  onClose,
  onCreated,
}: {
  roles: Role[];
  open: boolean;
  onClose: () => void;
  onCreated: (user: UserRow, emailDelivery?: EmailDelivery) => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role_id: "",
    temp_password: "",
  });
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setForm({ full_name: "", email: "", role_id: "", temp_password: "" });
    setSendWelcomeEmail(true);
    setError(null);
    setShowPw(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const emailErr = validateEmail(form.email);
    if (emailErr) { setError(`Email: ${emailErr}`); return; }
    if (!form.role_id) { setError("Please select a role."); return; }
    setSaving(true);
    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, send_welcome_email: sendWelcomeEmail }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to create user."); return; }
    logEmailDelivery("create", data.user?.email ?? form.email, data.email_delivery);
    reset();
    onCreated(data.user, data.email_delivery);
  }

  const nonAdminRoles = roles.filter((r) => r.name !== "admin");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          {/* Full Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Full Name</label>
            <Input
              placeholder="Jane Smith"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </label>
            <EmailInput
              required
              placeholder="jane@bazaarprinting.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Role <span className="text-destructive">*</span>
            </label>
            <Select value={form.role_id} onValueChange={(v) => setForm({ ...form, role_id: v ?? "" })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select role…">
                  {nonAdminRoles.find((r) => r.id === form.role_id)?.display_name ?? "Select role…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {nonAdminRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Temp Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Temporary Password <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                value={form.temp_password}
                onChange={(e) => setForm({ ...form, temp_password: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this password directly with the user. They will be required to change it on first login.
            </p>
          </div>

          {/* Send welcome email */}
          <label className="flex items-start gap-3 cursor-pointer rounded-[8px] border p-3" style={{ borderColor: "var(--color-border)", background: sendWelcomeEmail ? "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))" : "var(--color-surface)" }}>
            <input
              type="checkbox"
              checked={sendWelcomeEmail}
              onChange={(e) => setSendWelcomeEmail(e.target.checked)}
              className="mt-0.5 rounded accent-[var(--color-accent)]"
              style={{ width: 15, height: 15, flexShrink: 0 }}
            />
            <div>
              <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Send welcome email</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Sends a branded email with their login credentials via Instantly. Requires Instantly to be configured in Integrations.
              </span>
            </div>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Dialog ─────────────────────────────────────────────────────────

function EditUserDialog({
  user,
  roles,
  open,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  roles: Role[];
  open: boolean;
  onClose: () => void;
  onSaved: (updated: UserRow, emailDelivery?: EmailDelivery) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form fields when user changes
  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? "");
      setRoleId(user.role_id);
      setNewPw("");
      setShowPw(false);
      setError(null);
    }
  }, [user]);

  function handleClose() {
    setError(null);
    onClose();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    // Only include role_id if it actually changed — the API blocks sending
    // role_id for self-edits even when the value is the same.
    const payload: Record<string, unknown> = { full_name: fullName };
    if (roleId !== user.role_id) payload.role_id = roleId;
    if (newPw) {
      if (newPw.length < 8) { setError("Password must be at least 8 characters."); return; }
      payload.new_temp_password = newPw;
    }

    // Nothing actually changed
    if (
      fullName === (user.full_name ?? "") &&
      !payload.role_id &&
      !payload.new_temp_password
    ) {
      onClose();
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
    logEmailDelivery("reset", data.user?.email ?? user.email, data.email_delivery);
    onSaved(data.user, data.email_delivery);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex flex-col gap-4 pt-2">
          {/* Full Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Full Name</label>
            <Input
              placeholder="Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          {/* Email (read-only) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Email</label>
            <Input value={user?.email ?? ""} disabled className="opacity-60 cursor-not-allowed" />
            <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">
              Role <span className="text-destructive">*</span>
            </label>
            <Select value={roleId} onValueChange={(v) => setRoleId(v ?? roleId)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select role…">
                  {roles.find((r) => r.id === roleId)?.display_name ?? "Select role…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reset Temp Password (optional) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Reset Temporary Password</label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                minLength={8}
                placeholder="Leave blank to keep current password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPw && (
              <p className="text-xs text-muted-foreground">
                User will be required to change this password on next login. A reset email with the new password will be sent via Instantly (if configured).
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        active
          ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800/50"
          : "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function MfaBadge({ required }: { required: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        required
          ? "bg-[var(--color-badge-bg)] text-[var(--color-badge-text)] border-transparent"
          : "bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]",
      )}
    >
      <Shield className="h-3 w-3" />
      {required ? "Required" : "Off"}
    </span>
  );
}

function MfaConfirmDialog({
  user,
  open,
  saving,
  onClose,
  onConfirm,
}: {
  user: UserRow | null;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const enabling = user ? user.mfa_required === false : false;
  const displayName = user?.full_name?.trim() || user?.email || "this user";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            {enabling ? "Require two-factor authentication?" : "Disable two-factor authentication?"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {enabling ? (
            <>
              <p>
                <strong style={{ color: "var(--color-text-primary)" }}>{displayName}</strong> will be
                required to set up an authenticator app before accessing the CRM on their next login.
              </p>
              <p>If they already enrolled 2FA, they will need to verify it each session as usual.</p>
            </>
          ) : (
            <>
              <p>
                <strong style={{ color: "var(--color-text-primary)" }}>{displayName}</strong> will be
                able to sign in with their password only — no authenticator code.
              </p>
              <p style={{ color: "var(--color-warning-text-deep)" }}>
                This reduces account security. Only disable 2FA if you have a specific business reason.
              </p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={saving}
            variant={enabling ? "default" : "destructive"}
          >
            {saving ? "Saving…" : enabling ? "Require 2FA" : "Disable 2FA"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main UsersSection export ─────────────────────────────────────────────────

export function UsersSection() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [mfaConfirmUser, setMfaConfirmUser] = useState<UserRow | null>(null);
  const [mfaSaving, setMfaSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") =>
    setToast({ message, type });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (roleFilter && roleFilter !== "all") params.set("role", roleFilter);
    if (showInactive) params.set("is_active", "false");
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    setUsers(
      (data.users ?? []).map((u: UserRow) => ({
        ...u,
        mfa_required: u.mfa_required !== false,
      })),
    );
    setLoading(false);
  }, [search, roleFilter, showInactive]);

  useEffect(() => {
    fetch("/api/admin/roles")
      .then((r) => r.json())
      .then((d) => setRoles(d.roles ?? []));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDeactivate(user: UserRow) {
    setDeactivatingId(user.id);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    const data = await res.json();
    setDeactivatingId(null);
    if (!res.ok) { showToast(data.error ?? "Failed.", "error"); return; }
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    showToast(user.is_active ? "User deactivated." : "User reactivated.");
  }

  async function handleMfaConfirm() {
    if (!mfaConfirmUser) return;
    const nextRequired = !mfaConfirmUser.mfa_required;
    setMfaSaving(true);
    const res = await fetch(`/api/admin/users/${mfaConfirmUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfa_required: nextRequired }),
    });
    const data = await res.json();
    setMfaSaving(false);
    if (!res.ok) {
      showToast(data.error ?? "Failed to update 2FA setting.", "error");
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === mfaConfirmUser.id ? { ...u, mfa_required: nextRequired } : u,
      ),
    );
    showToast(
      nextRequired
        ? `2FA is now required for ${mfaConfirmUser.full_name ?? mfaConfirmUser.email}.`
        : `2FA disabled for ${mfaConfirmUser.full_name ?? mfaConfirmUser.email}.`,
    );
    setMfaConfirmUser(null);
  }

  const TABLE_HEADERS = ["Name", "Email", "Role", "Status", "2FA", "Reset PW", "Joined", "Actions"];

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Users</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${users.length} ${users.length === 1 ? "user" : "users"}${showInactive ? "" : " (active)"}`}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        {/* Search */}
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Role filter */}
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? "all")}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.name}>{r.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Show inactive */}
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Show inactive
        </label>

        {/* Refresh */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchUsers} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Desktop: table ── */}
      <div className="hidden sm:block rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "color-mix(in srgb, var(--color-border) 30%, transparent)", borderBottom: "1px solid var(--color-border)" }}>
            <tr>
              {TABLE_HEADERS.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] whitespace-nowrap"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ borderTop: "none" }}>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} style={{ borderTop: i > 0 ? "1px solid var(--color-border)" : undefined }}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div
                        className="h-4 animate-pulse rounded"
                        style={{ width: j === 0 ? 120 : j === 1 ? 160 : 80, background: "var(--color-border)" }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-16 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user, idx) => (
                <tr
                  key={user.id}
                  className="transition-colors"
                  style={{
                    background: idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)",
                    borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
                    opacity: user.is_active ? 1 : 0.55,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-row-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 1 ? "var(--color-row-alt)" : "var(--color-surface)")}
                >
                  {/* Name */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                      >
                        {initials(user.full_name, user.email)}
                      </div>
                      <span className="font-medium text-sm" style={{ color: "var(--color-text-primary)" }}>
                        {user.full_name ?? "—"}
                      </span>
                    </div>
                  </td>
                  {/* Email */}
                  <td className="px-3 py-2.5 text-sm" style={{ color: "var(--color-text-muted)" }}>{user.email}</td>
                  {/* Role */}
                  <td className="px-3 py-2.5">
                    <RoleSessionPill roleName={user.role_name} label={user.role_display_name} />
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2.5"><StatusBadge active={user.is_active} /></td>
                  {/* 2FA */}
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setMfaConfirmUser(user)}
                      className="rounded-md transition-opacity hover:opacity-80"
                      title="Change 2FA requirement"
                    >
                      <MfaBadge required={user.mfa_required !== false} />
                    </button>
                  </td>
                  {/* Must change PW */}
                  <td className="px-3 py-2.5">
                    {user.must_change_password ? (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Pending
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>—</span>
                    )}
                  </td>
                  {/* Joined */}
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap" style={{ color: "var(--color-text-muted)" }}>
                    {relativeTime(user.created_at)}
                  </td>
                  {/* Actions */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingUser(user)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn("h-7 px-2 text-xs", user.is_active ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : "text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 hover:text-green-700")}
                        onClick={() => handleDeactivate(user)}
                        disabled={deactivatingId === user.id}
                      >
                        {user.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: card list ── */}
      <div className="flex flex-col gap-3 sm:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[10px] border p-4 space-y-3" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full animate-pulse" style={{ background: "var(--color-border)" }} />
                <div className="h-4 w-28 rounded animate-pulse" style={{ background: "var(--color-border)" }} />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-40 rounded animate-pulse" style={{ background: "var(--color-border)" }} />
                <div className="h-3 w-20 rounded animate-pulse" style={{ background: "var(--color-border)" }} />
              </div>
            </div>
          ))
        ) : users.length === 0 ? (
          <div className="rounded-[10px] border p-8 text-center text-sm" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            No users found.
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className="rounded-[10px] border p-4 space-y-3"
              style={{
                background: "var(--color-surface)",
                borderColor: "var(--color-border)",
                opacity: user.is_active ? 1 : 0.55,
              }}
            >
              {/* Top: avatar + name + status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: "var(--color-badge-bg)", color: "var(--color-badge-text)" }}
                  >
                    {initials(user.full_name, user.email)}
                  </div>
                  <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                    {user.full_name ?? "—"}
                  </span>
                </div>
                <StatusBadge active={user.is_active} />
              </div>

              {/* Fields */}
              <div className="space-y-1.5 text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--color-text-muted)" }}>
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium">Email</span>
                  <span className="normal-case tracking-normal text-xs truncate max-w-[180px]" style={{ color: "var(--color-text-primary)" }}>{user.email}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium">Role</span>
                  <RoleSessionPill roleName={user.role_name} label={user.role_display_name} />
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium">Joined</span>
                  <span className="normal-case tracking-normal text-xs" style={{ color: "var(--color-text-primary)" }}>{relativeTime(user.created_at)}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium">2FA</span>
                  <button type="button" onClick={() => setMfaConfirmUser(user)}>
                    <MfaBadge required={user.mfa_required !== false} />
                  </button>
                </div>
                {user.must_change_password && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-medium">Reset PW</span>
                    <span className="flex items-center gap-1 normal-case tracking-normal text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Pending
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setEditingUser(user)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("flex-1 h-8 text-xs", user.is_active ? "text-destructive border-destructive/40 hover:bg-destructive/10" : "text-green-600 border-green-300 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950/20")}
                  onClick={() => handleDeactivate(user)}
                  disabled={deactivatingId === user.id}
                >
                  {user.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create dialog */}
      <CreateUserDialog
        roles={roles}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(user, emailDelivery) => {
          setCreateOpen(false);
          setUsers((prev) => [user, ...prev]);
          const toast = emailDeliveryToast(
            `User ${user.full_name ?? user.email} created`,
            user.email,
            emailDelivery,
          );
          showToast(toast.message, toast.type);
        }}
      />

      {/* Edit dialog */}
      <EditUserDialog
        user={editingUser}
        roles={roles}
        open={editingUser !== null}
        onClose={() => setEditingUser(null)}
        onSaved={(updated, emailDelivery) => {
          setUsers((prev) => prev.map((u) => u.id === updated.id ? { ...u, ...updated } : u));
          setEditingUser(null);
          const toast = emailDeliveryToast("User updated", updated.email, emailDelivery, true);
          showToast(toast.message, toast.type);
        }}
      />

      {/* MFA confirm dialog */}
      <MfaConfirmDialog
        user={mfaConfirmUser}
        open={mfaConfirmUser !== null}
        saving={mfaSaving}
        onClose={() => setMfaConfirmUser(null)}
        onConfirm={handleMfaConfirm}
      />

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
