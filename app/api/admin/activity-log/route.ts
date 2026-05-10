import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

// Human-readable labels for every activity type logged by the system
const ACTION_LABELS: Record<string, string> = {
  lead_routed_to_sales: "Routed lead to Sales",
  lead_status_changed: "Changed lead status",
  lead_edited: "Edited lead",
  lead_rejected: "Rejected lead",
  lead_held: "Put lead on hold",
  lead_resumed: "Resumed lead",
  lead_sales_claimed: "Claimed lead",
  lead_claimed: "Claimed lead",
  lead_manual_created: "Created lead manually",
  lead_reassigned: "Reassigned lead",
  customer_merged: "Merged customer records",
};

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const { searchParams } = request.nextUrl;
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
  const typeFilter = searchParams.get("type") ?? "";

  // Fetch paginated activities with customer context
  let query = admin
    .from("activities")
    .select(
      `id, type, channel, payload, created_at, by_user_id,
       customer:customers(first_name, last_name, company)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (typeFilter) {
    query = query.eq("type", typeFilter);
  }

  const { data: activities, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  if (!activities || activities.length === 0) {
    return NextResponse.json({ activities: [], total: count ?? 0 });
  }

  // Fetch user profiles for all actors (activities.by_user_id = user_profiles.id)
  const userIds = [...new Set(activities.map((a) => a.by_user_id).filter(Boolean))] as string[];
  const { data: profiles } = await admin
    .from("user_profiles_with_role")
    .select("id, full_name, role_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  // Enrich activities with actor name, role, and human-readable label
  const enriched = activities.map((a) => ({
    id: a.id,
    type: a.type,
    label: ACTION_LABELS[a.type] ?? a.type,
    channel: a.channel,
    payload: a.payload,
    created_at: a.created_at,
    actor: a.by_user_id ? (profileMap.get(a.by_user_id) ?? null) : null,
    customer: a.customer,
  }));

  return NextResponse.json({ activities: enriched, total: count ?? 0 });
}
