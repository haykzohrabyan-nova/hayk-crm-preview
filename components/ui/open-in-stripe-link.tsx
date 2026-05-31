"use client";

import { ExternalLink } from "lucide-react";

const linkClass =
  "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-2 text-[13px] font-medium border no-underline";

const linkStyle = {
  borderColor: "var(--color-border)",
  color: "var(--color-text-primary)",
  background: "var(--color-surface)",
} as const;

export function OpenInStripeLink({
  href,
  label = "Open in Stripe",
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
      style={linkStyle}
    >
      <ExternalLink size={14} />
      {label}
    </a>
  );
}
