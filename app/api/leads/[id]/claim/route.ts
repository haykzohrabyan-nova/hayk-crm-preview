import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { canClaimLead } from "@/lib/utils/lead-access";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "sales" && roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const pageDeny = await requirePageAccess(userId!, roleName, "/sales");
  if (pageDeny) return pageDeny;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: current } = await admin
    .from("leads")
    .select("sales_owner_id, status, sales_status, customer_id")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Lead not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  if (!canClaimLead(current, roleName)) {
    return NextResponse.json(
      { error: "This lead is not available to claim.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  // Atomic claim: only succeeds if sales_owner_id is still null at write time.
  // Prevents a double-claim race where two reps both pass the canClaimLead check
  // before either write commits — last write would silently overwrite the first.
  const { data: lead, error } = await admin
    .from("leads")
    .update({
      sales_owner_id: userId,
      sales_status: "Ongoing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("sales_owner_id", null)
    .select("*, customer:customers(*)")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  if (!lead) {
    return NextResponse.json(
      { error: "Lead is already claimed.", code: "ALREADY_CLAIMED" },
      { status: 409 }
    );
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
