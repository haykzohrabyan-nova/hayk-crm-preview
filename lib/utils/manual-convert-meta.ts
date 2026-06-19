import type { createAdminClient } from "@/lib/supabase/admin";
import { getAmountPaid, isPaymentEvidencePending, type TicketPaymentFields } from "@/lib/utils/invoice-payment-summary";

export type ManualConvertMeta = {
  by_admin: boolean;
  by_name: string | null;
  confirm_required_missing: boolean;
  payment_missing: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

function isPaymentMissing(ticket: TicketPaymentFields): boolean {
  if (isPaymentEvidencePending(ticket)) return false;
  const received = getAmountPaid(ticket);
  if (ticket.deposit_paid_at || ticket.payment_paid_at) return false;
  return received <= 0.01;
}

/** Admin manual convert while customer confirmation and/or payment may still be missing. */
export async function fetchManualConvertMeta(
  admin: AdminClient,
  ticketId: string,
  ticket: TicketPaymentFields & {
    ticket_status: string;
    client_confirmed?: boolean | null;
    ticket_require_client_confirm?: boolean | null;
  },
): Promise<ManualConvertMeta | null> {
  if (ticket.ticket_status !== "order") return null;

  const { data: activity } = await admin
    .from("activities")
    .select("by_user_id")
    .eq("ticket_id", ticketId)
    .eq("type", "ticket_converted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activity?.by_user_id) return null;

  const { data: profile } = await admin
    .from("user_profiles")
    .select("full_name, roles(name)")
    .eq("id", activity.by_user_id)
    .maybeSingle();

  const roleName = (profile?.roles as { name?: string } | null)?.name;
  if (roleName !== "admin") return null;

  const confirmRequired = ticket.ticket_require_client_confirm !== false;
  const confirmMissing = confirmRequired && !ticket.client_confirmed;
  const paymentMissing = isPaymentMissing(ticket);

  if (!confirmMissing && !paymentMissing) return null;

  return {
    by_admin: true,
    by_name: profile?.full_name ?? null,
    confirm_required_missing: confirmMissing,
    payment_missing: paymentMissing,
  };
}
