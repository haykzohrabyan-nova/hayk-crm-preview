import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Lead IDs with an explicit Route to Sales event (`lead_routed_to_sales` activity). */
export async function fetchRoutedToSalesLeadIds(
  admin: AdminClient,
  opts: { userId: string | null; roleName: string | null; adminFilterUserId?: string | null },
): Promise<string[]> {
  const { data: acts, error: actError } = await admin
    .from("activities")
    .select("lead_id")
    .eq("type", "lead_routed_to_sales");

  if (actError) throw actError;

  const activityLeadIds = [
    ...new Set(
      (acts ?? [])
        .map((row) => row.lead_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (activityLeadIds.length === 0) return [];

  let leadQuery = admin
    .from("leads")
    .select("id")
    .eq("is_inbox", false)
    .in("id", activityLeadIds);

  if (opts.roleName === "admin" && opts.adminFilterUserId) {
    leadQuery = leadQuery.eq("sdr_id", opts.adminFilterUserId);
  } else if (opts.roleName !== "admin" && opts.userId) {
    leadQuery = leadQuery.eq("sdr_id", opts.userId);
  }

  const { data: leads, error: leadError } = await leadQuery;
  if (leadError) throw leadError;

  return (leads ?? []).map((row) => row.id as string);
}

export async function countLeadsRoutedToSales(
  admin: AdminClient,
  opts: { userId: string | null; roleName: string | null; adminFilterUserId?: string | null },
): Promise<number> {
  const ids = await fetchRoutedToSalesLeadIds(admin, opts);
  return ids.length;
}

/** Most recent `lead_routed_to_sales` activity timestamp per lead id. */
export async function fetchRoutedToSalesAtByLeadIds(
  admin: AdminClient,
  leadIds: string[],
): Promise<Map<string, string>> {
  if (leadIds.length === 0) return new Map();

  const { data, error } = await admin
    .from("activities")
    .select("lead_id, created_at")
    .eq("type", "lead_routed_to_sales")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const leadId = row.lead_id as string | null;
    const at = row.created_at as string | null;
    if (!leadId || !at || map.has(leadId)) continue;
    map.set(leadId, at);
  }
  return map;
}
