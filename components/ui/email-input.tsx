"use client";

import { forwardRef } from "react";

interface EmailInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string | null;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

export const EmailInput = forwardRef<HTMLInputElement, EmailInputProps>(
  function EmailInput(
    {
      value,
      onChange,
      error,
      placeholder = "you@example.com",
      required,
      disabled,
      id,
    },
    ref
  ) {
    const errorId = id ? `${id}-error` : undefined;

    return (
      <div className="flex flex-col gap-1">
        <input
          ref={ref}
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          required={required}
          disabled={disabled}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="h-9 rounded-[6px] border px-3 text-sm outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--color-surface)",
            borderColor: error ? "var(--color-danger)" : "var(--color-border)",
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
            style={{ color: "var(--color-danger)" }}
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);
