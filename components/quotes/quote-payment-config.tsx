"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { EmailInput } from "@/components/ui/email-input";
import { DatePicker } from "@/components/ui/date-picker";

// ── Payment channels (matches pulse-quote-payment.js PAY_CHANNELS) ────────────

const PAY_CHANNELS = [
  { id: "cash",  label: "Cash" },
  { id: "wire",  label: "Wire" },
  { id: "ach",   label: "ACH" },
  { id: "zelle", label: "Zelle" },
  { id: "check", label: "Check" },
  { id: "card",  label: "Card (online)" },
] as const;

const NET_TERMS = [
  { value: "net-10", label: "10 days" },
  { value: "net-15", label: "15 days" },
  { value: "net-20", label: "20 days" },
  { value: "net-30", label: "30 days" },
  { value: "net-45", label: "45 days" },
  { value: "net-60", label: "60 days" },
] as const;

const FOLLOW_UP_COUNTS = [1, 2, 3, 5, 7];

const FOLLOW_UP_FREQS = [
  { value: "daily",        label: "Every day" },
  { value: "every-3-days", label: "Every 3 days" },
  { value: "weekly",       label: "Every week" },
] as const;

const DEFAULT_PARTIAL_CHANNELS = ["cash", "wire", "ach", "zelle", "card"];
const DEFAULT_FULL_CHANNELS    = ["wire", "ach", "zelle", "check", "card"];

// ── Public types ──────────────────────────────────────────────────────────────

export interface TicketPaymentDraft {
  ticket_payment_strategy:       "partial" | "full" | "net";
  ticket_deposit_type:           "percent" | "fixed";
  ticket_deposit_value:          number;
  ticket_dep_handling:           "cash" | "gateway";
  ticket_receipt_id:             string;
  ticket_partial_channels:       string[];
  ticket_full_channels:          string[];
  ticket_require_client_confirm: boolean;
  ticket_net_terms_label:        string;
  ticket_quote_channel:          "sms" | "email" | "both";
  ticket_dest_phone:             string;
  ticket_dest_email:             string;
  ticket_follow_up_enabled:      boolean;
  ticket_follow_up_count:        number;
  ticket_follow_up_freq:         "daily" | "every-3-days" | "weekly";
  quote_reminder_date:           string;
}

export const PAYMENT_CONFIG_DEFAULTS: TicketPaymentDraft = {
  ticket_payment_strategy:       "full",
  ticket_deposit_type:           "percent",
  ticket_deposit_value:          30,
  ticket_dep_handling:           "cash",
  ticket_receipt_id:             "",
  ticket_partial_channels:       DEFAULT_PARTIAL_CHANNELS,
  ticket_full_channels:          DEFAULT_FULL_CHANNELS,
  ticket_require_client_confirm: true,
  ticket_net_terms_label:        "net-30",
  ticket_quote_channel:          "sms",
  ticket_dest_phone:             "",
  ticket_dest_email:             "",
  ticket_follow_up_enabled:      true,
  ticket_follow_up_count:        3,
  ticket_follow_up_freq:         "daily",
  quote_reminder_date:           new Date().toISOString().slice(0, 10),
};

