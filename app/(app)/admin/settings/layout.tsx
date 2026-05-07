import { SettingsTabNav } from "@/components/admin/settings-tab-nav";

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 pb-8 pt-4">
      <SettingsTabNav />
      {children}
    </div>
  );
}
