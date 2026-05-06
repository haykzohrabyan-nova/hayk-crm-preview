import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — BazarCRM",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--foreground)" }}>
          Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Manage your account and application preferences.
        </p>
      </div>

      {/* Settings sections placeholder */}
      <div className="flex flex-col gap-4">
        {["Account", "Security", "Notifications", "Appearance"].map((section) => (
          <div
            key={section}
            className="rounded-xl border p-5"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
          >
            <h2 className="font-medium" style={{ color: "var(--foreground)" }}>
              {section}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              {section} settings will be configured here.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
