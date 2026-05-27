import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInitialFollowUpSchedule } from "@/lib/utils/follow-up-schedule";

/** When a quote is sent with follow-ups enabled, seed `follow_up_at` and remaining cycle count. */
export async function initializeTicketFollowUpSchedule(
  admin: SupabaseClient,
  ticketId: string,
  ticket: {
    ticket_follow_up_enabled: boolean | null;
    quote_reminder_date: string | null;
    ticket_follow_up_count: number | null;
    ticket_follow_up_freq: string | null;
    follow_up_cycles: number | null;
  },
): Promise<void> {
  if (!ticket.ticket_follow_up_enabled) return;

  const schedule = buildInitialFollowUpSchedule(ticket);
  if (!schedule) return;

  await admin
    .from("job_tickets")
    .update({
      ...schedule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
}
