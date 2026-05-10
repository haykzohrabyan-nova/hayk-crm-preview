import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

/**
 * GET /api/leads/[id]/activities
 * Returns the full activity timeline for a lead, newest first.
 * Each row includes the acting user's full_name via a join on user_profiles.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

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
