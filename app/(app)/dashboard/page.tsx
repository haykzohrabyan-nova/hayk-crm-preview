import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — BazarCRM",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
          Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Welcome to BazarCRM. Your overview will appear here.
        </p>
      </div>

      {/* KPI placeholder grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Total Customers", "Active Deals", "Revenue MTD", "Open Tasks"].map((label) => (
          <div
            key={label}
            className="rounded-xl border p-5"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
              —
            </p>
          </div>
        ))}
      </div>

      {/* Content placeholder */}
      <div
        className="flex min-h-40 items-center justify-center rounded-xl border border-dashed"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Charts and activity feed will live here.
        </p>
      </div>
    </div>
  );
}
