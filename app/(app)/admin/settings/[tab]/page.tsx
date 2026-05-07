import { notFound } from "next/navigation";
import { UsersSection } from "@/components/admin/users-section";
import { RolesSection } from "@/components/admin/roles-section";

// ─── Supported tabs ───────────────────────────────────────────────────────────

const SUPPORTED_TABS = ["users", "roles", "dropdowns", "notifications"] as const;
type AdminTab = (typeof SUPPORTED_TABS)[number];

function isValidTab(tab: string): tab is AdminTab {
  return (SUPPORTED_TABS as readonly string[]).includes(tab);
}

// ─── Coming-soon placeholder ──────────────────────────────────────────────────

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px]"
        style={{ background: "var(--color-border)" }}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)" }}
        >
          Soon
        </span>
      </div>
      <h2
        className="mb-1 text-[17px] font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        {title}
      </h2>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        This section is coming soon.
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminSettingsTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;

  if (!isValidTab(tab)) notFound();

  switch (tab) {
    case "users":
      return <UsersSection />;
    case "roles":
      return <RolesSection />;
    case "dropdowns":
      return <ComingSoon title="Dropdown Options" />;
    case "notifications":
      return <ComingSoon title="Notifications" />;
  }
}

// Static params so Next.js pre-renders the known tab routes
export function generateStaticParams() {
  return SUPPORTED_TABS.map((tab) => ({ tab }));
}
