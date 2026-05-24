import type { createAdminClient } from "@/lib/supabase/admin";

export type ManualConvertMeta = {
  by_admin: boolean;
  by_name: string | null;
  confirm_required_missing: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

/** Admin manual convert while customer confirmation was still required. */
export async function fetchManualConvertMeta(
  admin: AdminClient,
  ticketId: string,
  ticket: {
    ticket_status: string;
    client_confirmed?: boolean | null;
    ticket_require_client_confirm?: boolean | null;
  },
): Promise<ManualConvertMeta | null> {
  if (ticket.ticket_status !== "order" || ticket.client_confirmed) {
    return null;
  }

  if (ticket.ticket_require_client_confirm === false) {
    return null;
  }

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

  return {
    by_admin: true,
    by_name: profile?.full_name ?? null,
    confirm_required_missing: true,
  };
}
