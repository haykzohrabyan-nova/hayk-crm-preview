import { AdminSubNav } from "@/components/admin/admin-sub-nav";

// proxy.ts already blocks non-admins before this layout runs.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div
        className="border-b px-6 py-2"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-bg)",
        }}
      >
        <AdminSubNav />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
