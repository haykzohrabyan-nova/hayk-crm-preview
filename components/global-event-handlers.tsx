"use client";

import { useEffect } from "react";

export function GlobalEventHandlers() {
  useEffect(() => {
    function blockNumberInputChars(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement).tagName === "INPUT" &&
        (e.target as HTMLInputElement).type === "number" &&
        ["e", "E", "+", "-"].includes(e.key)
      ) {
        e.preventDefault();
      }
    }
    document.addEventListener("keydown", blockNumberInputChars);
    return () => document.removeEventListener("keydown", blockNumberInputChars);
  }, []);

  return null;
}
