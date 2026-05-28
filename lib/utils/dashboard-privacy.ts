import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMemberMetrics } from "@/lib/utils/team-dashboard-metrics";

export const DASHBOARD_VALUES_HIDDEN_LABEL = "Hidden";

export async function getDashboardValuesHidden(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("user_profiles")
    .select("dashboard_values_hidden")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.dashboard_values_hidden);
}

export async function setDashboardValuesHidden(
  admin: SupabaseClient,
  userId: string,
  hidden: boolean,
): Promise<void> {
  const { error } = await admin
    .from("user_profiles")
    .update({ dashboard_values_hidden: hidden, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw error;
}

export function redactTeamMemberMetrics(
  metrics: Record<string, TeamMemberMetrics>,
): Record<string, TeamMemberMetrics> {
  const out: Record<string, TeamMemberMetrics> = {};
  for (const id of Object.keys(metrics)) {
    out[id] = {
      handled: 0,
      routed: 0,
      rejected: 0,
      sourced_cash: 0,
      cash_collected: 0,
      released_order_value: 0,
      awaiting_collection: 0,
      pipeline_value: 0,
    };
  }
  return out;
}

/** Strip numeric session summary fields when dashboard values are hidden. */
export function redactSessionSummary<
  T extends {
    total_sessions?: number;
    auto_signouts?: number;
    total_minutes?: number;
    currently_active?: boolean;
    duration_minutes?: number | null;
    claimed_leads?: number;
  },
>(rows: T[]): T[] {
  return rows.map((row) => ({
    ...row,
    total_sessions: 0,
    auto_signouts: 0,
    total_minutes: 0,
    currently_active: false,
    ...(row.duration_minutes !== undefined ? { duration_minutes: null } : {}),
    ...(row.claimed_leads !== undefined ? { claimed_leads: 0 } : {}),
  })) as T[];
}
