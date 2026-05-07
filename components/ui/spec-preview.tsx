import type { LucideIcon } from "lucide-react";

// ─── Building block components ────────────────────────────────────────────────

export function SpecBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: "var(--color-warning-bg)", color: "var(--color-warning)" }}
    >
      {label}
    </span>
  );
}

export function SpecSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2
        className="text-[13px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SpecCard({
  title,
  items,
}: {
  title?: string;
  items: { label: string; value: string }[];
}) {
  return (
    <div
      className="rounded-[10px] border divide-y overflow-hidden"
      style={{ borderColor: "var(--color-border)" }}
    >
      {title && (
        <div
          className="px-4 py-2.5 text-[12px] font-medium"
          style={{
            background: "color-mix(in srgb, var(--color-border) 30%, transparent)",
            color: "var(--color-text-muted)",
          }}
        >
          {title}
        </div>
      )}
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="flex items-start gap-4 px-4 py-2.5"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
          }}
        >
          <span
            className="w-36 shrink-0 text-[12px] font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {label}
          </span>
          <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SpecNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[8px] border-l-4 px-4 py-3 text-[12px]"
      style={{
        background: "var(--color-info-bg)",
        borderLeftColor: "var(--color-info-text)",
        color: "var(--color-info-text)",
      }}
    >
      {children}
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export function SpecPreviewPage({
  icon: Icon,
  title,
  subtitle,
  status = "Planned — not yet built",
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "var(--color-badge-bg)" }}
        >
          <Icon className="h-5 w-5" style={{ color: "var(--color-badge-text)" }} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1
              className="text-[20px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {title}
            </h1>
            <SpecBadge label={status} />
          </div>
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            {subtitle}
          </p>
        </div>
      </div>

      <div
        className="border-t"
        style={{ borderColor: "var(--color-border)" }}
      />

      {children}
    </div>
  );
}
