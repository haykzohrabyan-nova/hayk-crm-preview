import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

// PATCH /api/admin/lookups/[id] — update label, sort_order, or is_active
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  // Only allow safe fields — value (slug) is immutable after creation
  const patch: Record<string, unknown> = {};
  if (body.label   !== undefined) patch.label      = body.label;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
  if (body.is_active  !== undefined) patch.is_active  = body.is_active;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("lookup_values")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// DELETE /api/admin/lookups/[id]
// Blocked if any lead or ticket already uses this value (safety check)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const { id } = await params;

  // Fetch the row so we know category + value
  const { data: row, error: fetchErr } = await admin
    .from("lookup_values")
    .select("category, value")
    .eq("id", id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Option not found" }, { status: 404 });
  }

  // Check if any lead references this value
  const leadFieldMap: Record<string, string> = {
    source:           "source",
    industry:         "industry",
    urgency:          "urgency",
    hold_reason:      "hold_reason",
    reject_reason:    "rejection_reason",
    route_reason:     "route_reason",
    sales_drop_reason:"sales_drop_reason",
  };

  const leadField = leadFieldMap[row.category];
  if (leadField) {
    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq(leadField, row.value);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${count} lead(s) use this value. Deactivate it instead.` },
        { status: 409 }
      );
    }
  }

  // Check if any ticket references this value in quote_skus or direct columns
  const ticketFieldMap: Record<string, string> = {
    lamination:      "lamination",
    ticket_priority: "priority",
    order_source:    "order_source",
    quote_channel:   "quote_channel",
    follow_up_freq:  "follow_up_frequency",
  };

  const ticketField = ticketFieldMap[row.category];
  if (ticketField) {
    const { count } = await admin
      .from("job_tickets")
      .select("id", { count: "exact", head: true })
      .eq(ticketField, row.value);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${count} ticket(s) use this value. Deactivate it instead.` },
        { status: 409 }
      );
    }
  }

  const { error } = await admin.from("lookup_values").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
