import { createAdminClient } from "@/lib/supabase/admin";

/** Mark linked lead Won when its ticket is released to production (SDR credit). */
export async function markLinkedLeadWonOnProduction(
  admin: ReturnType<typeof createAdminClient>,
  linkedLeadId: string | null | undefined,
  now: string = new Date().toISOString(),
): Promise<void> {
  if (!linkedLeadId) return;

  await admin
    .from("leads")
    .update({ sales_status: "Won", updated_at: now })
    .eq("id", linkedLeadId)
    .neq("sales_status", "Won");
}
