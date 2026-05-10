"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SdrDashboard } from "@/components/sdr-dashboard";
import { SalesDashboard } from "@/components/sales-dashboard";
import { AdminDashboard } from "@/components/admin-dashboard";

type Role = "sdr" | "sales" | "admin" | null;

export function DashboardPage() {
  const [role, setRole] = useState<Role>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("roles(name)")
        .eq("id", uid)
        .single();
      const name = (profile?.roles as unknown as { name: string } | null)?.name;
      if (name === "sdr" || name === "sales" || name === "admin") setRole(name);
    });
  }, []);

  if (!role) {
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

  if (role === "sdr")   return <SdrDashboard />;
  if (role === "sales") return <SalesDashboard />;
  if (role === "admin") return <AdminDashboard />;

  return null;
}
