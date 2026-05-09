import type { Metadata } from "next";
import { Construction } from "lucide-react";

export const metadata: Metadata = {
  title: "My Profile — BazaarPrinting CRM",
};

export default function ProfilePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-[12px]"
        style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }}
      >
        <Construction className="h-6 w-6" style={{ color: "var(--color-accent)" }} />
      </div>
      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          My Profile
        </h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--color-text-muted)" }}>
          Profile settings coming soon.
        </p>
      </div>
    </div>
  );
}
