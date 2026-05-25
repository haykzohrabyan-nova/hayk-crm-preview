"use client";

import { useEffect, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { PERIOD_LABELS } from "@/lib/utils/get-period-start";
import {
  defaultCustomToDate,
  parseReportDateInput,
  presetDateInputs,
} from "@/lib/utils/reports-date-range";

type Period = "week" | "month" | "quarter";

export interface ReportsTimeFilter {
  period: Period;
  useCustomRange: boolean;
  dateFrom: string;
  dateTo: string;
}

interface ReportsFiltersModalProps {
  open: boolean;
  applied: ReportsTimeFilter;
  onClose: () => void;
  onApply: (filter: ReportsTimeFilter) => void;
}

export function reportsTimeFilterLabel(filter: ReportsTimeFilter): string {
  if (filter.useCustomRange && filter.dateFrom && filter.dateTo) {
    const fmt = (s: string) => {
      const d = parseReportDateInput(s);
      return d?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? s;
    };
    return `${fmt(filter.dateFrom)} – ${fmt(filter.dateTo)}`;
  }
  return PERIOD_LABELS[filter.period];
}

export function ReportsFiltersModal({
  open,
  applied,
  onClose,
  onApply,
}: ReportsFiltersModalProps) {
  const [period, setPeriod] = useState<Period>(applied.period);
  const [useCustom, setUseCustom] = useState(applied.useCustomRange);
  const [dateFrom, setDateFrom] = useState(applied.dateFrom);
  const [dateTo, setDateTo] = useState(applied.dateTo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeriod(applied.period);
    setUseCustom(applied.useCustomRange);
    if (applied.useCustomRange && applied.dateFrom && applied.dateTo) {
      setDateFrom(applied.dateFrom);
      setDateTo(applied.dateTo);
    } else {
      const preset = presetDateInputs(applied.period);
      setDateFrom(preset.from);
      setDateTo(preset.to);
    }
    setError(null);
  }, [open, applied]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function selectPreset(next: Period) {
    const preset = presetDateInputs(next);
    setPeriod(next);
    setUseCustom(false);
    setDateFrom(preset.from);
    setDateTo(preset.to);
    setError(null);
  }

  function handleApply() {
    if (useCustom) {
      if (!dateFrom || !dateTo) {
        setError("Choose both a start and end date.");
        return;
      }
      if (dateFrom > dateTo) {
        setError("Start date must be on or before end date.");
        return;
      }
      onApply({ period, useCustomRange: true, dateFrom, dateTo });
    } else {
      onApply({ period, useCustomRange: false, dateFrom: "", dateTo: "" });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[520px] rounded-[12px] border p-6 shadow-xl"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reports-filters-title"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2
              id="reports-filters-title"
              className="flex items-center gap-2 text-[15px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              <CalendarRange className="h-4 w-4" style={{ color: "var(--color-accent-dark)" }} />
              Report filters
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-muted)" }}>
              Choose a time range for cash, scorecards, ledger, and funnel data.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] p-1 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          <section>
            <p
              className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Quick presets
            </p>
            <div
              className="flex flex-wrap rounded-[8px] border p-0.5 text-[13px] font-medium"
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
            >
              {(["week", "month", "quarter"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectPreset(p)}
                  className="flex-1 rounded-[6px] px-3 py-2 transition-all min-w-[90px]"
                  style={{
                    background: !useCustom && period === p ? "var(--color-btn-verify-bg)" : "transparent",
                    color: !useCustom && period === p ? "var(--color-btn-verify-text)" : "var(--color-text-muted)",
                  }}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p
              className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Date range
            </p>
            <div
              className="rounded-[10px] border p-4 space-y-3"
              style={{
                background: useCustom
                  ? "color-mix(in srgb, var(--color-accent) 6%, var(--color-bg))"
                  : "color-mix(in srgb, var(--color-btn-verify-bg) 8%, var(--color-bg))",
                borderColor: useCustom
                  ? "color-mix(in srgb, var(--color-accent) 25%, var(--color-border))"
                  : "color-mix(in srgb, var(--color-btn-verify-bg) 30%, var(--color-border))",
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
                    From
                  </span>
                  <DatePicker
                    inModal
                    value={dateFrom}
                    onChange={(v) => {
                      setDateFrom(v);
                      setUseCustom(true);
                      setError(null);
                    }}
                    placeholder="Start date"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium" style={{ color: "var(--color-text-muted)" }}>
                    To
                  </span>
                  <DatePicker
                    inModal
                    value={dateTo}
                    onChange={(v) => {
                      setDateTo(v);
                      setUseCustom(true);
                      setError(null);
                    }}
                    placeholder="End date"
                  />
                </label>
              </div>
              <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                {useCustom
                  ? "Custom range — edit either date to pick your own window."
                  : `Showing dates for ${PERIOD_LABELS[period].toLowerCase()}. Edit a date to switch to custom.`}
              </p>
            </div>
          </section>

          {/* Future filters (product, source, etc.) can be added here. */}
        </div>

        {error && (
          <p className="mt-4 text-[12px] font-medium" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] border px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text-muted)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-[6px] px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
            style={{
              background: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  );
}
