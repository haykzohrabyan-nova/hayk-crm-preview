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
    .select("locked_by_id, locked_at")
    .eq("id", id)
    .single();

  if (fetchErr || !lead) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Already locked by another user
  if (lead.locked_by_id && lead.locked_by_id !== userId && roleName !== "admin") {
    const { data: locker } = await admin
      .from("user_profiles")
      .select("id, full_name")
      .eq("id", lead.locked_by_id)
      .single();

    return NextResponse.json(
      {
        locked: false,
        locked_by: {
          id: lead.locked_by_id,
          full_name: locker?.full_name ?? "Another user",
          role: "",
        },
      },
      { status: 409 }
    );
  }

  // Acquire (or refresh) lock
  await admin
    .from("leads")
    .update({ locked_by_id: userId, locked_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ locked: true, locked_by: null });
}
