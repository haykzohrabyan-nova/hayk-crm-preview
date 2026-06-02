"use client";

import { useAppSession } from "@/components/layout/app-session-provider";
import { SdrDashboard } from "@/components/sales/sdr-dashboard";
import { SalesDashboard } from "@/components/sales/sales-dashboard";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AccountantDashboard } from "@/components/admin/accountant-dashboard";

type Role = "sdr" | "sales" | "admin" | "accountant" | null;

export function DashboardPage() {
  const { me, loading } = useAppSession();
  const roleName = me?.roleName;
  const role: Role =
    roleName === "sdr" ||
    roleName === "sales" ||
    roleName === "admin" ||
    roleName === "accountant"
      ? roleName
      : null;

  if (loading || !role) {
    // Skeleton while role loads — matches the 3-col KPI grid
    return (
      <div className="space-y-8">
        <div className="h-7 w-32 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[10px] border p-5 flex flex-col gap-3"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
                <div className="h-8 w-8 animate-pulse rounded-[8px]" style={{ background: "var(--color-border)" }} />
              </div>
              <div className="space-y-2">
                <div className="h-8 w-20 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
                <div className="h-3 w-16 animate-pulse rounded" style={{ background: "var(--color-border)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (role === "sdr")        return <SdrDashboard />;
  if (role === "sales")      return <SalesDashboard />;
  if (role === "admin")      return <AdminDashboard />;
  if (role === "accountant") return <AccountantDashboard />;

  return null;
}
