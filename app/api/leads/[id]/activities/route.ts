import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireLeadApiPageAccess } from "@/lib/auth/require-page-access";
import { canReadLead } from "@/lib/utils/lead-access";

/**
 * GET /api/leads/[id]/activities
 * Returns the full activity timeline for a lead, newest first.
 * Each row includes the acting user's full_name via a join on user_profiles.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireLeadApiPageAccess(userId!, roleName);
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const admin = createAdminClient();

  // Verify the caller has access to this lead before returning its activities.
  const { data: lead } = await admin
    .from("leads")
    .select("status, sales_status, sdr_id, sales_owner_id, locked_by_id, prev_status")
    .eq("id", id)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (!canReadLead(lead, userId, roleName)) {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("activities")
    .select("*, by_user:user_profiles!activities_by_user_id_fkey(id, full_name)")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ activities: data ?? [] });
}
