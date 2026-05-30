import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireAnyPageAccess } from "@/lib/auth/require-page-access";
import { dedupeShipToAddresses } from "@/lib/utils/address";

/** GET /api/customers/[id]/shipping-addresses — distinct past ship-to addresses from tickets. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requireAnyPageAccess(userId!, roleName, ["/crm", "/quotes"]);
  if (pageDeny) return pageDeny;

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

  const { data: ticketIds } = await admin
    .from("job_tickets")
    .select("id")
    .eq("customer_id", id);

  let destinationRows: Array<{
    ship_to_line1: string | null;
    ship_to_line2: string | null;
    ship_to_city: string | null;
    ship_to_state: string | null;
    ship_to_zip: string | null;
    updated_at: string | null;
  }> = [];

  const ids = (ticketIds ?? []).map((t) => t.id);
  if (ids.length > 0) {
    const { data: fromDestTable, error: destErr } = await admin
      .from("ticket_shipping_destinations")
      .select("ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_zip, updated_at")
      .in("ticket_id", ids)
      .not("ship_to_line1", "is", null)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (destErr) {
      return NextResponse.json({ error: destErr.message, code: "DB_ERROR" }, { status: 500 });
    }
    destinationRows = fromDestTable ?? [];
  }

  return NextResponse.json({
    addresses: dedupeShipToAddresses([...(rows ?? []), ...destinationRows]),
  });
}
