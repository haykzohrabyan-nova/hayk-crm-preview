"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, parse, isValid } from "date-fns";
import { CalendarDays, X } from "lucide-react";

interface DatePickerProps {
  value: string;          // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className = "",
  style,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleSelect(day: Date | undefined) {
    if (day) {
      onChange(format(day, "yyyy-MM-dd"));
    } else {
      onChange("");
    }
    setOpen(false);
  }

  return (
    <div ref={ref} className={`relative ${className}`} style={style}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm border text-left transition-all disabled:opacity-40"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: selected ? "var(--color-text-primary)" : "var(--color-text-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          outline: open ? `2px solid var(--color-accent)` : "none",
          outlineOffset: "1px",
        }}
      >
        <CalendarDays size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
        <span className="flex-1 truncate">
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </span>
        {selected && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-text-muted)" }}
          >
            <X size={12} />
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-xl shadow-lg border p-3"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            minWidth: "280px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          <style>{`
            .rdp-root {
              --rdp-accent-color: var(--color-accent);
              --rdp-accent-background-color: var(--color-badge-bg);
              font-size: 13px;
            }
            .rdp-month_caption {
              font-size: 13px;
              font-weight: 600;
              color: var(--color-text-primary);
              padding-bottom: 8px;
              display: flex;
              align-items: center;
              justify-content: space-between;
            }
            .rdp-nav { display: flex; gap: 4px; }
            .rdp-button_previous, .rdp-button_next {
              background: var(--color-bg);
              border: 1px solid var(--color-border);
              border-radius: 6px;
              width: 28px;
              height: 28px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              color: var(--color-text-muted);
              transition: opacity 0.15s;
            }
            .rdp-button_previous:hover, .rdp-button_next:hover { opacity: 0.7; }
            .rdp-weekdays { border-bottom: 1px solid var(--color-border); margin-bottom: 4px; }
            .rdp-weekday {
              font-size: 11px;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: var(--color-text-muted);
              width: 36px;
              text-align: center;
              padding: 4px 0;
            }
            .rdp-week { display: flex; }
            .rdp-day { width: 36px; height: 36px; }
            .rdp-day_button {
              width: 34px;
              height: 34px;
              border-radius: 8px;
              border: none;
              background: transparent;
              cursor: pointer;
              font-size: 13px;
              color: var(--color-text-primary);
              transition: background 0.12s, color 0.12s;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .rdp-day_button:hover {
              background: var(--color-badge-bg);
              color: var(--color-badge-text);
            }
            .rdp-selected .rdp-day_button {
              background: var(--color-accent) !important;
              color: var(--color-btn-primary-text) !important;
              font-weight: 600;
            }
            .rdp-today:not(.rdp-selected) .rdp-day_button {
              font-weight: 600;
              color: var(--color-accent);
            }
            .rdp-outside .rdp-day_button { opacity: 0.35; }
            .rdp-disabled .rdp-day_button { opacity: 0.25; cursor: not-allowed; }
          `}</style>
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected ?? new Date()}
          />
        </div>
      )}
    </div>
  );
}
