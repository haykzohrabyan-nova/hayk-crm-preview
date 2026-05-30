import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PUBLIC_QUOTE_BROADCAST_EVENT,
  publicQuoteChannelName,
} from "@/lib/constants/public-quote-realtime";

const SUBSCRIBE_TIMEOUT_MS = 5_000;

/** Statuses where `/q/[token]` shows customer-facing content (not draft/routed). */
export const CUSTOMER_PORTAL_STATUSES = new Set([
  "sent",
  "order",
  "in_production",
  "completed",
  "cancelled",
]);

/**
 * Push a Realtime broadcast so open `/q/[token]` tabs refetch without polling.
 * Fire-and-forget — never blocks or fails the caller's response.
 */
export function notifyPublicQuoteUpdated(publicToken: string | null | undefined): void {
  const token = publicToken?.trim();
  if (!token) return;

  void (async () => {
    const supabase = createAdminClient();
    const channel = supabase.channel(publicQuoteChannelName(token));

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("subscribe timeout")), SUBSCRIBE_TIMEOUT_MS);

        channel.subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timeout);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timeout);
            reject(err ?? new Error(status));
          }
        });
      });

      const sendResult = await channel.send({
        type: "broadcast",
        event: PUBLIC_QUOTE_BROADCAST_EVENT,
        payload: { at: new Date().toISOString() },
      });

      if (sendResult !== "ok") {
        console.error("[notify-public-quote] send status:", sendResult, { tokenPrefix: token.slice(0, 8) });
      }
    } catch (err) {
      console.error("[notify-public-quote] broadcast failed:", err, { tokenPrefix: token.slice(0, 8) });
    } finally {
      await supabase.removeChannel(channel);
    }
  })();
}

/** Lookup ticket; broadcast only when status is visible on the public portal. */
export function notifyPublicQuoteUpdatedByTicketId(
  admin: SupabaseClient,
  ticketId: string,
): void {
  void (async () => {
    const { data, error } = await admin
      .from("job_tickets")
      .select("public_token, ticket_status")
      .eq("id", ticketId)
      .maybeSingle();

    if (error) {
      console.error("[notify-public-quote] token lookup failed:", error.message, { ticketId });
      return;
    }

    if (!data?.public_token) return;

    const status = data.ticket_status as string | null;
    if (!status || !CUSTOMER_PORTAL_STATUSES.has(status)) return;

    notifyPublicQuoteUpdated(data.public_token);
  })();
}
