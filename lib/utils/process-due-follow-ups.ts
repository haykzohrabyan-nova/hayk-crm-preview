import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildInitialFollowUpSchedule,
  nextFollowUpAfterSend,
  remainingFollowUpCount,
} from "@/lib/utils/follow-up-schedule";
import { sendQuoteFollowUpReminder } from "@/lib/integrations/send-quote";

const CANDIDATE_SELECT = `
  id,
  title,
  reference_code,
  public_token,
  quote_channel,
  quote_destination,
  ticket_quote_channel,
  ticket_dest_email,
  ticket_dest_phone,
  quote_final_total,
  quote_reminder_date,
  follow_up_at,
  follow_up_cycles,
  follow_up_frequency,
  follow_up_completed,
  ticket_follow_up_enabled,
  ticket_follow_up_count,
  ticket_follow_up_freq,
  client_confirmed,
  linked_lead_id,
  customer_id,
  created_by_id,
  contact_name,
  customer:customers(first_name, last_name, email, phone)
`;

export interface FollowUpCronResult {
  scanned: number;
  sent: number;
  failed: number;
  completed: number;
  initialized: number;
  errors: Array<{ ticketId: string; error: string }>;
}

type FollowUpTicket = {
  id: string;
  title: string | null;
  reference_code: string | null;
  public_token: string;
  quote_channel: string | null;
  quote_destination: string | null;
  ticket_quote_channel: string | null;
  ticket_dest_email: string | null;
  ticket_dest_phone: string | null;
  quote_final_total: number | null;
  quote_reminder_date: string | null;
  follow_up_at: string | null;
  follow_up_cycles: number | null;
  follow_up_frequency: string | null;
  follow_up_completed: boolean;
  ticket_follow_up_enabled: boolean | null;
  ticket_follow_up_count: number | null;
  ticket_follow_up_freq: string | null;
  client_confirmed: boolean;
  linked_lead_id: string | null;
  customer_id: string | null;
  created_by_id: string | null;
  contact_name: string | null;
  customer?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export async function processDueQuoteFollowUps(
  admin: SupabaseClient,
  opts?: { limit?: number },
): Promise<FollowUpCronResult> {
  const limit = opts?.limit ?? 50;
  const now = new Date();
  const nowIso = now.toISOString();

  const result: FollowUpCronResult = {
    scanned: 0,
    sent: 0,
    failed: 0,
    completed: 0,
    initialized: 0,
    errors: [],
  };

  const { data: rows, error: queryErr } = await admin
    .from("job_tickets")
    .select(CANDIDATE_SELECT)
    .eq("ticket_kind", "quote")
    .eq("ticket_status", "sent")
    .eq("ticket_follow_up_enabled", true)
    .eq("follow_up_completed", false)
    .eq("client_confirmed", false)
    .order("follow_up_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (queryErr) {
    throw new Error(queryErr.message);
  }

  const tickets = (rows ?? []) as unknown as FollowUpTicket[];
  result.scanned = tickets.length;

  const { data: companyRow } = await admin.from("company_settings").select("*").eq("id", 1).single();
  if (!companyRow) {
    throw new Error("company_settings row not found.");
  }

  for (const ticket of tickets) {
    let working = ticket;

    if (!working.follow_up_at) {
      const schedule = buildInitialFollowUpSchedule(working);
      if (!schedule) continue;

      await admin
        .from("job_tickets")
        .update({ ...schedule, updated_at: nowIso })
        .eq("id", working.id);

      working = { ...working, ...schedule };
      result.initialized += 1;

      if (new Date(working.follow_up_at!) > now) continue;
    } else if (new Date(working.follow_up_at) > now) {
      continue;
    }

    if (remainingFollowUpCount(working) <= 0) {
      await admin
        .from("job_tickets")
        .update({
          follow_up_completed: true,
          follow_up_cycles: 0,
          updated_at: nowIso,
        })
        .eq("id", working.id);
      result.completed += 1;
      continue;
    }

    const sendResult = await sendQuoteFollowUpReminder(
      {
        ...working,
        quote_skus: [],
        quote_payment_types: [],
        quote_subtotal: null,
        quote_shipping: null,
        quote_pre_tax_total: null,
        quote_tax_rate_percent: null,
        quote_tax_amount: null,
        discount_type: null,
        discount_value: null,
        prepayment_type: null,
        prepayment_value: null,
        tax_exempt: false,
        order_source: null,
      },
      companyRow,
    );

    if (!sendResult.ok) {
      result.failed += 1;
      result.errors.push({ ticketId: working.id, error: sendResult.error ?? "Send failed." });
      continue;
    }

    const patch = nextFollowUpAfterSend(working);
    await admin
      .from("job_tickets")
      .update({
        ...patch,
        quote_approval_last_requested_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", working.id);

    await admin.from("activities").insert({
      type: "quote_approval_requested",
      lead_id: working.linked_lead_id ?? null,
      customer_id: working.customer_id ?? null,
      ticket_id: working.id,
      by_user_id: working.created_by_id ?? null,
      payload: {
        reference_code: working.reference_code,
        title: working.title,
        amount: working.quote_final_total,
        at: nowIso,
        via: "cron",
        channel: sendResult.channel,
        remaining: patch.follow_up_cycles,
      },
      created_at: nowIso,
    });

    result.sent += 1;
    if (patch.follow_up_completed) result.completed += 1;
  }

  return result;
}
