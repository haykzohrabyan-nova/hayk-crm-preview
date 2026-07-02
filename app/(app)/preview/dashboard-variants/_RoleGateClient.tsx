"use client";

// Hayk 2026-07-02 — Client-side role gate wrapper for the dashboard-variants
// page (which is a server component). Hides dashboard for designer + print-manager.

import { usePreviewRole } from "../_shared/role";
import { RoleBlocked } from "../_shared/RoleGate";

export function DashboardRoleGate({ children }: { children: React.ReactNode }) {
  const [role] = usePreviewRole();
  if (role === "designer" || role === "print-manager") {
    return <RoleBlocked role={role} />;
  }
  return <>{children}</>;
}
