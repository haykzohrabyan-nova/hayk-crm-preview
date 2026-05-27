"use client";

import { useState } from "react";
import { ActivityLogSection } from "@/components/admin/activity-log-section";
import { UserActivitySection } from "@/components/admin/user-activity-section";

const TABS = [
  { id: "activity", label: "Order / Lead Activity" },
  { id: "users",    label: "User Activity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ActivityLogPage() {
  const [activeTab, setActiveTab] = useState<TabId>("activity");

  return (
    <div className="space-y-5">
      <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        Activity Log
      </h1>

      <div
        className="flex border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-2.5 text-[13px] transition-colors"
              style={{
                fontWeight: active ? 500 : 400,
                color: active ? "var(--color-tab-active)" : "var(--color-tab-inactive)",
              }}
            >
              {tab.label}
              {active && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                  style={{ background: "var(--color-tab-underline)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "activity" && <ActivityLogSection />}
      {activeTab === "users"    && <UserActivitySection />}
    </div>
  );
}
