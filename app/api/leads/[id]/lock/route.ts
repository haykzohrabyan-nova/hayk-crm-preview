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
    .select("locked_by_id, locked_at, customer_id")
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

  // Detect new claim vs self-refresh (same user reopening their own lead)
  const isNewClaim = !lead.locked_by_id || lead.locked_by_id !== userId;

  // Acquire (or refresh) lock. Set sdr_id only when the caller is an SDR —
  // sales users locking a lead to work it must NOT overwrite the original sdr_id
  // or the SDR loses visibility in their "Directed to Sales" scoped tab.
  await admin
    .from("leads")
    .update({
      locked_by_id: userId,
      locked_at: new Date().toISOString(),
      ...(roleName === "sdr" ? { sdr_id: userId } : {}),
    })
    .eq("id", id);

  // SDR soft-claim only — Sales uses POST /claim (lead_sales_claimed) and a temporary
  // lock while the modal is open; unlocking on close must not re-log lead_claimed on reopen.
  if (roleName === "sdr" && isNewClaim) {
    await admin.from("activities").insert({
      lead_id: id,
      customer_id: lead.customer_id,
      type: "lead_claimed",
      by_user_id: userId,
      payload: {},
    });
  }

  return NextResponse.json({ locked: true, locked_by: null });
}
