import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type InProgressActivityRole = "sales" | "sdr";

/** Most recent `lead_in_progress` activity timestamp per lead id for the given role. */
export async function fetchInProgressAtByLeadIds(
  admin: AdminClient,
  leadIds: string[],
  role: InProgressActivityRole,
): Promise<Map<string, string>> {
  if (leadIds.length === 0) return new Map();

  const { data, error } = await admin
    .from("activities")
    .select("lead_id, created_at, payload")
    .eq("type", "lead_in_progress")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const leadId = row.lead_id as string | null;
    const at = row.created_at as string | null;
    const payload = row.payload as { role?: string } | null;
    if (!leadId || !at || map.has(leadId)) continue;
    if (payload?.role !== role) continue;
    map.set(leadId, at);
  }
  return map;
}

/** Sales pipeline — rep clicked In Progress after claim. */
export async function fetchSalesInProgressAtByLeadIds(
  admin: AdminClient,
  leadIds: string[],
): Promise<Map<string, string>> {
  return fetchInProgressAtByLeadIds(admin, leadIds, "sales");
}

/** SDR workspace — rep marked lead In Progress from verify drawer. */
export async function fetchSdrInProgressAtByLeadIds(
  admin: AdminClient,
  leadIds: string[],
): Promise<Map<string, string>> {
  return fetchInProgressAtByLeadIds(admin, leadIds, "sdr");
}
