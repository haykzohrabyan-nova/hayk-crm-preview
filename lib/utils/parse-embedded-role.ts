/** Normalize Supabase embedded `roles(name, display_name)` — object or single-element array. */

const ROLE_LABELS: Record<string, string> = {
  sdr: "SDR",
  sales: "Sales",
  admin: "Admin",
  accountant: "Accountant",
};

export interface EmbeddedRole {
  name: string;
  display_name: string;
}

export function parseEmbeddedRole(roles: unknown): EmbeddedRole | null {
  if (!roles) return null;
  const raw = Array.isArray(roles) ? roles[0] : roles;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { name?: string; display_name?: string };
  if (!r.name) return null;
  const display =
    (typeof r.display_name === "string" && r.display_name.trim()) ||
    ROLE_LABELS[r.name] ||
    r.name.charAt(0).toUpperCase() + r.name.slice(1);
  return { name: r.name, display_name: display };
}

export function memberOptionLabel(fullName: string, role: EmbeddedRole | null): string {
  if (!role?.display_name) return fullName;
  return `${fullName} (${role.display_name})`;
}
