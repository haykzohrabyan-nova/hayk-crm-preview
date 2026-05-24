"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";

interface GlobalLoadingContextValue {
  isLoading: boolean;
  message: string;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  runWithLoading: <T>(fn: () => Promise<T>, message?: string) => Promise<T>;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

const DEFAULT_MESSAGE = "Loading…";

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const depthRef = useRef(0);

  const showLoading = useCallback((nextMessage?: string) => {
    depthRef.current += 1;
    if (nextMessage) setMessage(nextMessage);
    else if (depthRef.current === 1) setMessage(DEFAULT_MESSAGE);
    setVisible(true);
  }, []);

  const hideLoading = useCallback(() => {
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) {
      setVisible(false);
      setMessage(DEFAULT_MESSAGE);
    }
  }, []);

  const runWithLoading = useCallback(
    async <T,>(fn: () => Promise<T>, nextMessage?: string): Promise<T> => {
      showLoading(nextMessage);
      try {
        return await fn();
      } finally {
        hideLoading();
      }
    },
    [showLoading, hideLoading],
  );

  const value = useMemo(
    () => ({
      isLoading: visible,
      message,
      showLoading,
      hideLoading,
      runWithLoading,
    }),
    [visible, message, showLoading, hideLoading, runWithLoading],
  );

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      {visible && <GlobalLoadingOverlay message={message} />}
    </GlobalLoadingContext.Provider>
  );
}

function GlobalLoadingOverlay({ message }: { message: string }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: "color-mix(in srgb, var(--color-topbar) 55%, transparent)" }}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      aria-label={message}
    >
      <div
        className="flex flex-col items-center gap-4 rounded-[12px] border px-8 py-7 text-center shadow-none max-w-sm w-full"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <Loader2
          size={36}
          className="animate-spin shrink-0"
          style={{ color: "var(--color-accent)" }}
          aria-hidden
        />
        <div>
          <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {message}
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
            Please wait — do not close this page.
          </p>
        </div>
      </div>
    </div>
  );
}

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  }
  return ctx;
}

/** Message helpers for common long-running ticket actions */
export const GLOBAL_LOADING_MESSAGES = {
  saving: "Saving…",
  sendingQuote: "Sending quote…",
  savingDraft: "Saving draft…",
  routingQuote: "Routing quote to Sales…",
  convertingOrder: "Converting to order…",
  confirmingPayment: "Confirming payment…",
  releasingProduction: "Releasing to production…",
  completingOrder: "Completing order…",
} as const;