interface Props {
  quoteTotal: number;
  initialConfig?: Partial<TicketPaymentDraft>;
  onChange: (config: TicketPaymentDraft) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getNetTermsDays(label: string): number {
  const map: Record<string, number> = {
    "net-10": 10, "net-15": 15, "net-20": 20,
    "net-30": 30, "net-45": 45, "net-60": 60,
  };
  return map[label] ?? 30;
}

function computeDeposit(total: number, type: "percent" | "fixed", value: number): number {
  if (total <= 0) return 0;
  if (type === "percent") return Math.min(Math.round((total * value / 100) * 100) / 100, total);
  return Math.min(Math.round(value * 100) / 100, total);
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function buildGatePreview(cfg: TicketPaymentDraft, quoteTotal: number): string {
  const isCashOnly =
    cfg.ticket_payment_strategy === "full" &&
    cfg.ticket_full_channels.length === 1 &&
    cfg.ticket_full_channels[0] === "cash";

  const isPartialCash =
    cfg.ticket_payment_strategy === "partial" &&
    cfg.ticket_dep_handling === "cash";

  // Mirror shadow app: describeGatePreview in pulse-quote-payment.js

  if (isCashOnly) {
    return `With current settings: Cash in person — record full payment (${fmt(quoteTotal)}) with receipt ID → production. No quote confirmation.`;
  }

  if (isPartialCash) {
    const dep = computeDeposit(quoteTotal, cfg.ticket_deposit_type, cfg.ticket_deposit_value);
    return `With current settings: Cash / offline deposit (${fmt(dep)}) with receipt ID → production starts. Client can pay remaining balance while in production.`;
  }

  const parts: string[] = [];
  if (cfg.ticket_require_client_confirm !== false) parts.push("Quote price must be confirmed");

  if (cfg.ticket_payment_strategy === "partial") {
    const dep = computeDeposit(quoteTotal, cfg.ticket_deposit_type, cfg.ticket_deposit_value);
    // Always show pct even when deposit_type is fixed — derive it from the amount
    const pct =
      cfg.ticket_deposit_type === "percent"
        ? cfg.ticket_deposit_value
        : quoteTotal > 0 ? Math.round((dep / quoteTotal) * 1000) / 10 : 0;
    parts.push(`${pct}% deposit (${fmt(dep)}) → production`);
    parts.push("remaining balance optional during production");
  } else if (cfg.ticket_payment_strategy === "full") {
    parts.push(`100% payment (${fmt(quoteTotal)}) → production`);
  } else {
    parts.push("No upfront payment (net terms) → production");
  }

  let extra = "";
  if (cfg.ticket_payment_strategy === "full" && !cfg.ticket_require_client_confirm) {
    extra = " Production requires payment only (no confirmation step).";
  }

  return `With current settings: ${parts.join(" → ")}.${extra}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuotePaymentConfig({ quoteTotal, initialConfig, onChange }: Props) {
  const [cfg, setCfg] = useState<TicketPaymentDraft>({
    ...PAYMENT_CONFIG_DEFAULTS,
    ...initialConfig,
  });
  const [followUpStart, setFollowUpStart] = useState(
    initialConfig?.quote_reminder_date ?? todayIso(),
  );

  // Sync follow-up start to net terms when strategy is net
  useEffect(() => {
    if (cfg.ticket_payment_strategy === "net") {
      const netStart = addDaysIso(getNetTermsDays(cfg.ticket_net_terms_label));
      setFollowUpStart(netStart);
      setCfg((prev) => ({ ...prev, quote_reminder_date: netStart }));
    }
  }, [cfg.ticket_payment_strategy, cfg.ticket_net_terms_label]);

  // Raw string states for deposit inputs — prevents leading-zero display issues
  const [depositPctRaw, setDepositPctRaw] = useState(String(initialConfig?.ticket_deposit_value ?? PAYMENT_CONFIG_DEFAULTS.ticket_deposit_value));
  const [depositFixedRaw, setDepositFixedRaw] = useState("");

  // Notify parent on any change — stable callback avoids infinite loop
  useEffect(() => {
    onChange(cfg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  function patch(updates: Partial<TicketPaymentDraft>) {
    setCfg((prev) => ({ ...prev, ...updates }));
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const {
    ticket_payment_strategy: strategy,
    ticket_deposit_type:     depType,
    ticket_deposit_value:    depValue,
    ticket_dep_handling:     depHandling,
    ticket_full_channels:    fullChannels,
    ticket_partial_channels: partialChannels,
    ticket_require_client_confirm: requireConfirm,
    ticket_quote_channel:    quoteChannel,
  } = cfg;

  const depositDue  = strategy === "partial" ? computeDeposit(quoteTotal, depType, depValue) : 0;
  const depositPct  = depType === "percent"
    ? depValue
    : quoteTotal > 0 ? Math.round((depositDue / quoteTotal) * 1000) / 10 : 0;
  const remaining   = Math.max(0, quoteTotal - depositDue);
  const isCashOnly  = strategy === "full" && fullChannels.length === 1 && fullChannels[0] === "cash";
  const isPartialCash = strategy === "partial" && depHandling === "cash";

  const gatePreview = quoteTotal > 0 ? buildGatePreview(cfg, quoteTotal) : null;

  // ── Channel toggle helpers ────────────────────────────────────────────────

  function toggleFullChannel(id: string) {
    if (id === "cash") {
      // Cash is exclusive — selecting it deselects all others; deselecting it restores defaults
      patch({
        ticket_full_channels: fullChannels.length === 1 && fullChannels[0] === "cash"
          ? [...DEFAULT_FULL_CHANNELS]
          : ["cash"],
      });
      return;
    }
    // Deselecting any non-cash channel: if it's the last one checked, keep it (shadow app behavior)
    const withoutCash = fullChannels.filter((c) => c !== "cash");
    if (withoutCash.includes(id)) {
      if (withoutCash.length === 1) return; // prevent zero selection — snap back
      patch({ ticket_full_channels: withoutCash.filter((c) => c !== id) });
    } else {
      // Selecting a non-cash channel always unchecks cash
      patch({ ticket_full_channels: [...withoutCash, id] });
    }
  }

  function togglePartialChannel(id: string) {
    if (partialChannels.includes(id)) {
      if (partialChannels.length === 1) return; // prevent zero selection — snap back
      patch({ ticket_partial_channels: partialChannels.filter((c) => c !== id) });
    } else {
      patch({ ticket_partial_channels: [...partialChannels, id] });
    }
  }

  // ── Style helpers ─────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    padding: "14px 16px",
  };

  const bgCard: React.CSSProperties = {
    ...card,
    background: "var(--color-bg)",
  };

  const sectionLabel = "block text-xs font-semibold uppercase tracking-wider mb-1.5";

  const field: React.CSSProperties = {
    background: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text-primary)",
    borderRadius: "6px",
    fontSize: "14px",
    padding: "7px 10px",
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  };

  function ChannelChip({
    id, label, active, onToggle,
  }: { id: string; label: string; active: boolean; onToggle: (id: string) => void }) {
    return (
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all text-left"
        style={{
          borderColor: active ? "var(--color-accent)" : "var(--color-border)",
          background:  active ? "var(--color-badge-bg)" : "var(--color-surface)",
          color: "var(--color-text-primary)",
        }}
      >
        <span
          className="flex-shrink-0 w-[14px] h-[14px] rounded-sm border flex items-center justify-center text-[9px] font-bold"
          style={{
            borderColor: active ? "var(--color-accent)" : "var(--color-border)",
            background:  active ? "var(--color-accent)" : "transparent",
            color: "var(--color-btn-primary-text)",
          }}
        >
          {active ? "✓" : ""}
        </span>
        {label}
      </button>
    );
  }

  function SelectWrap({ value, onChange, children }: {
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
  }) {
    return (
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none pr-8 rounded-md border outline-none"
          style={field}
        >
          {children}
        </select>
        <ChevronDown
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--color-text-muted)" }}
        />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* ── 1. Payment strategy ─────────────────────────────────────────────── */}
      <div style={card} className="space-y-3">
        <p className={sectionLabel} style={{ color: "var(--color-text-muted)" }}>
          1. Payment strategy
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(["partial", "full", "net"] as const).map((s) => {
            const active = strategy === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => patch({
                  ticket_payment_strategy: s,
                  // Auto-disable follow-up when switching to full — it doesn't apply
                  ...(s === "full" ? { ticket_follow_up_enabled: false } : {}),
                })}
                className="flex flex-col text-left rounded-[10px] border-2 p-[10px] transition-all h-full"
                style={{
                  borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                  background:  active ? "var(--color-badge-bg)" : "var(--color-bg)",
                }}
              >
                <span className="block font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {s === "partial" ? "Partial payment" : s === "full" ? "Pay in full" : "$0 upfront / Net terms"}
                </span>
                <span className="block text-xs mt-1 leading-snug" style={{ color: "var(--color-text-muted)" }}>
                  {s === "partial"
                    ? "Collect a deposit (% or fixed). Remainder can be paid via selected offline or online channels."
                    : s === "full"
                    ? "Require 100% upfront before production. Order moves to production when payment clears."
                    : "Start production without upfront payment. Reminders begin on the payment due date you select (10–60 days)."}
                </span>
              </button>
            );
          })}
        </div>

        {/* Gate preview */}
        {gatePreview && (
          <p
            className="text-xs leading-relaxed px-3 py-2.5 rounded-lg"
            style={{
              background: "var(--color-info-bg)",
              border: "1px solid var(--color-info-border)",
              color: "var(--color-info-text-deep)",
            }}
          >
            {gatePreview}
          </p>
        )}
      </div>

      {/* ── 2a. Partial payment settings ────────────────────────────────────── */}
      {strategy === "partial" && (
        <div style={bgCard} className="space-y-4">
          <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
            Partial payment settings
          </p>

          {/* Deposit inputs */}
          <div>
            <p className={sectionLabel} style={{ color: "var(--color-text-muted)" }}>
              Initial deposit
            </p>
            <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
              % and $ stay in sync — remaining balance updates automatically.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                  Deposit (%)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 30"
                  value={depositPctRaw}
                  onKeyDown={(e) => {
                    if (/^[0-9]$/.test(e.key) && depositPctRaw === "0") {
                      e.preventDefault();
                      if (e.key !== "0") { setDepositPctRaw(e.key); patch({ ticket_deposit_type: "percent", ticket_deposit_value: parseFloat(e.key) }); }
                    }
                  }}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+([1-9])/, "$1").replace(/(\..*)\./g, "$1");
                    setDepositPctRaw(v);
                    const n = parseFloat(v);
                    if (!isNaN(n)) patch({ ticket_deposit_type: "percent", ticket_deposit_value: Math.min(Math.max(n, 0), 100) });
                  }}
                  onBlur={() => {
                    const n = parseFloat(depositPctRaw);
                    const clamped = isNaN(n) ? 30 : Math.min(Math.max(n, 1), 100);
                    setDepositPctRaw(String(clamped));
                    patch({ ticket_deposit_type: "percent", ticket_deposit_value: clamped });
                  }}
                  style={field}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                  Deposit ($)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={depType === "fixed" ? depositFixedRaw : depositDue > 0 ? depositDue.toFixed(2) : ""}
                  onFocus={() => {
                    if (depType !== "fixed") setDepositFixedRaw(depositDue > 0 ? depositDue.toFixed(2) : "");
                  }}
                  onKeyDown={(e) => {
                    if (/^[0-9]$/.test(e.key) && depositFixedRaw === "0") {
                      e.preventDefault();
                      if (e.key !== "0") { setDepositFixedRaw(e.key); patch({ ticket_deposit_type: "fixed", ticket_deposit_value: parseFloat(e.key) }); }
                    }
                  }}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^0+([1-9])/, "$1").replace(/(\..*)\./g, "$1");
                    setDepositFixedRaw(v);
                    const n = parseFloat(v);
                    if (!isNaN(n)) patch({ ticket_deposit_type: "fixed", ticket_deposit_value: Math.max(n, 0) });
                  }}
                  onBlur={() => {
                    const n = parseFloat(depositFixedRaw);
                    const normalized = isNaN(n) ? "" : String(n);
                    setDepositFixedRaw(normalized);
                    if (!isNaN(n)) patch({ ticket_deposit_type: "fixed", ticket_deposit_value: Math.max(n, 0) });
                  }}
                  style={field}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                  Remaining ($)
                </label>
                <div
                  className="flex items-center px-2.5 py-[7px] rounded-md text-sm font-semibold border"
                  style={{
                    background: "var(--color-badge-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                    height: "33px",
                  }}
                >
                  {quoteTotal > 0 ? fmt(remaining) : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Deposit collection method */}
          <div>
            <p className={sectionLabel} style={{ color: "var(--color-text-muted)" }}>
              Deposit collection{depositDue > 0 ? ` (${fmt(depositDue)})` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["cash", "gateway"] as const).map((mode) => {
                const active = depHandling === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patch({ ticket_dep_handling: mode })}
                    className="flex flex-col text-left rounded-[10px] border p-3 transition-all"
                    style={{
                      borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                      background:  active ? "var(--color-badge-bg)" : "var(--color-surface)",
                    }}
                  >
                    <span className="block text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {mode === "cash" ? "Cash / offline" : "Online gateway"}
                    </span>
                    <span className="block text-xs mt-0.5 leading-snug" style={{ color: "var(--color-text-muted)" }}>
                      {mode === "cash"
                        ? "Deposit recorded manually; attach a receipt ID for tracking."
                        : "Send payment link; card captured when client pays."}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Cash receipt ID */}
            {depHandling === "cash" && (
              <div className="mt-2.5">
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                  Receipt ID{" "}
                  <span className="font-normal text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    — required for cash / offline
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. RCT-10482"
                  value={cfg.ticket_receipt_id}
                  onChange={(e) => patch({ ticket_receipt_id: e.target.value })}
                  style={field}
                />
              </div>
            )}
          </div>

          {/* Cash deposit hint */}
          {isPartialCash && (
            <div
              className="text-xs leading-relaxed px-3 py-2.5 rounded-lg"
              style={{
                background: "var(--color-success-bg)",
                border: "1px solid var(--color-success-border)",
                color: "var(--color-success)",
              }}
            >
              <strong>Cash / offline deposit:</strong> Record the deposit with a receipt ID. Select balance payment channels below for the remaining balance.
            </div>
          )}

          {/* Balance payment channels */}
          <div>
            <p className={sectionLabel} style={{ color: "var(--color-text-muted)" }}>
              Balance payment channels{remaining > 0 ? ` (${fmt(remaining)})` : ""}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PAY_CHANNELS.map((ch) => (
                <ChannelChip
                  key={ch.id}
                  id={ch.id}
                  label={ch.label}
                  active={partialChannels.includes(ch.id)}
                  onToggle={togglePartialChannel}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 2b. Full payment settings ────────────────────────────────────────── */}
      {strategy === "full" && (
        <div style={bgCard} className="space-y-4">
          <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
            Full payment settings{quoteTotal > 0 ? ` (${fmt(quoteTotal)})` : ""}
          </p>

          <div
            className="text-xs leading-relaxed px-3 py-2.5 rounded-lg"
            style={{
              background: "var(--color-info-bg)",
              border: "1px solid var(--color-info-border)",
              color: "var(--color-info-text-deep)",
            }}
          >
            <strong>Production trigger:</strong> Client receives a checkout for 100% of the quote. When payment is confirmed, the order is eligible for production scheduling.
          </div>

          <div>
            <p className={sectionLabel} style={{ color: "var(--color-text-muted)" }}>
              Payment method
            </p>
            <p className="text-sm mb-2" style={{ color: "var(--color-text-muted)" }}>
              {isCashOnly
                ? "Cash only — other methods are turned off. Receipt ID required. Client confirmation and follow-up are off."
                : "Select one or more methods for full payment checkout."}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PAY_CHANNELS.map((ch) => (
                <ChannelChip
                  key={ch.id}
                  id={ch.id}
                  label={ch.label}
                  active={fullChannels.includes(ch.id)}
                  onToggle={toggleFullChannel}
                />
              ))}
            </div>
          </div>

          {/* Cash receipt ID for cash-only full payment */}
          {isCashOnly && (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                Receipt ID{" "}
                <span className="font-normal text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  — required for cash
                </span>
              </label>
              <input
                type="text"
                placeholder="e.g. RCT-10482"
                value={cfg.ticket_receipt_id}
                onChange={(e) => patch({ ticket_receipt_id: e.target.value })}
                style={field}
              />
            </div>
          )}

          {/* Cash included but not exclusive */}
          {!isCashOnly && fullChannels.includes("cash") && (
            <div
              className="text-xs leading-relaxed px-3 py-2.5 rounded-lg"
              style={{
                background: "var(--color-success-bg)",
                border: "1px solid var(--color-success-border)",
                color: "var(--color-success)",
              }}
            >
              <strong>Cash included:</strong> All channels are available to the client. Record cash payments with a receipt ID on the quote.
            </div>
          )}
        </div>
      )}

      {/* ── 2c. Net terms settings ───────────────────────────────────────────── */}
      {strategy === "net" && (
        <div style={bgCard} className="space-y-4">
          <p className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>
            Payment due period
          </p>
          <div
            className="text-xs leading-relaxed px-3 py-2.5 rounded-lg"
            style={{
              background: "var(--color-success-bg)",
              border: "1px solid var(--color-success-border)",
              color: "var(--color-success)",
            }}
          >
            <strong>No upfront gate:</strong> Orders can enter production immediately. Follow-up reminders start on the payment due date below.
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
              Payment due within
            </label>
            <SelectWrap
              value={cfg.ticket_net_terms_label}
              onChange={(v) => patch({ ticket_net_terms_label: v })}
            >
              {NET_TERMS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </SelectWrap>
            <p className="mt-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
              Reminder start date is set to today plus this period (e.g. 30 days → due date 30 days from today).
            </p>
          </div>
        </div>
      )}

      {/* ── 3. Client confirmation ───────────────────────────────────────────── */}
      {!isCashOnly && (
        <div style={card}>
          <label className="flex gap-3 items-start cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.ticket_require_client_confirm}
              onChange={(e) => patch({ ticket_require_client_confirm: e.target.checked })}
              className="mt-0.5 flex-shrink-0 w-4 h-4"
              style={{ accentColor: "var(--color-accent)" }}
            />
            <span>
              <span className="block text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Require client confirmation before active order
              </span>
              <span className="block text-xs mt-1 leading-snug" style={{ color: "var(--color-text-muted)" }}>
                When enabled, a quote is sent first; a pending order may be created until the client confirms. Quote channel and destination are always required.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* ── 4. Quote delivery ────────────────────────────────────────────────── */}
      <div style={card} className="space-y-3">
        <p className={sectionLabel} style={{ color: "var(--color-text-muted)" }}>
          Send quote via
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
              Channel
            </label>
            <SelectWrap
              value={quoteChannel}
              onChange={(v) => patch({ ticket_quote_channel: v as "sms" | "email" | "both" })}
            >
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="both">SMS + Email</option>
            </SelectWrap>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
              {quoteChannel === "email" ? "Email address" : "Phone number"}{" "}
              <span className="font-normal text-[11px]" style={{ color: "var(--color-text-muted)" }}>— required</span>
            </label>
            {quoteChannel === "email" ? (
              <EmailInput
                value={cfg.ticket_dest_email}
                onChange={(e) => patch({ ticket_dest_email: e.target.value })}
              />
            ) : (
              <PhoneInput
                value={cfg.ticket_dest_phone}
                onChange={(val) => patch({ ticket_dest_phone: val })}
              />
            )}
          </div>
        </div>

        {/* Email field when both channels selected */}
        {quoteChannel === "both" && (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
              Email address{" "}
              <span className="font-normal text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                — required when SMS + Email is selected
              </span>
            </label>
            <EmailInput
              value={cfg.ticket_dest_email}
              onChange={(e) => patch({ ticket_dest_email: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* ── 5. Follow-up schedule — hidden for full payment (pay upfront, no reminders needed) */}
      {strategy !== "full" && <div style={card} className="space-y-3">
        <label className="flex gap-2.5 items-center cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.ticket_follow_up_enabled}
            onChange={(e) => patch({ ticket_follow_up_enabled: e.target.checked })}
            className="w-4 h-4 flex-shrink-0"
            style={{ accentColor: "var(--color-accent)" }}
          />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Quote follow-up schedule
          </span>
        </label>

        {cfg.ticket_follow_up_enabled && (
          <div
            className="rounded-lg p-3 space-y-3"
            style={{ background: "var(--color-badge-bg)", border: "1px solid var(--color-border)" }}
          >
            <p className={sectionLabel} style={{ color: "var(--color-text-muted)" }}>
              Follow-up details
            </p>
            {isPartialCash && (
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Applies to cash and in-person deposits — use reminders for quote confirmation and balance collection.
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                  Reminder start date
                </label>
                {strategy === "net" ? (
                  <div
                    className="flex items-center px-3 py-[7px] rounded-md border text-sm"
                    style={{
                      background: "var(--color-badge-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-muted)",
                      opacity: 0.75,
                      cursor: "not-allowed",
                    }}
                  >
                    {followUpStart || "Set from due period above"}
                  </div>
                ) : (
                  <DatePicker
                    value={followUpStart}
                    onChange={(val) => {
                      setFollowUpStart(val);
                      patch({ quote_reminder_date: val });
                    }}
                    placeholder="Select start date"
                    disablePast
                  />
                )}
                {strategy === "net" && (
                  <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    Set from payment due period above.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                  Number of follow-ups
                </label>
                <SelectWrap
                  value={String(cfg.ticket_follow_up_count)}
                  onChange={(v) => patch({ ticket_follow_up_count: parseInt(v) })}
                >
                  {FOLLOW_UP_COUNTS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </SelectWrap>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
                  Frequency
                </label>
                <SelectWrap
                  value={cfg.ticket_follow_up_freq}
                  onChange={(v) => patch({ ticket_follow_up_freq: v as "daily" | "every-3-days" | "weekly" })}
                >
                  {FOLLOW_UP_FREQS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </SelectWrap>
              </div>
            </div>
          </div>
        )}
      </div>}

    </div>
  );
}
