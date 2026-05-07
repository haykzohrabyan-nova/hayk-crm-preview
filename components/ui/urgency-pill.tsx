interface UrgencyPillProps {
  urgency: string | null | undefined;
}

export function UrgencyPill({ urgency }: UrgencyPillProps) {
  const style = urgency === "High"
    ? { background: "var(--color-danger-bg)", color: "var(--color-danger)" }
    : urgency === "Medium"
    ? { background: "var(--color-warning-bg)", color: "var(--color-warning)" }
    : urgency === "Low"
    ? { background: "var(--color-success-bg)", color: "var(--color-success)" }
    : { background: "var(--color-neutral-bg)", color: "var(--color-neutral-text)" };

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={style}
    >
      {urgency ?? "Not Defined"}
    </span>
  );
}
