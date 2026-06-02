"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { REALTIME_REFETCH_MS } from "@/lib/constants/realtime-refetch";

type TicketRealtimeSyncOptions = {
  /** When false, subscriptions are torn down (e.g. while user is editing). */
  enabled?: boolean;
  /** Burst coalesce only; default 0 — no delay before refresh. */
  debounceMs?: number;
};

/**
 * Silent refresh when a ticket changes — staff saves, customer public portal,
 * payment webhooks, refunds, or sidebar relay events.
 */
export function useTicketRealtimeSync(
  ticketId: string | null | undefined,
  onRefresh: () => void,
  options?: TicketRealtimeSyncOptions,
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const enabled = options?.enabled ?? true;
  const debounceMs = options?.debounceMs ?? REALTIME_REFETCH_MS;

  useEffect(() => {
    if (!ticketId || !enabled) return;

    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => onRefreshRef.current(), debounceMs);
    }

    const channel = supabase
      .channel(`ticket-sync:${ticketId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_tickets", filter: `id=eq.${ticketId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activities", filter: `ticket_id=eq.${ticketId}` },
        scheduleRefresh,
      )
      .subscribe();

    function onWindowEvent() {
      scheduleRefresh();
    }
    window.addEventListener("bazaar:tickets-changed", onWindowEvent);
    window.addEventListener("bazaar:activities-changed", onWindowEvent);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("bazaar:tickets-changed", onWindowEvent);
      window.removeEventListener("bazaar:activities-changed", onWindowEvent);
      supabase.removeChannel(channel);
    };
  }, [ticketId, enabled, debounceMs]);
}
