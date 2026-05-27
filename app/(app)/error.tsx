"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 16,
        color: "var(--color-text-muted)",
      }}
    >
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p style={{ fontSize: 15, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>
        Something went wrong
      </p>
      <p style={{ fontSize: 13, margin: 0 }}>Please try refreshing the page.</p>
      <button
        style={{
          fontSize: 13,
          padding: "6px 16px",
          borderRadius: 6,
          border: "none",
          background: "var(--color-btn-primary-bg)",
          color: "var(--color-btn-primary-text)",
          cursor: "pointer",
          fontWeight: 500,
        }}
        onClick={reset}
      >
        Try again
      </button>
    </div>
  );
}
