/** Quote follow-up scheduling — used when a quote is sent and by the cron job. */

export type FollowUpFreq = "daily" | "every-3-days" | "weekly";

const LEGACY_FREQ: Record<FollowUpFreq, string> = {
  daily: "Daily",
  "every-3-days": "Every 2 days",
  weekly: "Weekly",
};

export function normalizeFollowUpFreq(raw: string | null | undefined): FollowUpFreq {
  const v = (raw ?? "daily").toLowerCase().replace(/_/g, "-");
  if (v === "weekly") return "weekly";
  if (v === "every-3-days" || v === "every-2-days" || v === "every 2 days") return "every-3-days";
  return "daily";
}

export function legacyFollowUpFrequency(freq: FollowUpFreq): string {
  return LEGACY_FREQ[freq];
}

/** First send time from `quote_reminder_date` (YYYY-MM-DD) — 2pm UTC (~9am US Eastern). */
export function followUpAtFromReminderDate(isoDate: string): Date {
  return new Date(`${isoDate}T14:00:00.000Z`);
}

export function addFollowUpInterval(from: Date, freq: FollowUpFreq): Date {
  const next = new Date(from);
  if (freq === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (freq === "every-3-days") {
    next.setUTCDate(next.getUTCDate() + 3);
  } else {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export interface FollowUpSchedulePatch {
  follow_up_at: string;
  follow_up_cycles: number;
  follow_up_frequency: string;
  follow_up_completed: boolean;
}

export function buildInitialFollowUpSchedule(ticket: {
  quote_reminder_date: string | null;
  ticket_follow_up_count: number | null;
  ticket_follow_up_freq: string | null;
  follow_up_cycles: number | null;
}): FollowUpSchedulePatch | null {
  const count = ticket.ticket_follow_up_count ?? ticket.follow_up_cycles;
  if (!count || count <= 0) return null;
  if (!ticket.quote_reminder_date) return null;

  const freq = normalizeFollowUpFreq(ticket.ticket_follow_up_freq);
  const scheduled = followUpAtFromReminderDate(ticket.quote_reminder_date);
  const now = new Date();
  const follow_up_at = scheduled <= now ? now : scheduled;

  return {
    follow_up_at: follow_up_at.toISOString(),
    follow_up_cycles: count,
    follow_up_frequency: legacyFollowUpFrequency(freq),
    follow_up_completed: false,
  };
}

export function remainingFollowUpCount(ticket: {
  follow_up_cycles: number | null;
  ticket_follow_up_count: number | null;
}): number {
  if (ticket.follow_up_cycles != null && ticket.follow_up_cycles >= 0) {
    return ticket.follow_up_cycles;
  }
  return ticket.ticket_follow_up_count ?? 0;
}

export function nextFollowUpAfterSend(ticket: {
  ticket_follow_up_freq: string | null;
  follow_up_frequency: string | null;
  follow_up_cycles: number | null;
  ticket_follow_up_count: number | null;
}): FollowUpSchedulePatch {
  const freq = normalizeFollowUpFreq(
    ticket.ticket_follow_up_freq ?? ticket.follow_up_frequency,
  );
  const remainingBefore = remainingFollowUpCount(ticket);
  const remainingAfter = Math.max(0, remainingBefore - 1);
  const now = new Date();

  if (remainingAfter <= 0) {
    return {
      follow_up_at: now.toISOString(),
      follow_up_cycles: 0,
      follow_up_frequency: legacyFollowUpFrequency(freq),
      follow_up_completed: true,
    };
  }

  return {
    follow_up_at: addFollowUpInterval(now, freq).toISOString(),
    follow_up_cycles: remainingAfter,
    follow_up_frequency: legacyFollowUpFrequency(freq),
    follow_up_completed: false,
  };
}
