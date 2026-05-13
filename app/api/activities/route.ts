import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

/**
 * GET /api/activities
 *
 * Query params:
 *   lead_id=xxx              → activities for a lead
 *   ticket_id=xxx            → activities for a ticket
 *   ticket_id=xxx&include_linked_lead=true
 *                            → full lifetime: ticket activities + linked lead's activities,
 *                              merged and sorted by time (oldest → newest).
 *                              Each row gets an extra `_source` field: "lead" | "ticket".
 *
 * Returns activities newest first (unless include_linked_lead, which keeps chronological
 * order so the full journey reads top-to-bottom, oldest first).
 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { searchParams } = request.nextUrl;
  const leadId = searchParams.get("lead_id");
  const ticketId = searchParams.get("ticket_id");
  const includeLinkedLead = searchParams.get("include_linked_lead") === "true";

  if (!leadId && !ticketId) {
    return NextResponse.json(
      { error: "lead_id or ticket_id is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const SELECT = "*, by_user:user_profiles!activities_by_user_id_fkey(id, full_name)";

  // ── Simple single-source fetch ────────────────────────────────────────────
  if (!includeLinkedLead) {
    let query = admin
      .from("activities")
      .select(SELECT)
      .order("created_at", { ascending: false });

    if (leadId) query = query.eq("lead_id", leadId);
    if (ticketId) query = query.eq("ticket_id", ticketId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
    return NextResponse.json({ activities: data ?? [] });
  }

  // ── Combined lifetime fetch (ticket + its linked lead) ────────────────────
  // 1. Find the linked_lead_id for this ticket
  const { data: ticket, error: tErr } = await admin
    .from("job_tickets")
    .select("id, linked_lead_id, title, reference_code, ticket_kind")
    .eq("id", ticketId!)
    .single();

  if (tErr || !ticket) {
    return NextResponse.json({ error: "Ticket not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // 2. Fetch ticket activities + lead activities in parallel
  const promises: Promise<{ data: unknown[] | null; error: unknown }>[] = [
    Promise.resolve(
      admin
        .from("activities")
        .select(SELECT)
        .eq("ticket_id", ticketId!)
    ).then((r) => ({ data: r.data, error: r.error })),
  ];

  if (ticket.linked_lead_id) {
    promises.push(
      Promise.resolve(
        admin
          .from("activities")
          .select(SELECT)
          .eq("lead_id", ticket.linked_lead_id)
          .is("ticket_id", null)           // only lead-only activities (not ticket ones already fetched above)
      ).then((r) => ({ data: r.data, error: r.error }))
    );
  }

  const results = await Promise.all(promises);

  for (const r of results) {
    if (r.error) return NextResponse.json({ error: (r.error as { message: string }).message, code: "DB_ERROR" }, { status: 500 });
  }

  type ActivityRow = Record<string, unknown>;

  const ticketActivities: ActivityRow[] = ((results[0].data ?? []) as ActivityRow[]).map((a) => ({
    ...a,
    _source: "ticket",
  }));

  const leadActivities: ActivityRow[] = ticket.linked_lead_id
    ? ((results[1]?.data ?? []) as ActivityRow[]).map((a) => ({
        ...a,
        _source: "lead",
      }))
    : [];

  // 3. Merge and sort oldest → newest (full journey readable top-to-bottom)
  const merged = [...leadActivities, ...ticketActivities].sort(
    (a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
  );

  return NextResponse.json({
    activities: merged,
    ticket_meta: {
      id: ticket.id,
      title: ticket.title,
      reference_code: ticket.reference_code,
      ticket_kind: ticket.ticket_kind,
      linked_lead_id: ticket.linked_lead_id,
    },
  });
}
