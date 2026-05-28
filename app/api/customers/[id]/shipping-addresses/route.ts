import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { dedupeShipToAddresses } from "@/lib/utils/address";

/** GET /api/customers/[id]/shipping-addresses — distinct past ship-to addresses from tickets. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (customerErr) {
    return NextResponse.json({ error: customerErr.message, code: "DB_ERROR" }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "Customer not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: rows, error } = await admin
    .from("job_tickets")
    .select("ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_zip, updated_at")
    .eq("customer_id", id)
    .eq("requires_shipping", true)
    .not("ship_to_line1", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({
    addresses: dedupeShipToAddresses(rows ?? []),
  });
}
