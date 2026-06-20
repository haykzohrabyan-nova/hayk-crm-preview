"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  getListPageCache,
  invalidateListPageCache,
  LIST_PAGE_CACHE_INVALIDATE_EVENT,
  setListPageCache,
} from "@/lib/client/list-page-cache";
import { LIST_NAV_REVALIDATE_MS, REALTIME_REFETCH_MS } from "@/lib/constants/realtime-refetch";

type Options = {
  /** Window events (realtime / mutations) — refetch ASAP, independent of navigation cache timing. */
  events?: string[];
  enabled?: boolean;
  /** First load when nothing is cached (ms). */
  mountDelay?: number;
  /** Returning to a cached tab/URL — background refresh only (ms). */
  revalidateDelay?: number;
  /** Debounce for burst realtime events only (ms). Default 0 = start fetch immediately. */
  realtimeDelay?: number;
};

type FlightState = {
  inFlight: boolean;
  pendingSilent: boolean;
};

/**
 * Stale-while-revalidate for list page-data:
 * - Navigation: show per-key cache immediately, optional delayed background revalidate.
 * - Realtime: refetch immediately; at most one in-flight request per key, one follow-up if needed.
 */
export function useStaleWhileRevalidate<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: Options,
) {
  const enabled = options?.enabled ?? true;
  const mountDelay = options?.mountDelay ?? 50;
  const revalidateDelay = options?.revalidateDelay ?? LIST_NAV_REVALIDATE_MS;
  const realtimeDelay = options?.realtimeDelay ?? REALTIME_REFETCH_MS;
  const events = options?.events ?? [];

  // SSR-safe: always start with null/true so the server skeleton matches the
  // client's initial render. The useLayoutEffect below restores any cached
  // data before the browser paints, so returning visitors still see instant
  // data with no visible flash.
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const generationRef = useRef(0);
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;
  const flightRef = useRef<FlightState>({ inFlight: false, pendingSilent: false });

  const runFetch = useCallback(
    async (silent: boolean) => {
      if (!enabled) return;
      const keyAtStart = cacheKeyRef.current;
      const generation = ++generationRef.current;
      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const next = await fetcherRef.current();
        if (generation !== generationRef.current) return;
        if (keyAtStart !== cacheKeyRef.current) return;
        setListPageCache(keyAtStart, next);
        setData(next);
      } catch {
        if (generation !== generationRef.current) return;
        if (keyAtStart !== cacheKeyRef.current) return;
        if (!silent && !getListPageCache<T>(keyAtStart)) setData(null);
      } finally {
        if (generation !== generationRef.current) return;
        if (keyAtStart !== cacheKeyRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled],
  );

  const requestFetch = useCallback(
    (silent: boolean) => {
      if (!enabled) return;
      if (flightRef.current.inFlight) {
        flightRef.current.pendingSilent = true;
        return;
      }
      flightRef.current.inFlight = true;
      void (async () => {
        try {
          await runFetch(silent);
        } finally {
          flightRef.current.inFlight = false;
          if (flightRef.current.pendingSilent) {
            flightRef.current.pendingSilent = false;
            requestFetch(true);
          }
        }
      })();
    },
    [enabled, runFetch],
  );

  const requestFetchRef = useRef(requestFetch);
  requestFetchRef.current = requestFetch;

  // Before paint: never show another tab/filter's cached rows.
  useLayoutEffect(() => {
    if (!enabled) return;

    generationRef.current += 1;
    flightRef.current = { inFlight: false, pendingSilent: false };
    const cached = getListPageCache<T>(cacheKey);
    if (cached != null) {
      setData(cached);
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }
    setRefreshing(false);
  }, [cacheKey, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const cached = getListPageCache<T>(cacheKey);

    let mountTimer: ReturnType<typeof setTimeout> | null = null;
    let realtimeTimer: ReturnType<typeof setTimeout> | null = null;

    const clearMountTimer = () => {
      if (mountTimer) {
        clearTimeout(mountTimer);
        mountTimer = null;
      }
    };

    const scheduleMount = () => {
      clearMountTimer();
      const hasCache = cached != null;
      const delay = hasCache ? revalidateDelay : mountDelay;
      mountTimer = setTimeout(() => requestFetchRef.current(hasCache), delay);
    };

    const scheduleRealtime = () => {
      clearMountTimer();
      if (realtimeTimer) clearTimeout(realtimeTimer);
      realtimeTimer = setTimeout(() => {
        realtimeTimer = null;
        requestFetchRef.current(true);
      }, realtimeDelay);
    };

    scheduleMount();

    const onEvent = () => scheduleRealtime();
    for (const name of events) {
      window.addEventListener(name, onEvent);
    }
    const onInvalidate = () => {
      invalidateListPageCache();
      clearMountTimer();
      if (realtimeTimer) clearTimeout(realtimeTimer);
      requestFetchRef.current(false);
    };
    window.addEventListener(LIST_PAGE_CACHE_INVALIDATE_EVENT, onInvalidate);

    return () => {
      clearMountTimer();
      if (realtimeTimer) clearTimeout(realtimeTimer);
      for (const name of events) {
        window.removeEventListener(name, onEvent);
      }
      window.removeEventListener(LIST_PAGE_CACHE_INVALIDATE_EVENT, onInvalidate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled, mountDelay, revalidateDelay, realtimeDelay, ...deps, ...events]);

  return {
    data,
    loading,
    refreshing,
    refresh: requestFetch,
    setData,
  };
}
