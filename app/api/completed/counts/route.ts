import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

// GET /api/completed/counts
// Returns total count of completed orders for sidebar badge.

export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { count, error } = await admin
    .from("job_tickets")
    .select("id", { count: "exact", head: true })
    .eq("ticket_status", "completed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ counts: { completed: count ?? 0 } });
}
