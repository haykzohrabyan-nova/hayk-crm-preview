import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: lead, error: fetchErr } = await admin
    .from("leads")
    .select("locked_by_id")
    .eq("id", id)
    .single();

  if (fetchErr || !lead) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Not locked at all — idempotent success
  if (!lead.locked_by_id) {
    return NextResponse.json({ unlocked: true });
  }

  // Only the lock holder or admin can unlock
  if (lead.locked_by_id !== userId && roleName !== "admin") {
    return NextResponse.json(
      { error: "You are not the lock holder.", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  await admin
    .from("leads")
    .update({ locked_by_id: null, locked_at: null })
    .eq("id", id);

  return NextResponse.json({ unlocked: true });
}
