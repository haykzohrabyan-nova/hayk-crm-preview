"use client";

// Hayk 2026-07-02 — Preview role picker UI.
// Floating chip in top-right of preview area + compact variant for sidebar footer.

import { useEffect, useRef, useState } from "react";
import {
  PREVIEW_ROLES,
  PREVIEW_ROLE_LABELS,
  PREVIEW_ROLE_DESCRIPTIONS,
  usePreviewRole,
  type PreviewRole,
} from "./role";

const ACCENT = "#FF5D2E";

function RoleDropdown({
  role,
  onPick,
  onClose,
  align = "right",
}: {
  role: PreviewRole;
  onPick: (r: PreviewRole) => void;
  onClose: () => void;
  align?: "right" | "left";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        [align]: 0,
        width: "280px",
        background: "var(--preview-surface, #fff)",
        border: "1px solid var(--preview-border, #e5e5e5)",
        borderRadius: "10px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        padding: "6px",
        zIndex: 9999,
      } as React.CSSProperties}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--preview-text-muted, #666)",
          padding: "8px 10px 4px",
        }}
      >
        View CRM as…
      </div>
      {PREVIEW_ROLES.map((r) => {
        const active = r === role;
        return (
          <button
            key={r}
            onClick={() => {
              onPick(r);
              onClose();
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "2px",
              width: "100%",
              padding: "8px 10px",
              background: active ? ACCENT + "18" : "transparent",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              textAlign: "left",
              color: "var(--preview-text, #111)",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--preview-chip-bg, #f5f5f5)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }
            }}
          >
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: active ? ACCENT : "var(--preview-text, #111)",
              }}
            >
              {PREVIEW_ROLE_LABELS[r]}
              {active && (
                <span
                  style={{
                    marginLeft: "6px",
                    fontSize: "10px",
                    fontWeight: 700,
                    color: ACCENT,
                  }}
                >
                  ●
                </span>
              )}
            </span>
            <span style={{ fontSize: "11px", color: "var(--preview-text-muted, #777)" }}>
              {PREVIEW_ROLE_DESCRIPTIONS[r]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Floating top-right chip ─────────────────────────
export function FloatingRolePicker() {
  const [role, setRole] = usePreviewRole();
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        top: "14px",
        right: "18px",
        zIndex: 9998,
      }}
    >
      <div style={{ position: "relative" }}>
        <button
          data-preview-role-chip
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            fontWeight: 600,
            color: "#fff",
            background: "#111",
            border: `1px solid ${ACCENT}`,
            borderRadius: "999px",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          }}
        >
          <span style={{ fontSize: "12px" }}>👁</span>
          <span>
            Viewing as: <b>{PREVIEW_ROLE_LABELS[role]}</b>
          </span>
          <span style={{ opacity: 0.7 }}>▾</span>
        </button>
        {open && (
          <RoleDropdown
            role={role}
            onPick={(r) => {
              setRole(r);
              // full reload so server-side page components re-render with new role
              setTimeout(() => window.location.reload(), 0);
            }}
            onClose={() => setOpen(false)}
            align="right"
          />
        )}
      </div>
    </div>
  );
}

// ─── Compact sidebar-footer variant ──────────────────
export function SidebarRolePicker({ collapsed }: { collapsed: boolean }) {
  const [role, setRole] = usePreviewRole();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={collapsed ? `Preview role: ${PREVIEW_ROLE_LABELS[role]}` : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          padding: collapsed ? "8px 0" : "8px 10px",
          background: "transparent",
          border: "1px dashed var(--color-sidebar-divider, #e5e5e5)",
          borderRadius: "6px",
          cursor: "pointer",
          color: "var(--color-sidebar-nav-muted)",
          fontSize: "12px",
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <span style={{ fontSize: "13px" }}>👁</span>
        {!collapsed && (
          <span style={{ flex: 1, textAlign: "left" }}>
            <span style={{ display: "block", fontSize: "10px", opacity: 0.7, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Preview as
            </span>
            <span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--color-sidebar-nav)" }}>
              {PREVIEW_ROLE_LABELS[role]}
            </span>
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: "6px", width: "280px" }}>
          <RoleDropdown
            role={role}
            onPick={(r) => {
              setRole(r);
              setTimeout(() => window.location.reload(), 0);
            }}
            onClose={() => setOpen(false)}
            align="left"
          />
        </div>
      )}
    </div>
  );
}
