export function TicketSkeleton() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: "var(--color-bg)" }}>
      <div
        className="border-b px-6 py-4 flex items-center gap-3"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="h-5 w-16 rounded" style={{ background: "var(--color-border)" }} />
        <div className="h-6 w-64 rounded" style={{ background: "var(--color-border)" }} />
      </div>
      <div className="w-full px-6 py-6 flex gap-6">
        <div className="w-72 h-64 rounded-xl" style={{ background: "var(--color-surface)" }} />
        <div className="flex-1 h-96 rounded-xl" style={{ background: "var(--color-surface)" }} />
      </div>
    </div>
  );
}
