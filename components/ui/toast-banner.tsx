"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export interface ToastMessage {
  message: string;
  type: "success" | "error";
}

export function ToastBanner({
  message,
  type,
  onDismiss,
}: ToastMessage & { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex min-w-[260px] items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-border)",
        borderLeftWidth: 4,
        borderLeftColor: type === "success" ? "var(--color-success)" : "var(--color-danger)",
        color: "var(--color-text-primary)",
      }}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} style={{ color: "var(--color-text-muted)" }}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
