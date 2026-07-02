"use client";

// Hayk 2026-07-02 — Designer Home landing page.
// Designers live in the external Workflow app at localhost:3004/board — this
// page is a lightweight home inside the CRM that points them there and shows
// their assigned design tasks (mocked). No pricing, no customer contacts.

const ACCENT = "#FF5D2E";

const ASSIGNED_TASKS = [
  { ref: "JOB-2026-0142", customer: "SafeCare Packaging", stage: "Design draft", due: "Today 5pm" },
  { ref: "JOB-2026-0138", customer: "Rise Botanicals",   stage: "Waiting proof approval", due: "Tomorrow" },
  { ref: "JOB-2026-0129", customer: "Prime Cannabis",    stage: "Revisions requested", due: "Fri" },
  { ref: "JOB-2026-0119", customer: "Verdant Labs",      stage: "New brief",           due: "Next Mon" },
  { ref: "JOB-2026-0111", customer: "Boris",              stage: "Print-ready check",   due: "Overdue" },
];

export default function DesignerHomePreview() {
  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "var(--preview-bg, #fafafa)",
        color: "var(--preview-text, #111)",
        borderRadius: "14px",
        padding: "24px",
        margin: "-20px",
        minHeight: "70vh",
      }}
    >
      <div style={{ marginBottom: "20px" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: ACCENT,
            marginBottom: "4px",
          }}
        >
          Designer Home
        </div>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          Your design queue
        </h1>
        <div style={{ fontSize: "13px", color: "var(--preview-text-muted, #666)", marginTop: "4px" }}>
          Everything you need lives on the Workflow board — this page is a quick jumping-off point.
        </div>
      </div>

      {/* Workflow board CTA */}
      <a
        href="http://localhost:3004/board"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "20px 24px",
          borderRadius: "12px",
          background: "linear-gradient(90deg, #111 0%, #1a1a1a 100%)",
          color: "#fff",
          textDecoration: "none",
          marginBottom: "24px",
          border: `1px solid ${ACCENT}`,
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            background: ACCENT,
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "22px",
          }}
        >
          🎨
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 700 }}>Open the Workflow board →</div>
          <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "2px" }}>
            localhost:3004/board · your main workspace
          </div>
        </div>
        <div style={{ fontSize: "18px" }}>↗</div>
      </a>

      {/* Assigned task list */}
      <div
        style={{
          background: "var(--preview-surface, #fff)",
          border: "1px solid var(--preview-border, #e5e5e5)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--preview-border, #e5e5e5)",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          Design tasks assigned to you
        </div>
        {ASSIGNED_TASKS.map((t, i) => (
          <div
            key={t.ref}
            style={{
              padding: "12px 18px",
              borderTop: i === 0 ? "none" : "1px solid var(--preview-border, #eee)",
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div style={{ minWidth: "120px", fontSize: "12px", fontWeight: 700, color: ACCENT }}>
              {t.ref}
            </div>
            <div style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>{t.customer}</div>
            <div style={{ minWidth: "180px", fontSize: "12px", color: "var(--preview-text-muted, #666)" }}>
              {t.stage}
            </div>
            <div
              style={{
                minWidth: "110px",
                fontSize: "11px",
                fontWeight: 700,
                color: t.due === "Overdue" ? "#dc2626" : "var(--preview-text, #111)",
                textAlign: "right",
              }}
            >
              {t.due}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: "20px",
          fontSize: "11px",
          color: "var(--preview-text-muted, #888)",
          textAlign: "center",
        }}
      >
        Designer view — pricing and customer contact info are hidden. Only the Files tab is visible on orders.
      </div>
    </div>
  );
}
