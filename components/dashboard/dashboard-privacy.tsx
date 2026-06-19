"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DASHBOARD_VALUES_HIDDEN_LABEL } from "@/lib/utils/dashboard-privacy";

export { DASHBOARD_VALUES_HIDDEN_LABEL };

/** Masked placeholder for KPI cells — no real digits in the DOM. */
export function DashboardHiddenValue({
  size = "lg",
  kind = "count",
  accent = false,
}: {
  size?: "lg" | "sm";
  kind?: "currency" | "count";
  accent?: boolean;
}) {
  const color = accent ? "var(--color-btn-verify-text)" : "var(--color-text-muted)";
  const opacity = accent ? 0.8 : 1;
  const dotCount = kind === "currency" ? 5 : 3;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="text"
      aria-label={DASHBOARD_VALUES_HIDDEN_LABEL}
    >
      <EyeOff
        size={size === "lg" ? 15 : 12}
        strokeWidth={2}
        style={{ color, opacity: opacity * 0.85, flexShrink: 0 }}
        aria-hidden
      />
      <span
        className={
          size === "lg"
            ? "inline-flex items-baseline gap-px text-[28px] font-semibold leading-none tabular-nums"
            : "inline-flex items-baseline gap-px text-[13px] font-semibold tabular-nums"
        }
        style={{ color, opacity }}
        aria-hidden
      >
        {kind === "currency" && (
          <span style={{ letterSpacing: "0.02em" }}>$</span>
        )}
        {Array.from({ length: dotCount }, (_, i) => (
          <span key={i} style={{ letterSpacing: "0.08em" }}>
            •
          </span>
        ))}
      </span>
    </span>
  );
}

export function displayDashboardValue(
  valuesHidden: boolean,
  formatted: string | number,
): string | number {
  return valuesHidden ? DASHBOARD_VALUES_HIDDEN_LABEL : formatted;
}

export function useDashboardPrivacy(onAfterToggle?: () => void | Promise<void>) {
  const [valuesHidden, setValuesHidden] = useState(false);
  const [privacyLoaded, setPrivacyLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingHidden, setPendingHidden] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/dashboard-privacy")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.dashboard_values_hidden === "boolean") {
          setValuesHidden(d.dashboard_values_hidden);
        }
      })
      .catch(() => {})
      .finally(() => setPrivacyLoaded(true));
  }, []);

  const syncFromApi = useCallback((hidden: boolean) => {
    setValuesHidden(hidden);
  }, []);

  const requestToggle = useCallback(() => {
    setPendingHidden(!valuesHidden);
    setConfirmOpen(true);
  }, [valuesHidden]);

  const confirmToggle = useCallback(async () => {
    if (pendingHidden === null) return;
    setSaving(true);
    try {
      const res = await fetch("/api/user/dashboard-privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboard_values_hidden: pendingHidden }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json.dashboard_values_hidden === "boolean") {
        setValuesHidden(json.dashboard_values_hidden);
      }
      setConfirmOpen(false);
      setPendingHidden(null);
      await onAfterToggle?.();
    } finally {
      setSaving(false);
    }
  }, [pendingHidden, onAfterToggle]);

  return {
    valuesHidden,
    privacyLoaded,
    syncFromApi,
    requestToggle,
    confirmOpen,
    setConfirmOpen,
    pendingHidden,
    saving,
    confirmToggle,
  };
}

export function DashboardValuesPrivacyToggle({
  valuesHidden,
  onRequestToggle,
  confirmOpen,
  onConfirmOpenChange,
  pendingHidden,
  saving,
  onConfirm,
}: {
  valuesHidden: boolean;
  onRequestToggle: () => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  pendingHidden: boolean | null;
  saving: boolean;
  onConfirm: () => void;
}) {
  const showingHidden = pendingHidden ?? valuesHidden;

  return (
    <>
      <div
        className="rounded-[8px] border p-0.5 shrink-0 w-full lg:w-auto"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <button
          type="button"
          onClick={onRequestToggle}
          className="inline-flex w-full justify-center lg:w-auto lg:justify-start items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-all"
          style={{ color: "var(--color-text-primary)" }}
        >
          {valuesHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {valuesHidden ? "Show values" : "Hide values"}
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={onConfirmOpenChange}>
        <DialogContent className="sm:max-w-[440px]" showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--color-text-primary)" }}>
              {showingHidden ? "Hide dashboard values?" : "Show dashboard values?"}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--color-text-muted)" }}>
              {showingHidden
                ? "Numbers will not be loaded while hidden. Card labels and date filters stay visible."
                : "Dashboard metrics will load again for your account."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onConfirmOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={onConfirm}>
              {saving ? "Saving…" : showingHidden ? "Hide values" : "Show values"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
