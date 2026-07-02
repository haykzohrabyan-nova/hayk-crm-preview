"use client";

// Hayk 2026-07-01 — Unified Inbox preview.
// Every customer touchpoint — calls, SMS, emails, IG DMs, web forms — in one hub.
// AI summary + action items on every item. Mock data only for now; real
// integrations (Twilio / Gmail / Meta) land in a separate infra phase.

import { useMemo, useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { COMM_ITEMS, type CommItem, type Channel } from "./_seed";
// Hayk 2026-07-02 — role-view: designer sees only a truncated inbox.
import { usePreviewRole } from "../_shared/role";

const ACCENT = "#FF5D2E";

const CHANNEL_META: Record<Channel, { label: string; icon: string; short: string }> = {
  call:     { label: "Calls",         icon: "📞", short: "Call" },
  sms:      { label: "SMS",           icon: "📱", short: "SMS" },
  email:    { label: "Emails",        icon: "✉",  short: "Email" },
  ig:       { label: "Instagram DMs", icon: "📷", short: "IG DM" },
  web_form: { label: "Web Forms",     icon: "🌐", short: "Web form" },
};

type ChannelFilter = "all" | Channel;
type DateFilter = "today" | "week" | "all";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date("2026-07-01T15:00:00Z");
  return d.toDateString() === now.toDateString();
}
function isThisWeek(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date("2026-07-01T15:00:00Z");
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 7;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────
// Page shell
// ─────────────────────────────────────────────────────────
export default function InboxPreview() {
  return (
    <Suspense fallback={<div style={{ padding: "20px" }}>Loading…</div>}>
      <InboxInner />
    </Suspense>
  );
}

function InboxInner() {
  const searchParams = useSearchParams();
  const initialItemId = searchParams.get("item");
  // Hayk 2026-07-02 — designer view is a 5-item slice of the inbox.
  // Everyone else sees the full list.
  const [previewRole] = usePreviewRole();
  const roleFilteredItems = useMemo(
    () => (previewRole === "designer" ? COMM_ITEMS.slice(0, 5) : COMM_ITEMS),
    [previewRole]
  );

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialItemId ?? COMM_ITEMS[0]?.id ?? null);
  const [view, setView] = useState<"summary" | "transcript">("summary");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Sync selected from ?item= param
  useEffect(() => {
    if (initialItemId) setSelectedId(initialItemId);
  }, [initialItemId]);

  const channelCounts = useMemo(() => {
    const c: Record<ChannelFilter, number> = { all: 0, call: 0, sms: 0, email: 0, ig: 0, web_form: 0 };
    roleFilteredItems.forEach((it) => {
      if (it.unread && !readIds.has(it.id)) {
        c.all += 1;
        c[it.channel] += 1;
      }
    });
    return c;
  }, [readIds, roleFilteredItems]);

  const customerOptions = useMemo(() => {
    const s = new Set<string>();
    roleFilteredItems.forEach((c) => s.add(c.customerName));
    return Array.from(s).sort();
  }, [roleFilteredItems]);

  const filtered = useMemo(() => {
    let out = roleFilteredItems.slice();
    if (channelFilter !== "all") out = out.filter((c) => c.channel === channelFilter);
    if (customerFilter !== "all") out = out.filter((c) => c.customerName === customerFilter);
    if (dateFilter === "today") out = out.filter((c) => isToday(c.receivedAtISO));
    if (dateFilter === "week") out = out.filter((c) => isThisWeek(c.receivedAtISO));
    return out.sort((a, b) => (a.receivedAtISO > b.receivedAtISO ? -1 : 1));
  }, [channelFilter, customerFilter, dateFilter, roleFilteredItems]);

  const selected = roleFilteredItems.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  function selectItem(id: string) {
    setSelectedId(id);
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setView("summary");
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "var(--preview-bg)", color: "var(--preview-text)", borderRadius: "14px", padding: "20px", margin: "-20px" }}>
      {/* Preview banner */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "18px", alignItems: "center", padding: "10px 14px", background: "var(--preview-surface-2)", borderRadius: "10px", color: "var(--preview-text)", border: "1px solid var(--preview-border)" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Preview</span>
        <span style={{ fontSize: "12px", color: "var(--preview-text)" }}>Inbox · unified comms hub · every call, SMS, email, IG DM and web form in one place</span>
        <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "var(--preview-text-muted)" }}>Mock data — real integrations come next</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 1fr", gap: "14px", minHeight: "calc(100vh - 160px)" }}>
        {/* Left rail — filters */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", padding: "14px", height: "fit-content", position: "sticky", top: "16px" }}>
          {/* Channel */}
          <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--preview-text-muted)", marginBottom: "6px", fontWeight: 700 }}>Channels</div>
          <FilterRow label="All channels" icon="🗂" active={channelFilter === "all"} count={channelCounts.all} onClick={() => setChannelFilter("all")} />
          {(Object.keys(CHANNEL_META) as Channel[]).map((ch) => (
            <FilterRow key={ch} label={CHANNEL_META[ch].label} icon={CHANNEL_META[ch].icon} active={channelFilter === ch} count={channelCounts[ch]} onClick={() => setChannelFilter(ch)} />
          ))}

          {/* Customer */}
          <div style={{ marginTop: "16px", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--preview-text-muted)", marginBottom: "6px", fontWeight: 700 }}>Customer / Lead</div>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            style={{ width: "100%", padding: "7px 8px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", color: "var(--preview-text)", fontSize: "12px" }}
          >
            <option value="all">All customers</option>
            {customerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>

          {/* Date */}
          <div style={{ marginTop: "16px", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--preview-text-muted)", marginBottom: "6px", fontWeight: 700 }}>Date</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {(["today","week","all"] as DateFilter[]).map((d) => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                style={{
                  padding: "5px 10px",
                  fontSize: "11.5px",
                  borderRadius: "999px",
                  border: `1px solid ${dateFilter === d ? ACCENT : "var(--preview-border)"}`,
                  background: dateFilter === d ? `${ACCENT}22` : "var(--preview-surface-2)",
                  color: dateFilter === d ? ACCENT : "var(--preview-text)",
                  cursor: "pointer",
                  fontWeight: dateFilter === d ? 700 : 500,
                }}
              >
                {d === "today" ? "Today" : d === "week" ? "This week" : "All time"}
              </button>
            ))}
          </div>
        </div>

        {/* Center list */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", overflow: "hidden", minWidth: "380px" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--preview-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--preview-text)" }}>{filtered.length} conversation{filtered.length === 1 ? "" : "s"}</div>
            <div style={{ fontSize: "11.5px", color: "var(--preview-text-muted)" }}>Sorted newest first</div>
          </div>
          <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "13px" }}>
                No conversations match those filters.
              </div>
            )}
            {filtered.map((c) => (
              <ListRow key={c.id} item={c} selected={c.id === selected?.id} readOverride={readIds.has(c.id)} onSelect={() => selectItem(c.id)} />
            ))}
          </div>
        </div>

        {/* Right pane — detail */}
        <div style={{ background: "var(--preview-surface)", border: "1px solid var(--preview-border)", borderRadius: "12px", overflow: "hidden", minWidth: "480px" }}>
          {selected ? (
            <DetailPane item={selected} view={view} setView={setView} />
          ) : (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--preview-text-muted)", fontSize: "13px" }}>
              Select a conversation to see the transcript and AI summary.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterRow({ label, icon, active, count, onClick }: { label: string; icon: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "7px 10px",
        background: active ? `${ACCENT}18` : "transparent",
        border: active ? `1px solid ${ACCENT}55` : "1px solid transparent",
        borderRadius: "8px",
        color: active ? ACCENT : "var(--preview-text)",
        fontSize: "12.5px",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        marginBottom: "2px",
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: "14px" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {count > 0 && (
        <span style={{ background: ACCENT, color: "#fff", borderRadius: "999px", fontSize: "10px", fontWeight: 700, padding: "1px 7px", minWidth: "18px", textAlign: "center" }}>
          {count}
        </span>
      )}
    </button>
  );
}

function ListRow({ item, selected, readOverride, onSelect }: { item: CommItem; selected: boolean; readOverride: boolean; onSelect: () => void }) {
  const meta = CHANNEL_META[item.channel];
  const unread = item.unread && !readOverride;
  return (
    <div
      onClick={onSelect}
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--preview-border)",
        cursor: "pointer",
        background: selected ? "var(--preview-surface-2)" : "transparent",
        borderLeft: selected ? `3px solid ${ACCENT}` : "3px solid transparent",
        display: "flex",
        gap: "10px",
      }}
    >
      <div style={{ fontSize: "18px", lineHeight: 1.2 }}>{meta.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
          <div style={{ fontSize: "12.5px", fontWeight: unread ? 800 : 600, color: "var(--preview-text)" }}>
            {item.customerName}
            {item.customerCompany && (
              <span style={{ fontWeight: 500, color: "var(--preview-text-muted)" }}> · {item.customerCompany}</span>
            )}
          </div>
          {item.flagged && <PriorityPill />}
          <span style={{ marginLeft: "auto", fontSize: "10.5px", color: "var(--preview-text-muted)", whiteSpace: "nowrap" }}>{item.receivedAt}</span>
        </div>
        <div style={{ fontSize: "11.5px", fontStyle: "italic", color: "var(--preview-text-muted)", lineHeight: 1.4, marginBottom: "6px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
          {item.aiSummary}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <LinkChip linkedTo={item.linkedTo} />
          <span style={{ fontSize: "10.5px", color: "var(--preview-text-muted)" }}>{meta.short} · assigned to {item.assignedTo}</span>
        </div>
      </div>
    </div>
  );
}

function LinkChip({ linkedTo }: { linkedTo: CommItem["linkedTo"] }) {
  const colors: Record<CommItem["linkedTo"]["kind"], string> = {
    lead:      "#3b82f6",
    customer:  "#22c55e",
    order:     "#a855f7",
    quote:     "#f59e0b",
    unmatched: "#94a3b8",
  };
  const color = colors[linkedTo.kind];
  return (
    <span style={{ fontSize: "10.5px", background: `${color}18`, border: `1px solid ${color}55`, color: color, padding: "1px 8px", borderRadius: "999px", fontWeight: 700 }}>
      {linkedTo.label}
    </span>
  );
}

function PriorityPill() {
  return (
    <span style={{ fontSize: "10px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "1px 7px", borderRadius: "999px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      Action needed
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// Detail pane
// ─────────────────────────────────────────────────────────
function DetailPane({ item, view, setView }: { item: CommItem; view: "summary" | "transcript"; setView: (v: "summary" | "transcript") => void }) {
  const meta = CHANNEL_META[item.channel];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 220px)" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--preview-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "20px" }}>{meta.icon}</span>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--preview-text)" }}>{item.customerName}</div>
          {item.customerCompany && (
            <span style={{ fontSize: "12px", color: "var(--preview-text-muted)" }}>· {item.customerCompany}</span>
          )}
          <LinkChip linkedTo={item.linkedTo} />
          {item.flagged && <PriorityPill />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "6px", fontSize: "11.5px", color: "var(--preview-text-muted)" }}>
          <span>{item.contact}</span>
          <span>· Assigned to <strong style={{ color: "var(--preview-text)" }}>{item.assignedTo}</strong></span>
          <span>· {item.receivedAt}</span>
        </div>
      </div>

      {/* AI summary card */}
      <div style={{ margin: "14px 18px", padding: "12px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
          <span style={{ fontSize: "14px" }}>🤖</span>
          <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.08em" }}>AI summary</span>
        </div>
        <div style={{ fontSize: "12.5px", color: "var(--preview-text)", lineHeight: 1.55, marginBottom: "10px" }}>
          {item.aiSummary}
        </div>
        {item.aiActionItems.length > 0 && (
          <>
            <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Action items</div>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--preview-text)", lineHeight: 1.6 }}>
              {item.aiActionItems.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </>
        )}
        <div style={{ marginTop: "10px", fontSize: "10.5px", color: "var(--preview-text-muted)", fontStyle: "italic" }}>
          Summary by Bazaar AI · {item.aiSummarizedAt}
        </div>
      </div>

      {/* Toggle */}
      <div style={{ padding: "0 18px", marginBottom: "10px" }}>
        <div style={{ display: "inline-flex", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "3px" }}>
          <ToggleBtn active={view === "summary"} onClick={() => setView("summary")} label="Summary" />
          <ToggleBtn active={view === "transcript"} onClick={() => setView("transcript")} label="Full transcript" />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
        {view === "summary" ? (
          <SummaryView item={item} />
        ) : (
          <TranscriptView item={item} />
        )}
      </div>

      {/* Action bar */}
      <div style={{ borderTop: "1px solid var(--preview-border)", padding: "12px 18px", display: "flex", gap: "8px", flexWrap: "wrap", background: "var(--preview-surface-2)" }}>
        <ActBtn label="Reply" primary onClick={() => console.log("reply", item.id)} />
        <ActBtn label="Forward" onClick={() => console.log("forward", item.id)} />
        <ActBtn label="Assign to…" onClick={() => console.log("assign", item.id)} />
        <ActBtn label="Link to order" onClick={() => console.log("link", item.id)} />
        <ActBtn label="Add note" onClick={() => console.log("note", item.id)} />
      </div>
    </div>
  );
}

function ToggleBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        background: active ? "var(--preview-surface)" : "transparent",
        border: active ? "1px solid var(--preview-border)" : "1px solid transparent",
        borderRadius: "6px",
        color: active ? "var(--preview-text)" : "var(--preview-text-muted)",
        fontSize: "12px",
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ActBtn({ label, primary, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        background: primary ? ACCENT : "var(--preview-surface)",
        border: primary ? "none" : "1px solid var(--preview-border)",
        borderRadius: "8px",
        color: primary ? "#fff" : "var(--preview-text)",
        fontSize: "12px",
        fontWeight: primary ? 700 : 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SummaryView({ item }: { item: CommItem }) {
  const b = item.body;
  return (
    <div style={{ fontSize: "12.5px", color: "var(--preview-text)", lineHeight: 1.6, paddingBottom: "20px" }}>
      <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--preview-text-muted)", fontWeight: 700, marginBottom: "6px" }}>Snapshot</div>
      {b.kind === "call" && (
        <>
          <div>{b.direction === "inbound" ? "Inbound call" : "Outbound call"} · duration {fmtDuration(b.durationSec)} · {b.transcript.length} lines</div>
          <div style={{ marginTop: "10px", fontSize: "11.5px", color: "var(--preview-text-muted)" }}>
            First line — <em>"{b.transcript[1]?.text ?? b.transcript[0]?.text}"</em>
          </div>
        </>
      )}
      {b.kind === "sms" && (
        <>
          <div>{b.thread.length} messages · {b.thread.filter((m) => m.from === "customer").length} inbound / {b.thread.filter((m) => m.from === "rep").length} outbound</div>
          <div style={{ marginTop: "10px", fontSize: "11.5px", color: "var(--preview-text-muted)" }}>
            Last message — <em>"{b.thread[b.thread.length - 1].text}"</em>
          </div>
        </>
      )}
      {b.kind === "email" && (
        <>
          <div>Subject: <strong>{b.subject}</strong></div>
          <div style={{ marginTop: "4px" }}>{b.chain.length} message{b.chain.length === 1 ? "" : "s"} in thread</div>
          <div style={{ marginTop: "10px", fontSize: "11.5px", color: "var(--preview-text-muted)" }}>
            Latest — <em>{b.chain[0].body.split("\n")[0].slice(0, 140)}…</em>
          </div>
        </>
      )}
      {b.kind === "ig" && (
        <>
          <div>{b.thread.length} messages · Instagram DM</div>
          <div style={{ marginTop: "10px", fontSize: "11.5px", color: "var(--preview-text-muted)" }}>
            First message — <em>"{b.thread[0].text}"</em>
          </div>
        </>
      )}
      {b.kind === "web_form" && (
        <>
          <div>Submitted via <strong>{b.formName}</strong></div>
          <div style={{ marginTop: "4px" }}>{b.fields.length} fields · {b.attachments?.length ?? 0} attachment{(b.attachments?.length ?? 0) === 1 ? "" : "s"}</div>
        </>
      )}
      <div style={{ marginTop: "16px", padding: "10px 12px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "11.5px", color: "var(--preview-text-muted)" }}>
        Click <strong>Full transcript</strong> above to see the raw content.
      </div>
    </div>
  );
}

function TranscriptView({ item }: { item: CommItem }) {
  const b = item.body;
  return (
    <div style={{ paddingBottom: "20px" }}>
      {b.kind === "call" && <CallTranscript body={b} />}
      {b.kind === "sms" && <SmsThread body={b} />}
      {b.kind === "email" && <EmailChain body={b} />}
      {b.kind === "ig" && <IgThread body={b} />}
      {b.kind === "web_form" && <WebFormView body={b} />}
    </div>
  );
}

function CallTranscript({ body }: { body: Extract<CommItem["body"], { kind: "call" }> }) {
  return (
    <div>
      {/* Fake waveform + duration */}
      <div style={{ padding: "12px 14px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "10px", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <button
            onClick={() => console.log("play call")}
            style={{ width: "32px", height: "32px", background: ACCENT, border: "none", borderRadius: "50%", color: "#fff", fontSize: "13px", cursor: "pointer" }}
          >▶</button>
          <div style={{ fontSize: "11.5px", color: "var(--preview-text)" }}>
            {body.direction === "inbound" ? "📞 Inbound" : "📞 Outbound"} · {fmtDuration(body.durationSec)}
          </div>
          <div style={{ marginLeft: "auto", fontSize: "11px", color: "var(--preview-text-muted)" }}>Mock recording</div>
        </div>
        {/* SVG waveform mock */}
        <svg viewBox="0 0 300 40" width="100%" height="34" preserveAspectRatio="none">
          {Array.from({ length: 60 }).map((_, i) => {
            const h = 4 + Math.abs(Math.sin(i * 0.6) * 14) + Math.abs(Math.cos(i * 0.3) * 8);
            return <rect key={i} x={i * 5} y={(40 - h) / 2} width="3" height={h} rx="1" fill={ACCENT} opacity={0.75} />;
          })}
        </svg>
      </div>
      <div style={{ fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--preview-text-muted)", fontWeight: 700, marginBottom: "8px" }}>Transcript</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {body.transcript.map((line, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", fontSize: "12px", lineHeight: 1.5 }}>
            <div style={{ minWidth: "44px", color: "var(--preview-text-muted)", fontSize: "10.5px", fontFamily: "monospace", paddingTop: "1px" }}>{line.timestamp}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "10.5px", fontWeight: 700, color: line.who === "agent" ? ACCENT : "#3b82f6", marginBottom: "1px" }}>
                {line.name} {line.who === "agent" ? "(agent)" : ""}
              </div>
              <div style={{ color: "var(--preview-text)" }}>{line.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SmsThread({ body }: { body: Extract<CommItem["body"], { kind: "sms" }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {body.thread.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.from === "customer" ? "flex-start" : "flex-end" }}>
          <div style={{ maxWidth: "78%" }}>
            <div style={{ fontSize: "10px", color: "var(--preview-text-muted)", marginBottom: "2px", textAlign: m.from === "customer" ? "left" : "right" }}>
              {m.name} · {m.at}
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "14px",
                fontSize: "12.5px",
                lineHeight: 1.4,
                background: m.from === "customer" ? "var(--preview-surface-2)" : ACCENT,
                color: m.from === "customer" ? "var(--preview-text)" : "#fff",
                border: m.from === "customer" ? "1px solid var(--preview-border)" : "none",
              }}
            >
              {m.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmailChain({ body }: { body: Extract<CommItem["body"], { kind: "email" }> }) {
  return (
    <div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--preview-text)", marginBottom: "10px" }}>{body.subject}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {body.chain.map((m, i) => (
          <div key={i} style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginBottom: "6px", lineHeight: 1.5 }}>
              <div><strong style={{ color: "var(--preview-text)" }}>From:</strong> {m.from}</div>
              <div><strong style={{ color: "var(--preview-text)" }}>To:</strong> {m.to}</div>
              {m.cc && <div><strong style={{ color: "var(--preview-text)" }}>Cc:</strong> {m.cc}</div>}
              <div><strong style={{ color: "var(--preview-text)" }}>Date:</strong> {m.at}</div>
              <div><strong style={{ color: "var(--preview-text)" }}>Subject:</strong> {m.subject}</div>
            </div>
            <div style={{ fontSize: "12.5px", color: "var(--preview-text)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              {m.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IgThread({ body }: { body: Extract<CommItem["body"], { kind: "ig" }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {body.thread.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.from === "customer" ? "flex-start" : "flex-end", gap: "6px", alignItems: "flex-end" }}>
          {m.from === "customer" && <span style={{ fontSize: "12px" }}>📷</span>}
          <div style={{ maxWidth: "76%" }}>
            <div style={{ fontSize: "10px", color: "var(--preview-text-muted)", marginBottom: "2px", textAlign: m.from === "customer" ? "left" : "right" }}>
              {m.handle} · {m.at}
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "14px",
                fontSize: "12.5px",
                lineHeight: 1.4,
                background: m.from === "customer" ? "var(--preview-surface-2)" : "#e1306c",
                color: m.from === "customer" ? "var(--preview-text)" : "#fff",
                border: m.from === "customer" ? "1px solid var(--preview-border)" : "none",
              }}
            >
              {m.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebFormView({ body }: { body: Extract<CommItem["body"], { kind: "web_form" }> }) {
  return (
    <div>
      <div style={{ fontSize: "11px", color: "var(--preview-text-muted)", marginBottom: "10px" }}>{body.formName}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {body.fields.map((f, i) => (
          <div key={i} style={{ background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", padding: "8px 12px" }}>
            <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "2px" }}>{f.label}</div>
            <div style={{ fontSize: "12.5px", color: "var(--preview-text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{f.value || "—"}</div>
          </div>
        ))}
      </div>
      {body.attachments && body.attachments.length > 0 && (
        <div style={{ marginTop: "12px" }}>
          <div style={{ fontSize: "10.5px", color: "var(--preview-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: "6px" }}>Attachments</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {body.attachments.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", background: "var(--preview-surface-2)", border: "1px solid var(--preview-border)", borderRadius: "8px", fontSize: "12px" }}>
                <span>📎</span>
                <span style={{ flex: 1, color: "var(--preview-text)" }}>{a.name}</span>
                <span style={{ color: "var(--preview-text-muted)", fontSize: "11px" }}>{a.size}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
