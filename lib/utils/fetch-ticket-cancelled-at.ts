import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** When the ticket was cancelled (column or `ticket_cancelled` activity). */
export async function resolveTicketCancelledAt(
  admin: AdminClient,
  ticketId: string,
  ticketStatus: string,
  storedCancelledAt?: string | null,
): Promise<string | null> {
  if (ticketStatus !== "cancelled") return null;
  if (storedCancelledAt) return storedCancelledAt;

  const { data } = await admin
    .from("activities")
    .select("created_at")
    .eq("ticket_id", ticketId)
    .eq("type", "ticket_cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.created_at as string | undefined) ?? null;
}
