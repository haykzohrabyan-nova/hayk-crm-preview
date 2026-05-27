"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { SDR_DASHBOARD_PRESET_LABELS } from "@/lib/utils/sdr-dashboard-date-range";
import type {
  DashboardDateRangeFilterValue,
  DashboardDateRangePreset,
} from "@/lib/utils/dashboard-date-range-filter";

const PRESETS = ["today", "yesterday", "last_week", "last_month"] as const;
type Preset = (typeof PRESETS)[number];

export function DashboardDateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: DashboardDateRangeFilterValue;
  onChange: (value: DashboardDateRangeFilterValue) => void;
  className?: string;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.dateFrom);
  const [draftTo, setDraftTo] = useState(value.dateTo);
  const [customError, setCustomError] = useState<string | null>(null);

  function selectPreset(p: Preset) {
    setCustomOpen(false);
    setCustomError(null);
    onChange({ preset: p, dateFrom: draftFrom, dateTo: draftTo });
  }

  function applyCustom() {
    if (!draftFrom || !draftTo) {
      setCustomError("Choose both a start and end date.");
      return;
    }
    if (draftFrom > draftTo) {
      setCustomError("Start date must be on or before end date.");
      return;
    }
    setCustomError(null);
    onChange({ preset: "custom", dateFrom: draftFrom, dateTo: draftTo });
    setCustomOpen(false);
  }

  function isActive(preset: DashboardDateRangePreset): boolean {
    if (preset === "custom") return value.preset === "custom" || customOpen;
    return value.preset === preset && !customOpen;
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
        <div
          className="flex flex-wrap items-center justify-end gap-0.5 rounded-[8px] border p-0.5 text-[13px] font-medium"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => selectPreset(p)}
              className="rounded-[6px] px-3 py-1.5 transition-all shrink-0"
              style={{
                background: isActive(p) ? "var(--color-btn-verify-bg)" : "transparent",
                color: isActive(p) ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
              }}
            >
              {SDR_DASHBOARD_PRESET_LABELS[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomOpen((o) => !o);
              setCustomError(null);
            }}
            className="inline-flex items-center gap-1 rounded-[6px] px-3 py-1.5 transition-all shrink-0"
            style={{
              background: isActive("custom") ? "var(--color-btn-verify-bg)" : "transparent",
              color: isActive("custom") ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
            }}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Custom
          </button>

          {customOpen && (
            <>
              <span
                className="hidden sm:block w-px h-7 mx-0.5 shrink-0"
                style={{ background: "var(--color-border)" }}
                aria-hidden
              />
              <div className="flex items-center gap-1.5 px-1 shrink-0">
                <span
                  className="text-[10px] font-medium uppercase tracking-[0.06em] shrink-0"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  From
                </span>
                <DatePicker value={draftFrom} onChange={setDraftFrom} className="w-[130px]" />
              </div>
              <div className="flex items-center gap-1.5 px-1 shrink-0">
                <span
                  className="text-[10px] font-medium uppercase tracking-[0.06em] shrink-0"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  To
                </span>
                <DatePicker value={draftTo} onChange={setDraftTo} className="w-[130px]" />
              </div>
              <button
                type="button"
                onClick={applyCustom}
                className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium shrink-0"
                style={{
                  background: "var(--color-btn-primary-bg)",
                  color: "var(--color-btn-primary-text)",
                }}
              >
                Apply
              </button>
            </>
          )}
        </div>
        {customError && (
          <p className="text-[12px] w-full text-right sm:w-auto" style={{ color: "var(--color-danger)" }}>
            {customError}
          </p>
        )}
      </div>
    </div>
  );
}
