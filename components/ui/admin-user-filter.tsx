"use client";

import { useEffect, useState } from "react";
import { memberOptionLabel } from "@/lib/utils/parse-embedded-role";

interface TeamUser {
  id: string;
  full_name: string | null;
  role_name: string;
  role_display_name: string;
}

const ROLE_ORDER: Record<string, number> = { sdr: 0, sales: 1, accountant: 2, admin: 3 };

/** Admin-only team member filter for list pages (`user_id` query param). */
export function AdminUserFilter({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (userId: string | null) => void;
  className?: string;
}) {
  const [users, setUsers] = useState<TeamUser[]>([]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.users ?? []) as TeamUser[];
        list.sort((a, b) => {
          const byRole = (ROLE_ORDER[a.role_name] ?? 50) - (ROLE_ORDER[b.role_name] ?? 50);
          if (byRole !== 0) return byRole;
          return (a.full_name ?? "").localeCompare(b.full_name ?? "", undefined, {
            sensitivity: "base",
          });
        });
        setUsers(list);
      })
      .catch(() => {});
  }, []);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label="Filter by team member"
      className={className ?? "rounded-[6px] border px-3 py-2 text-[13px] font-medium outline-none h-8 min-w-[180px]"}
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-primary)",
      }}
    >
      <option value="">All team members</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {memberOptionLabel(u.full_name ?? "Unnamed", {
            name: u.role_name,
            display_name: u.role_display_name,
          })}
        </option>
      ))}
    </select>
  );
}
