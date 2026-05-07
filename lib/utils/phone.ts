/** Strip everything except digits */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Format digits as (xxx) xxx-xxxx for display */
export function formatPhone(value: string): string {
  const digits = digitsOnly(value);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/** Validate a phone number — returns error string or null */
export function validatePhone(value: string): string | null {
  const digits = digitsOnly(value);
  if (!digits) return "Phone number is required.";
  if (digits.length < 10) return "Enter a valid 10-digit phone number.";
  return null;
}
