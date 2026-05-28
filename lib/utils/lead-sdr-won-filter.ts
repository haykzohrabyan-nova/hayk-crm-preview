import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Lead IDs with an explicit "Route to Sales" event (SDR Won tab eligibility). */
export async function leadIdsRoutedToSales(
  admin: AdminClient,
  leadIds: string[],
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();

  const { data, error } = await admin
    .from("activities")
    .select("lead_id")
    .eq("type", "lead_routed_to_sales")
    .in("lead_id", leadIds);

  if (error) throw error;

  return new Set(
    (data ?? [])
      .map((row) => row.lead_id as string | null)
      .filter((id): id is string => Boolean(id)),
  );
}

/** SDR Leads → Won tab: production Won AND routed to Sales first. */
export async function countLeadsWonViaSalesRoute(
  admin: AdminClient,
  opts: { userId: string | null; roleName: string | null; adminFilterUserId?: string | null },
): Promise<number> {
  let wonQuery = admin
    .from("leads")
    .select("id")
    .eq("is_inbox", false)
    .eq("sales_status", "Won");

  if (opts.roleName === "admin" && opts.adminFilterUserId) {
    wonQuery = wonQuery.eq("sdr_id", opts.adminFilterUserId);
  } else if (opts.roleName !== "admin" && opts.userId) {
    wonQuery = wonQuery.eq("sdr_id", opts.userId);
  }

  const { data: wonRows, error: wonError } = await wonQuery;
  if (wonError) throw wonError;

  const wonIds = (wonRows ?? []).map((row) => row.id as string);
  const routed = await leadIdsRoutedToSales(admin, wonIds);
  return routed.size;
}
