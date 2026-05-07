import Link from "next/link";
import { MessageSquareQuote, ClipboardList } from "lucide-react";
import { SpecBadge } from "@/components/ui/spec-preview";

const SECTIONS = [
  {
    title: "Quoted Requests",
    description: "Active quotes sent to clients — formal tickets and verbal/SMS quotes. Follow up, request approval, and convert to orders.",
    href: "/quotes",
    icon: MessageSquareQuote,
  },
  {
    title: "Orders",
    description: "Confirmed production orders. View details, track status, and print the order ticket PDF for the production team.",
    href: "/orders",
    icon: ClipboardList,
  },
] as const;

export default function TicketsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Tickets
        </h1>
        <SpecBadge label="Planned — not yet built" />
      </div>
      <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
        The Tickets module handles all quotes and production orders. Select a section below.
      </p>

      <div className="border-t" style={{ borderColor: "var(--color-border)" }} />

      {/* Section cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map(({ title, description, href, icon: Icon }) => (
          <Link key={href} href={href} className="group block rounded-[10px] focus-visible:outline-none">
            <div
              className="h-full rounded-[10px] border p-5 transition-shadow group-hover:shadow-md"
              style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-[8px]"
                  style={{ background: "var(--color-badge-bg)" }}
                >
                  <Icon className="h-4 w-4" style={{ color: "var(--color-badge-text)" }} />
                </div>
                <span className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {title}
                </span>
              </div>
              <p className="text-[13px] mb-4" style={{ color: "var(--color-text-muted)" }}>
                {description}
              </p>
              <span
                className="text-[13px] font-medium group-hover:underline"
                style={{ color: "var(--color-tab-active)" }}
              >
                View spec →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
