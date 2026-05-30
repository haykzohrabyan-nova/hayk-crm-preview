/** Supabase Realtime broadcast channel for `/q/[public_token]` (no auth). */
export const PUBLIC_QUOTE_BROADCAST_EVENT = "updated";

export function publicQuoteChannelName(publicToken: string): string {
  return `public-quote:${publicToken}`;
}
