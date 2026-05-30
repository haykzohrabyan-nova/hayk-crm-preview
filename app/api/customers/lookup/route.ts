import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { digitsOnly } from "@/lib/utils/phone";

export async function GET(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/crm");
  if (pageDeny) return pageDeny;

  const { searchParams } = request.nextUrl;
  const phone = searchParams.get("phone")?.trim() ?? "";
  const email = searchParams.get("email")?.trim() ?? "";

  if (!phone && !email) {
    return NextResponse.json(
      { error: "Provide phone or email.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let query = admin.from("customers").select("*");

  if (phone) {
    // Phone takes priority — lookup by digits-only stored value
    query = query.eq("phone", digitsOnly(phone));
  } else {
    query = query.ilike("email", email);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  const customers = data ?? [];
  if (customers.length === 0) {
    return NextResponse.json({ customers: [], count: 0 });
  }

  const customerIds = customers.map((c) => c.id);

  const [{ data: leads }, { data: tickets }] = await Promise.all([
    admin
      .from("leads")
      .select("customer_id, source, created_at")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false }),
    admin
      .from("job_tickets")
      .select("customer_id, quote_source, created_at")
      .in("customer_id", customerIds)
      .not("quote_source", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  type Hint = { source: string | null; at: string };
  const hints = new Map<string, Hint>();

  for (const lead of leads ?? []) {
    if (!lead.customer_id || hints.has(lead.customer_id)) continue;
    hints.set(lead.customer_id, {
      source: lead.source ?? null,
      at: lead.created_at,
    });
  }

  for (const ticket of tickets ?? []) {
    if (!ticket.customer_id || !ticket.quote_source) continue;
    const existing = hints.get(ticket.customer_id);
    if (!existing || ticket.created_at > existing.at) {
      hints.set(ticket.customer_id, {
        source: ticket.quote_source,
        at: ticket.created_at,
      });
    }
  }

  const enriched = customers.map((c) => {
    const hint = hints.get(c.id);
    return {
      ...c,
      latest_source: hint?.source ?? null,
    };
  });

  return NextResponse.json({ customers: enriched, count: enriched.length });
}
