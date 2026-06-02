"use client";

import { useEffect, useRef } from "react";

type CoalescedRefreshOptions = {
  /** Delay before first mount fetch (ms). Default 50. */
  mountDelay?: number;
  /** Delay for silent realtime/event refetches (ms). Default 300. */
  eventDelay?: number;
  /** Window events that trigger a silent refresh. */
  events?: string[];
  enabled?: boolean;
};

const DEFAULT_EVENTS: string[] = [];

/**
 * Debounces list + count refetches on mount and on realtime/window events.
 * Prevents duplicate API calls from React Strict Mode double-mount in dev.
 */
export function useCoalescedRefresh(
  refresh: (silent: boolean) => void,
  deps: unknown[],
  options?: CoalescedRefreshOptions,
) {
  const mountDelay = options?.mountDelay ?? 50;
  const eventDelay = options?.eventDelay ?? 0;
  const events = options?.events ?? DEFAULT_EVENTS;
  const enabled = options?.enabled ?? true;

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const prevEnabledRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      prevEnabledRef.current = false;
      return;
    }

    /** After pausing (e.g. modal open), resume with silent refetch — not a full loading cycle. */
    const resumeSilent = prevEnabledRef.current === false;
    prevEnabledRef.current = true;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh(silent: boolean) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(
        () => refreshRef.current(silent),
        silent ? eventDelay : mountDelay,
      );
    }

    scheduleRefresh(resumeSilent);

    function onEvent() {
      scheduleRefresh(true);
    }

    for (const eventName of events) {
      window.addEventListener(eventName, onEvent);
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const eventName of events) {
        window.removeEventListener(eventName, onEvent);
      }
    };
    // refresh is read via ref — do not add to deps (inline wrappers change every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mountDelay, eventDelay, ...deps]);
}
