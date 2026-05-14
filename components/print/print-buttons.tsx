"use client";

import { Printer } from "lucide-react";

export function PrintButtons() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 18px",
        background: "#1B2B4B",
        color: "#E8C97A",
        border: "none",
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: "0.01em",
      }}
    >
      <Printer size={15} />
      Print / Save PDF
    </button>
  );
}
