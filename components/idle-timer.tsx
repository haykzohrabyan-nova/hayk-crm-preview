"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShieldCheck } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
] as const;

const POLL_INTERVAL_MS = 10_000; // check every 10 seconds
const WARNING_LEAD_MS = 2 * 60 * 1000; // show warning 2 min before timeout
const DEFAULT_TIMEOUT_MIN = 20;

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Warning Modal ────────────────────────────────────────────────────────────

function IdleWarningModal({
  remainingMs,
  onStay,
}: {
  remainingMs: number;
  onStay: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="w-full max-w-sm rounded-[12px] border p-6 shadow-xl"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="h-11 w-11 rounded-[10px] flex items-center justify-center"
            style={{ background: "var(--color-warning-bg)" }}
          >
            <ShieldCheck className="h-5 w-5" style={{ color: "var(--color-warning)" }} />
          </div>
        </div>

        {/* Title */}
        <h2
          className="text-center text-[16px] font-semibold mb-1"
          style={{ color: "var(--color-text-primary)" }}
        >
          Session Expiring
        </h2>

        {/* Body */}
        <p
          className="text-center text-[13px] mb-4 leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
        >
          You&apos;ve been inactive for a while. For security, your session
          will expire in:
        </p>

        {/* Countdown */}
        <div
          className="text-center text-[32px] font-semibold mb-5 tabular-nums"
          style={{ color: "var(--color-accent)" }}
        >
          {formatCountdown(remainingMs)}
        </div>

        {/* Stay signed in */}
        <button
          onClick={onStay}
          className="w-full rounded-[6px] py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90 active:scale-[0.97]"
          style={{
            background: "var(--color-btn-verify-bg)",
            color: "var(--color-btn-verify-text)",
          }}
        >
          Stay Signed In
        </button>

        <p
          className="mt-3 text-center text-[11px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          Sessions are logged for security. &nbsp;
          <a
            href="/policy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--color-accent)" }}
          >
            Learn more
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IdleTimer() {
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_TIMEOUT_MIN * 60 * 1000);
  const [showWarning, setShowWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  const lastActivityRef = useRef(Date.now());
  const signingOutRef = useRef(false);

  // ── Fetch timeout config + current user id ────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/company")
      .then((r) => r.json())
      .then((d) => {
        const minutes: number =
          d?.settings?.session_idle_timeout_minutes ?? DEFAULT_TIMEOUT_MIN;
        setTimeoutMs(Math.max(5, minutes) * 60 * 1000);
      })
      .catch(() => {});

    // Grab user id so we can include it in the session-end payload
    // (the cookie may be mid-invalidation at sign-out time)
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // ── Sign out helper ────────────────────────────────────────────────────────
  const signOut = useCallback(
    async (reason: "manual" | "auto") => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      try {
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end", reason, user_id: userId }),
        });
      } catch {
        // best-effort — don't block sign-out
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.assign("/login");
    },
    [userId]
  );

  // ── Stay signed in ────────────────────────────────────────────────────────
  const handleStay = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  // ── Activity listeners ─────────────────────────────────────────────────────
  useEffect(() => {
    function resetTimer() {
      lastActivityRef.current = Date.now();
      if (showWarning) setShowWarning(false);
    }

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [showWarning]);

  // ── Polling loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (signingOutRef.current) return;

      const idleMs = Date.now() - lastActivityRef.current;
      const remaining = timeoutMs - idleMs;

      if (remaining <= 0) {
        setShowWarning(false);
        signOut("auto");
        return;
      }

      if (remaining <= WARNING_LEAD_MS) {
        setRemainingMs(remaining);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [timeoutMs, signOut]);

  // ── Countdown ticker (only when warning is visible) ───────────────────────
  useEffect(() => {
    if (!showWarning) return;

    const ticker = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const remaining = timeoutMs - idleMs;
      if (remaining <= 0) {
        clearInterval(ticker);
        signOut("auto");
      } else {
        setRemainingMs(remaining);
      }
    }, 1000);

    return () => clearInterval(ticker);
  }, [showWarning, timeoutMs, signOut]);

  if (!showWarning) return null;

  return (
    <IdleWarningModal remainingMs={remainingMs} onStay={handleStay} />
  );
}
