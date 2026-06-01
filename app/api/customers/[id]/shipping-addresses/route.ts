import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireAnyPageAccess } from "@/lib/auth/require-page-access";
import { scopeJobTicketsQuery, type TicketSelectQuery } from "@/lib/utils/db-counts";
import { dedupeShipToAddresses } from "@/lib/utils/address";

type ShipToRow = {
  ship_to_line1: string | null;
  ship_to_line2: string | null;
  ship_to_city: string | null;
  ship_to_state: string | null;
  ship_to_zip: string | null;
  updated_at: string | null;
};

/** GET /api/customers/[id]/shipping-addresses — ship-to addresses from tickets the user may access. */
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

  const { data: scopedIds, error: idErr } = await scopeJobTicketsQuery(
    admin
      .from("job_tickets")
      .select("id")
      .eq("customer_id", id)
      .eq("requires_shipping", true) as TicketSelectQuery,
    roleName,
    userId!,
  );

  if (idErr) {
    return NextResponse.json({ error: idErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  const ids = ((scopedIds ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) {
    return NextResponse.json({ addresses: [] });
  }

  const { data: legacyRows, error: ticketErr } = await admin
    .from("job_tickets")
    .select("ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_zip, updated_at")
    .in("id", ids)
    .not("ship_to_line1", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (ticketErr) {
    return NextResponse.json({ error: ticketErr.message, code: "DB_ERROR" }, { status: 500 });
  }

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

  const rows: ShipToRow[] = [...(legacyRows ?? []), ...(fromDestTable ?? [])];

  return NextResponse.json({
    addresses: dedupeShipToAddresses(rows),
  });
}
