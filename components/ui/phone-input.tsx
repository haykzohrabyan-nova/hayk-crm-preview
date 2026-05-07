"use client";

import { forwardRef, useRef } from "react";
import { formatPhone, digitsOnly } from "@/lib/utils/phone";

interface PhoneInputProps {
  value: string;
  onChange: (digits: string) => void;
  error?: string | null;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
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
    },
    ref
  ) {
    const errorId = id ? `${id}-error` : undefined;

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = digitsOnly(e.target.value);
      onChange(raw.slice(0, 10));
    }

    return (
      <div className="flex flex-col gap-1">
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
          className="h-9 rounded-[6px] border px-3 text-sm outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--color-surface)",
            borderColor: error ? "#DC2626" : "var(--color-border)",
            color: "var(--color-text-primary)",
          }}
          onFocus={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = "var(--color-accent)";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(232,201,122,0.18)";
            }
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = "none";
            if (!error) {
              e.currentTarget.style.borderColor = "var(--color-border)";
            }
          }}
        />
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-[12px] font-medium"
            style={{ color: "#DC2626" }}
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);
