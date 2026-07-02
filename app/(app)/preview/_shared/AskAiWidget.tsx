"use client";

// Hayk 2026-07-01 — Floating "Ask AI" widget for the CRM preview.
// Scripted mock responses only. Never invents answers — falls back to the
// "I don't have that yet" line per Hayk's hard rule (feedback_never_unverified).

import { useEffect, useRef, useState } from "react";

const ACCENT = "#FF5D2E";

type ChatMsg = { id: string; role: "user" | "ai"; text: string; suggestions?: string[] };

// Scripted answer bank. Trigger phrases matched by substring (lowercased).
// Order matters — first match wins.
const SCRIPTED_ANSWERS: { triggers: string[]; answer: string; suggestions?: string[] }[] = [
  {
    triggers: ["overdue", "past due", "late payment", "unpaid"],
    answer:
      "3 customers are past due on net-terms invoices right now:\n\n" +
      "• Prime Cannabis — $8,420 · 14 days late · last emailed Jun 28\n" +
      "• SafeCare Packaging — $3,200 · 9 days late · Marianna is calling today\n" +
      "• Rise Botanicals — $1,780 · 6 days late · payment link re-sent yesterday\n\n" +
      "Want me to draft a follow-up email for any of them?",
    suggestions: ["Draft email to Prime Cannabis", "Show me Prime Cannabis order history"],
  },
  {
    triggers: ["boris", "ord-2026-0111", "0111", "body lotion"],
    answer:
      "Boris Boris — Body Lotion Box order (ORD-111)\n\n" +
      "• Status: In production, on Machine 4 (digital press) as of yesterday\n" +
      "• Ship window: Jul 3–5 (confirmed with Boris on call Jun 30, 2:14 PM)\n" +
      "• Next milestone: die-cut + gluing scheduled tomorrow morning\n" +
      "• Last comm: Boris asked for tracking as soon as it ships — flagged on my inbox\n\n" +
      "Nothing is blocked. Payment already cleared.",
    suggestions: ["Show ORD-111 full timeline", "Draft ship-notification text"],
  },
  {
    triggers: ["hot leads", "needs attention", "hot today", "priority leads"],
    answer:
      "3 leads are flagged \"needs attention\" today:\n\n" +
      "• L001 · Grim Lawd (Grimeylyfe Records) — high-value, quote sent 4 days ago, no reply. Suggested: nudge.\n" +
      "• L003 · Nicole Han — apparel, waiting on artwork approval since Monday.\n" +
      "• L006 · Matt Williams (Moon Mind) — new lead, hasn't been claimed by any SDR yet.\n\n" +
      "L006 is the one I'd touch first — it's been sitting 6 hours.",
    suggestions: ["Assign L006 to an SDR", "Draft nudge for Grim Lawd"],
  },
  {
    triggers: ["rush", "rush orders", "urgent orders"],
    answer:
      "2 rush orders in the queue:\n\n" +
      "• ORD-117 · Ivy Bloom · Custom pouches · Rush due Jul 3 (paid rush fee)\n" +
      "• ORD-121 · Lena Park / Hearth Bread · Bread bags · Rush due Jul 5\n\n" +
      "Both are on schedule right now. Ivy's is the tighter deadline — 2 days out.",
    suggestions: ["Show Ivy Bloom's order details"],
  },
  {
    triggers: ["yesterday", "who did i talk to yesterday", "yesterday's calls", "yesterday comms"],
    answer:
      "You had 5 touchpoints yesterday (Jun 30):\n\n" +
      "• 2:14 PM — Call · Boris Boris (12 min) · confirmed ship window on ORD-111\n" +
      "• 11:42 AM — Email · Amazi Amazi · Pantone reference for jar labels\n" +
      "• 10:18 AM — SMS · Grim Lawd · artwork approval thread\n" +
      "• 9:30 AM — Call · Nicole Han (7 min) · rush apparel quote question\n" +
      "• 8:55 AM — IG DM · @ivybloompackaging · initial inquiry (new lead)",
    suggestions: ["Show yesterday's transcripts"],
  },
  {
    triggers: ["amazi", "pantone"],
    answer:
      "Amazi Amazi — most recent thread is about Pantone matching on jar labels (ORD-119).\n\n" +
      "• She sent PMS 2726 C as the target color\n" +
      "• Marianna forwarded to press ops Jun 30, 11:42 AM\n" +
      "• Awaiting internal confirmation before responding\n\n" +
      "This was flagged \"action needed\" in your inbox.",
    suggestions: ["Open ORD-119"],
  },
  {
    triggers: ["waiting", "waiting on customer", "stalled"],
    answer:
      "4 items are stalled waiting on the customer:\n\n" +
      "• L001 Grim Lawd — quote sent 4 days ago, no reply\n" +
      "• L003 Nicole Han — needs to approve artwork proof\n" +
      "• ORD-114 SafeCare — waiting on final press-check sign-off\n" +
      "• ORD-118 Rise Botanicals — waiting on final die file",
  },
  {
    triggers: ["ivy", "ivy bloom", "@ivy"],
    answer:
      "Ivy Bloom — new lead from Instagram DM @ivybloompackaging (Jun 30, 8:55 AM).\n\n" +
      "• Interested in custom stand-up pouches, ~5,000 units\n" +
      "• No company on file yet\n" +
      "• Not claimed by an SDR\n" +
      "• Suggested next step: reply within the hour — IG leads convert best under 60 min.",
    suggestions: ["Draft IG reply to Ivy"],
  },
];

