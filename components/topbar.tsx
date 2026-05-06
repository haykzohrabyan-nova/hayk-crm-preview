"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function Topbar() {
  const { theme, setTheme } = useTheme();

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <header
      className="flex h-14 w-full shrink-0 items-center justify-between px-6"
      style={{
        backgroundColor: "var(--color-topbar)",
        borderBottom: "1px solid transparent",
      }}
    >
      {/* Brand */}
      <span
        className="text-sm font-semibold tracking-widest select-none"
        style={{
          color: "var(--color-accent)",
          letterSpacing: "0.05em",
        }}
      >
        BAZAARPRINTING
        <span
          className="ml-1.5 font-normal opacity-60"
          style={{ color: "var(--color-accent)", letterSpacing: "0.02em" }}
        >
          CRM
        </span>
      </span>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          style={{
            color: "rgba(255,255,255,0.65)",
          }}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  );
}
