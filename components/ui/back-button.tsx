"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface BackButtonProps {
  href?: string;       // if provided, navigates to this path; otherwise router.back()
  label?: string;
}

export function BackButton({ href, label = "Back" }: BackButtonProps) {
  const router = useRouter();

  function handleClick() {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 text-[13px] font-medium transition-opacity hover:opacity-70"
      style={{ color: "var(--color-text-muted)" }}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
