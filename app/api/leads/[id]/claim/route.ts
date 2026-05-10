import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: current } = await admin
    .from("leads")
    .select("sales_owner_id, status, customer_id")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (current.sales_owner_id) {
    return NextResponse.json(
      { error: "Lead is already claimed.", code: "ALREADY_CLAIMED" },
      { status: 409 }
    );
  }

  const { data: lead, error } = await admin
    .from("leads")
    .update({
      sales_owner_id: userId,
      sales_status: "Ongoing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*, customer:customers(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  await admin.from("activities").insert({
    lead_id: id,
    customer_id: lead.customer_id,
    type: "lead_sales_claimed",
    by_user_id: userId,
    payload: {},
  });

  return NextResponse.json({ lead });
}
