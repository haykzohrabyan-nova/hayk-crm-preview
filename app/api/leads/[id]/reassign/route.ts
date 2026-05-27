import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { user_id: string | null; role?: "sdr" | "sales" };
  const newUserId = body.user_id ?? null;
  const role = body.role ?? "sdr";

  const admin = createAdminClient();

  if (role === "sales") {
    // ── Sales reassignment — updates sales_owner_id ──────────────────────────
    const { data: lead, error: fetchErr } = await admin
      .from("leads")
      .select("sales_owner_id, customer_id, sales_owner:user_profiles!leads_sales_owner_id_fkey(full_name)")
      .eq("id", id)
      .single();

    if (fetchErr || !lead) {
      return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
    }

    const currentOwnerName = (lead.sales_owner as { full_name?: string | null } | null)?.full_name ?? null;

    let newUserName: string | null = null;
    if (newUserId) {
      const { data: newUser } = await admin
        .from("user_profiles")
        .select("full_name")
        .eq("id", newUserId)
        .single();
      newUserName = newUser?.full_name ?? null;
    }

    const update = newUserId
      ? { sales_owner_id: newUserId }
      : { sales_owner_id: null };

    const { data: updated, error: updateErr } = await admin
      .from("leads")
      .update(update)
      .eq("id", id)
      .select("*, customer:customers(*), sales_owner:user_profiles!leads_sales_owner_id_fkey(id,full_name)")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
    }

    await admin.from("activities").insert({
      lead_id: id,
      customer_id: lead.customer_id,
      type: "lead_reassigned",
      by_user_id: userId,
      payload: {
        from_user_id: lead.sales_owner_id ?? null,
        from_name: currentOwnerName,
        to_user_id: newUserId,
        to_name: newUserName,
        role: "sales",
      },
    });

    return NextResponse.json({ lead: updated });
  }

  // ── SDR reassignment (default) — updates locked_by_id / sdr_id ───────────
  const { data: lead, error: fetchErr } = await admin
    .from("leads")
    .select("locked_by_id, customer_id, locked_by:user_profiles!leads_locked_by_id_fkey(full_name)")
    .eq("id", id)
    .single();

  if (fetchErr || !lead) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const currentLockerName = (lead.locked_by as { full_name?: string | null } | null)?.full_name ?? null;

  // Fetch new user's display name (only when assigning, not unassigning)
  let newUserName: string | null = null;
  if (newUserId) {
    const { data: newUser } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", newUserId)
      .single();
    newUserName = newUser?.full_name ?? null;
  }

  // Apply the reassignment or unassignment
  const update = newUserId
    ? { locked_by_id: newUserId, locked_at: new Date().toISOString(), sdr_id: newUserId }
    : { locked_by_id: null, locked_at: null, sdr_id: null };

  const { data: updated, error: updateErr } = await admin
    .from("leads")
    .update(update)
    .eq("id", id)
    .select("*, customer:customers(*), locked_by:user_profiles!leads_locked_by_id_fkey(id,full_name)")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Log the reassignment
  await admin.from("activities").insert({
    lead_id: id,
    customer_id: lead.customer_id,
    type: "lead_reassigned",
    by_user_id: userId,
    payload: {
      from_user_id: lead.locked_by_id ?? null,
      from_name: currentLockerName,
      to_user_id: newUserId,
      to_name: newUserName,
    },
  });

  return NextResponse.json({ lead: updated });
}
