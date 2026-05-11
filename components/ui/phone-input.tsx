"use client";

import { forwardRef } from "react";
import { Phone } from "lucide-react";
import { formatPhone, digitsOnly } from "@/lib/utils/phone";

interface PhoneInputProps {
  value: string;
  onChange: (digits: string) => void;
  error?: string | null;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  showAction?: boolean;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput(
    {
      value,
      onChange,
      error,
      placeholder = "(555) 000-0000",
      required,
      disabled,
      id,
      showAction = false,
    },
    ref
  ) {
    const errorId = id ? `${id}-error` : undefined;
    const hasValue = value.length >= 10;

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = digitsOnly(e.target.value);
      onChange(raw.slice(0, 10));
    }

    return (
      <div className="flex flex-col gap-1">
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required={required}
            disabled={disabled}
            value={formatPhone(value)}
            onChange={handleChange}
            placeholder={placeholder}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="h-9 w-full rounded-[6px] border px-3 text-sm outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--color-surface)",
              borderColor: error ? "var(--color-danger)" : "var(--color-border)",
              color: "var(--color-text-primary)",
              paddingRight: showAction ? "2.25rem" : undefined,
            }}
            onFocus={(e) => {
              if (!error) {
                e.currentTarget.style.borderColor = "var(--color-accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
              if (!error) {
                e.currentTarget.style.borderColor = "var(--color-border)";
              }
            }}
          />
          {showAction && hasValue && (
            <a
              href={`tel:+1${value}`}
              title="Call this number"
              className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-[6px] transition-colors hover:bg-[var(--color-row-hover)]"
              style={{
                borderLeft: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-[12px] font-medium"
            style={{ color: "var(--color-danger)" }}
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);
