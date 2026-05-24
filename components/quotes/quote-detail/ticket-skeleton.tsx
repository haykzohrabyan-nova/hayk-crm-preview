export function TicketSkeleton() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: "var(--color-bg)" }}>
      <div
        className="border-b px-6 py-4 flex items-center gap-3"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="h-5 w-16 rounded" style={{ background: "var(--color-border)" }} />
        <div className="h-6 w-48 rounded" style={{ background: "var(--color-border)" }} />
      </div>
      <div className="w-full px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-[14px]" style={{ background: "var(--color-surface)" }} />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
          <div className="h-80 rounded-[14px]" style={{ background: "var(--color-surface)" }} />
          <div className="h-[520px] rounded-[14px]" style={{ background: "var(--color-surface)" }} />
        </div>
      </div>
    </div>
  );
}
