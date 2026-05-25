/** One-line KPI calculation hint — sits below the value / subtext. */
export function KpiHelpLine({
  text,
  variant = "default",
}: {
  text: string;
  variant?: "default" | "accent" | "warning";
}) {
  const color =
    variant === "accent"
      ? "var(--color-btn-verify-text)"
      : variant === "warning"
        ? "var(--color-text-muted)"
        : "var(--color-text-muted)";

  const opacity = variant === "accent" ? 0.75 : 1;

  return (
    <p
      className="mt-1.5 text-[11px] leading-snug"
      style={{ color, opacity }}
    >
      {text}
    </p>
  );
}
