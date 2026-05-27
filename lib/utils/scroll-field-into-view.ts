import type { RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([type="submit"])';

/** Scroll a `[data-field-anchor]` wrapper into view and focus its control. */
export function scrollToFormField(
  containerRef: RefObject<HTMLElement | null>,
  fieldAnchor: string,
) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;

      const field = container.querySelector<HTMLElement>(
        `[data-field-anchor="${fieldAnchor}"]`,
      );
      if (!field) return;

      field.scrollIntoView({ behavior: "smooth", block: "center" });

      const focusable =
        field.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
        field.querySelector<HTMLElement>('[role="combobox"]');
      focusable?.focus({ preventScroll: true });
    });
  });
}

export function scrollToFirstFormField(
  containerRef: RefObject<HTMLElement | null>,
  errors: Record<string, string>,
  priority: string[],
) {
  const key = priority.find((k) => errors[k]) ?? Object.keys(errors)[0];
  if (key) scrollToFormField(containerRef, key);
}
