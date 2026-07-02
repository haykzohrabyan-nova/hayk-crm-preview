"use client";

// Hayk 2026-07-02 — Preview role banner strip.
// Shows at the top of /preview/* when the active role is not admin.

import { usePreviewRole, PREVIEW_ROLE_LABELS } from "./role";

const ACCENT = "#FF5D2E";

export function PreviewRoleBanner() {
  const [role] = usePreviewRole();
  if (role === "admin") return null;

  function openPicker() {
    // Just scroll into view + emit a click on the floating chip — simplest.
    const chip = document.querySelector<HTMLButtonElement>(
      "[data-preview-role-chip]"
    );
    if (chip) chip.click();
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 14px",
        marginBottom: "12px",
        background: ACCENT + "18",
        border: `1px solid ${ACCENT}55`,
        borderRadius: "8px",
        fontSize: "12px",
        color: "var(--preview-text, #111)",
      }}
    >
      <span style={{ fontSize: "13px" }}>👁</span>
      <span>
        Previewing as <b>{PREVIEW_ROLE_LABELS[role]}</b>. Some features are hidden or read-only.
      </span>
      <button
        onClick={openPicker}
        style={{
          marginLeft: "auto",
          fontSize: "12px",
          fontWeight: 600,
          color: ACCENT,
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        Switch role ↗
      </button>
    </div>
  );
}