const CANNED_PROMPTS = [
  "Who's overdue on payment?",
  "What's the status of Boris's order?",
  "Any hot leads today?",
  "Show me all rush orders",
  "Who did I talk to yesterday?",
];

const FALLBACK =
  "I don't have that yet — this preview responds to a fixed set of prompts. Real AI integration comes next.";

function matchAnswer(text: string): { answer: string; suggestions?: string[] } | null {
  const q = text.toLowerCase();
  for (const row of SCRIPTED_ANSWERS) {
    if (row.triggers.some((t) => q.includes(t.toLowerCase()))) {
      return { answer: row.answer, suggestions: row.suggestions };
    }
  }
  return null;
}

export default function AskAiWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "ai",
      text:
        "Hi Hayk — I'm the Bazaar AI preview. I can answer questions about leads, orders, comms, and customers based on what's in the CRM right now.",
      suggestions: CANNED_PROMPTS,
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  function send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: clean };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    // fake thinking delay
    setTimeout(() => {
      const match = matchAnswer(clean);
      const aiMsg: ChatMsg = match
        ? { id: `a-${Date.now()}`, role: "ai", text: match.answer, suggestions: match.suggestions }
        : { id: `a-${Date.now()}`, role: "ai", text: FALLBACK };
      setMessages((m) => [...m, aiMsg]);
    }, 550);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ask Bazaar AI"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 1000,
          padding: "12px 18px",
          background: ACCENT,
          color: "#fff",
          border: "none",
          borderRadius: "999px",
          fontSize: "13px",
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(255,93,46,0.35)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span>💬</span>
        <span>Ask AI</span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 1000,
        width: "400px",
        height: "500px",
        background: "var(--preview-surface)",
        border: "1px solid var(--preview-border)",
        borderRadius: "14px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        color: "var(--preview-text)",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--preview-surface-2)",
          borderBottom: "1px solid var(--preview-border)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: ACCENT,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
          }}
        >
          🤖
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700 }}>Bazaar AI</div>
          <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>
            knows leads, orders, comms, customers
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--preview-text-muted)",
            fontSize: "18px",
            cursor: "pointer",
            padding: "0 4px",
          }}
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "88%",
                padding: "8px 12px",
                borderRadius: "12px",
                fontSize: "12.5px",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                background: m.role === "user" ? ACCENT : "var(--preview-surface-2)",
                color: m.role === "user" ? "#fff" : "var(--preview-text)",
                border: m.role === "user" ? "none" : "1px solid var(--preview-border)",
              }}
            >
              {m.text}
            </div>
            {m.suggestions && m.suggestions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                {m.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      background: "var(--preview-chip-bg)",
                      border: "1px solid var(--preview-chip-border)",
                      color: "var(--preview-text)",
                      fontSize: "11px",
                      padding: "4px 8px",
                      borderRadius: "999px",
                      cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{
          borderTop: "1px solid var(--preview-border)",
          padding: "10px 12px",
          background: "var(--preview-surface-2)",
          display: "flex",
          gap: "8px",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a lead, order, or customer…"
          style={{
            flex: 1,
            border: "1px solid var(--preview-border)",
            borderRadius: "8px",
            padding: "8px 10px",
            fontSize: "12.5px",
            background: "var(--preview-surface)",
            color: "var(--preview-text)",
            outline: "none",
          }}
        />
        <button
          type="submit"
          style={{
            background: ACCENT,
            border: "none",
            color: "#fff",
            fontSize: "12.5px",
            fontWeight: 700,
            padding: "8px 12px",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
