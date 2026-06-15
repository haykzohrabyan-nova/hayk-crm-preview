/** Shared style maps for order list pages (orders, production, completed). */

export const PRIORITY_STYLE: Record<string, { color: string }> = {
  High:   { color: "var(--color-danger)" },
  Normal: { color: "var(--color-text-muted)" },
  Low:    { color: "var(--color-success)" },
};

export const PAYMENT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  unpaid:  { bg: "var(--color-danger-bg)",  text: "var(--color-danger)",  label: "Unpaid" },
  partial: { bg: "var(--color-warning-bg)", text: "var(--color-warning)", label: "Partial" },
  paid:    { bg: "var(--color-success-bg)", text: "var(--color-success)", label: "Paid" },
};
