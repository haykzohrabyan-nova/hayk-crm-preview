"use client";

// Hayk 2026-07-02 — Role gate for preview pages.
// Wrap a page render tree; if the current role can't see it, show a friendly
// message + link back to a role-appropriate home.

import Link from "next/link";
import {
  usePreviewRole,
  canSee,
  PREVIEW_ROLE_LABELS,
  PREVIEW_ROLE_HOME,
  type Capability,
  type PreviewRole,
} from "./role";

const ACCENT = "#FF5D2E";

export function RoleGate({
  capability,
  children,
}: {
  capability: Capability;
  children: React.ReactNode;
}) {
  const [role] = usePreviewRole();
  if (canSee(role, capability)) {
    return <>{children}</>;
  }
  return <RoleBlocked role={role} />;
}

export function RoleBlocked({ role }: { role: PreviewRole }) {
  const home = PREVIEW_ROLE_HOME[role] ?? "/preview/dashboard-variants";
  const homeLabel =
    role === "sales" ? "Sales Pipeline"
    : role === "sdr" ? "Leads"
    : role === "designer" ? "Designer Home"
    : role === "accountant" ? "Payments"
    : role === "print-manager" ? "Orders"
    : "Dashboard";

  return (
    <div
      style={{
        padding: "48px 32px",
        borderRadius: "12px",
        background: "var(--preview-surface, #fff)",
        border: "1px dashed var(--preview-border, #e5e5e5)",
        textAlign: "center",
        maxWidth: "560px",
        margin: "40px auto",
      }}
    >
      <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔒</div>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--preview-text, #111)", marginBottom: "6px" }}>
        This module isn&apos;t available in the {PREVIEW_ROLE_LABELS[role]} view.
      </div>
      <div style={{ fontSize: "12px", color: "var(--preview-text-muted, #666)", marginBottom: "16px" }}>
        Switch role from the top-right chip to see it, or head back to your home.
      </div>
      <Link
        href={home}
        style={{
          display: "inline-block",
          padding: "8px 14px",
          fontSize: "12px",
          fontWeight: 600,
          color: "#fff",
          background: ACCENT,
          borderRadius: "6px",
          textDecoration: "none",
        }}
      >
        Go to {homeLabel} →
      </Link>
    </div>
  );
}
