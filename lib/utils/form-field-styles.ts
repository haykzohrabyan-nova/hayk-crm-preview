/**
 * Shared form field style constants for modals and drawers.
 * Two patterns are exported:
 *   - Tailwind (cls + style object) — used by most modals/drawers
 *   - Inline (full React.CSSProperties) — used by sub-form components
 */
import type React from "react";

// ─── Pattern A: Tailwind class + inline style (most modals/drawers) ───────────

export const labelCls =
  "block text-[11px] font-medium uppercase tracking-[0.06em] mb-1";

export const labelStyle: React.CSSProperties = {
  color: "var(--color-text-muted)",
};

export const inputCls =
  "w-full h-9 rounded-[6px] border px-3 text-sm outline-none transition-all";

export const inputStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
};

// ─── Pattern B: Inline-only style objects (sub-forms without Tailwind cls) ───

export const labelStyleInline: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: 4,
};

export const inputStyleInline: React.CSSProperties = {
  width: "100%",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
};
