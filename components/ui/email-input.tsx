"use client";

import { useState, InputHTMLAttributes } from "react";
import { validateEmail } from "@/lib/utils/email";

interface EmailInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string | null;
}

export function EmailInput({ value, onChange, error: externalError, id, ...rest }: EmailInputProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const errorId = id ? `${id}-error` : undefined;
  const activeError = externalError ?? localError;
  const hasError = !!activeError;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        {...rest}
        id={id}
        type="email"
        inputMode="email"
        autoComplete="email"
        value={value}
        onChange={onChange}
        onBlur={(e) => {
          const err = validateEmail(e.target.value);
          setLocalError(err);
          e.currentTarget.style.borderColor = hasError || err ? "var(--color-danger)" : "var(--color-border)";
          e.currentTarget.style.boxShadow = "none";
          rest.onBlur?.(e);
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--color-accent)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
          rest.onFocus?.(e);
        }}
        aria-invalid={hasError}
        aria-describedby={activeError && errorId ? errorId : undefined}
        className="h-10 rounded-md border px-3 text-[13px] outline-none transition-all"
        style={{
          borderColor: hasError ? "var(--color-danger)" : "var(--color-border)",
          backgroundColor: "var(--color-bg)",
          color: "var(--color-text-primary)",
        }}
      />
      {activeError && (
        <p
          id={errorId}
          role="alert"
          className="text-[12px] font-medium"
          style={{ color: "var(--color-danger)" }}
        >
          {activeError}
        </p>
      )}
    </div>
  );
}
