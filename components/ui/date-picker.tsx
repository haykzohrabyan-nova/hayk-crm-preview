"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
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
    onChange(day ? format(day, "yyyy-MM-dd") : "");
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
          className="absolute z-50 mt-1 rounded-xl border p-3"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {/* Override react-day-picker v10 tokens to match design system */}
          <style>{`
            .bazaar-rdp.rdp-root {
              --rdp-accent-color: var(--color-accent);
              --rdp-accent-background-color: var(--color-badge-bg);
              --rdp-today-color: var(--color-accent);
              --rdp-day-height: 36px;
              --rdp-day-width: 36px;
              --rdp-day_button-height: 34px;
              --rdp-day_button-width: 34px;
              --rdp-day_button-border-radius: 8px;
              --rdp-day_button-border: 2px solid transparent;
              --rdp-selected-border: 2px solid transparent;
              --rdp-nav_button-height: 28px;
              --rdp-nav_button-width: 28px;
              --rdp-nav-height: 32px;
              --rdp-outside-opacity: 0.35;
              --rdp-disabled-opacity: 0.25;
              font-size: 13px;
              color: var(--color-text-primary);
            }

            /* Month caption / header */
            .bazaar-rdp .rdp-month_caption {
              font-size: 13px;
              font-weight: 600;
              color: var(--color-text-primary);
              justify-content: center;
            }

            /* Nav buttons */
            .bazaar-rdp .rdp-button_previous,
            .bazaar-rdp .rdp-button_next {
              background: var(--color-bg);
              border: 1px solid var(--color-border);
              border-radius: 6px;
              color: var(--color-text-muted);
              transition: opacity 0.15s;
            }
            .bazaar-rdp .rdp-button_previous:hover,
            .bazaar-rdp .rdp-button_next:hover { opacity: 0.7; }

            /* Chevron icon color */
            .bazaar-rdp .rdp-chevron { fill: var(--color-text-muted); }

            /* Weekday labels */
            .bazaar-rdp .rdp-weekday {
              font-size: 11px;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: var(--color-text-muted);
              opacity: 1;
              width: 36px;
              text-align: center;
            }

            /* Weekday separator */
            .bazaar-rdp .rdp-weekdays {
              border-bottom: 1px solid var(--color-border);
              margin-bottom: 2px;
            }

            /* Day cells */
            .bazaar-rdp .rdp-day_button {
              color: var(--color-text-primary);
              transition: background 0.1s, color 0.1s;
            }
            .bazaar-rdp .rdp-day_button:hover {
              background: var(--color-badge-bg);
              color: var(--color-badge-text);
            }

            /* Selected day */
            .bazaar-rdp .rdp-selected .rdp-day_button {
              background: var(--color-accent) !important;
              color: var(--color-btn-primary-text) !important;
              border-color: transparent !important;
              font-weight: 600;
            }

            /* Today (unselected) */
            .bazaar-rdp .rdp-today:not(.rdp-selected) .rdp-day_button {
              color: var(--color-accent);
              font-weight: 600;
            }
          `}</style>
          <DayPicker
            className="bazaar-rdp"
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected ?? new Date()}
            navLayout="around"
          />
        </div>
      )}
    </div>
  );
}
