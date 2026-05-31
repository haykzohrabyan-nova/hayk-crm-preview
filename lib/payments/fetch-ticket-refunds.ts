import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface TicketPaymentRefundRecord {
  id: string;
  ticket_id: string;
  amount: number;
  payment_mode: "deposit" | "balance" | "full";
  method: string;
  source: "stripe" | "manual";
  stripe_refund_id: string | null;
  reason: string;
  notes: string | null;
  evidence_path: string | null;
  refunded_by_id: string | null;
  created_at: string;
  refunded_by?: { id: string; full_name: string | null } | null;
}

export async function fetchTicketPaymentRefunds(
  admin: AdminClient,
  ticketId: string,
): Promise<TicketPaymentRefundRecord[]> {
  const { data, error } = await admin
    .from("ticket_payment_refunds")
    .select(
      "id, ticket_id, amount, payment_mode, method, source, stripe_refund_id, reason, notes, evidence_path, refunded_by_id, created_at",
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as TicketPaymentRefundRecord[];
  const userIds = [...new Set(rows.map((r) => r.refunded_by_id).filter(Boolean))] as string[];

  if (userIds.length === 0) return rows;

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds);

  const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((r) => ({
    ...r,
    refunded_by: r.refunded_by_id
      ? { id: r.refunded_by_id, full_name: nameMap[r.refunded_by_id] ?? null }
      : null,
  }));
}
