import { BarChart3 } from "lucide-react";

export default function StatisticsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px]"
        style={{ background: "var(--color-badge-bg)" }}
      >
        <BarChart3 className="h-5 w-5" style={{ color: "var(--color-badge-text)" }} />
      </div>
      <h1
        className="mb-1 text-[18px] font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Statistics
      </h1>
      <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        Analytics — coming soon.
      </p>
    </div>
  );
}
