"use client";

import { useRef, useEffect, ClipboardEvent, KeyboardEvent } from "react";

interface OtpInputProps {
  value: string;
  onChange: (val: string) => void;
  autoFocus?: boolean;
}

export function OtpInput({ value, onChange, autoFocus = false }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, "").split("").slice(0, 6);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function update(index: number, char: string) {
    const next = digits.slice();
    next[index] = char;
    onChange(next.join("").replace(/[^0-9]/g, "").slice(0, 6));
    if (char && index < 5) refs.current[index + 1]?.focus();
  }

  function handleKey(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        update(index, "");
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        const next = digits.slice();
        next[index - 1] = "";
        onChange(next.join(""));
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(text);
    const focusIdx = Math.min(text.length, 5);
    refs.current[focusIdx]?.focus();
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] ?? ""}
          onChange={(e) => update(i, e.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="h-13 w-13 rounded-md border text-center font-medium outline-none transition-all"
          style={{
            width: 52,
            height: 52,
            fontSize: 20,
            borderWidth: digits[i] ? "1.5px" : "1.5px",
            borderColor: digits[i] ? "var(--color-accent)" : "var(--color-border)",
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text-primary)",
            caretColor: "var(--color-accent)",
          }}
          onMouseEnter={(e) => {
            if (!digits[i]) (e.currentTarget as HTMLInputElement).style.borderColor = "var(--color-text-muted)";
          }}
          onMouseLeave={(e) => {
            if (!digits[i]) (e.currentTarget as HTMLInputElement).style.borderColor = "var(--color-border)";
          }}
        />
      ))}
    </div>
  );
}
