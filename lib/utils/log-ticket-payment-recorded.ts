import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentRecordedMode = "deposit" | "balance" | "full";

export interface LogTicketPaymentRecordedInput {
  ticketId: string;
  leadId?: string | null;
  customerId?: string | null;
  byUserId?: string | null;
  mode: PaymentRecordedMode;
  method: string;
  amount: number;
  receiptId?: string | null;
  newTotal: number;
  fullyPaid: boolean;
  /** Origin tag — used in History labels and audit. */
  via:
    | "staff_record"
    | "staff_cash_auto"
    | "staff_cash_collect_on_complete"
    | "accountant_evidence_confirm"
    | "public_payment"
    | "staff_cash_auto_backfill";
  createdAt?: string;
}

/** Canonical activity for confirmed payments — Reports and dashboard read this type only. */
export async function logTicketPaymentRecorded(
  admin: SupabaseClient,
  input: LogTicketPaymentRecordedInput,
): Promise<void> {
  const now = input.createdAt ?? new Date().toISOString();
  await admin.from("activities").insert({
    type: "ticket_payment_recorded",
    lead_id: input.leadId ?? null,
    customer_id: input.customerId ?? null,
    ticket_id: input.ticketId,
    by_user_id: input.byUserId ?? null,
    payload: {
      mode: input.mode,
      method: input.method,
      amount: input.amount,
      receipt_id: input.receiptId ?? null,
      new_total: input.newTotal,
      fully_paid: input.fullyPaid,
      via: input.via,
    },
    created_at: now,
  });
}
