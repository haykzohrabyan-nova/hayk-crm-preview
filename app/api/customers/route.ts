import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeAuthority } from "@/lib/utils/authority";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";

const CUSTOMER_LIST_SELECT =
  "id, first_name, last_name, email, phone, company, industry, heat_tag, created_at, updated_at";

type LeadAggRow = {
  customer_id: string;
  status: string;
  sales_status: string | null;
  updated_at: string;
};

type TicketAggRow = {
  customer_id: string;
  created_at: string;
};

function leadQualifiesForCrm(l: LeadAggRow): boolean {
  return l.sales_status != null || l.status === "Routed to Sales";
}

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";

  const admin = createAdminClient();

  const [{ data: leadRows, error: leadErr }, { data: ticketRows, error: ticketErr }, { data: customers, error: customerErr }] =
    await Promise.all([
      admin.from("leads").select("customer_id, status, sales_status, updated_at").not("customer_id", "is", null),
      admin.from("job_tickets").select("customer_id, created_at").not("customer_id", "is", null),
      admin.from("customers").select(CUSTOMER_LIST_SELECT).order("updated_at", { ascending: false }),
    ]);

  if (leadErr || ticketErr || customerErr) {
    return NextResponse.json(
      { error: leadErr?.message ?? ticketErr?.message ?? customerErr?.message ?? "DB error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const aggByCustomer = new Map<
    string,
    { lead_count: number; ticket_count: number; last_activity: string; qualifies: boolean }
  >();

  for (const row of (leadRows ?? []) as LeadAggRow[]) {
    const id = row.customer_id;
    const cur = aggByCustomer.get(id) ?? {
      lead_count: 0,
      ticket_count: 0,
      last_activity: row.updated_at,
      qualifies: false,
    };
    cur.lead_count += 1;
    if (row.updated_at > cur.last_activity) cur.last_activity = row.updated_at;
    if (leadQualifiesForCrm(row)) cur.qualifies = true;
    aggByCustomer.set(id, cur);
  }

  for (const row of (ticketRows ?? []) as TicketAggRow[]) {
    const id = row.customer_id;
    const cur = aggByCustomer.get(id) ?? {
      lead_count: 0,
      ticket_count: 0,
      last_activity: row.created_at,
      qualifies: false,
    };
    cur.ticket_count += 1;
    if (row.created_at > cur.last_activity) cur.last_activity = row.created_at;
    cur.qualifies = true;
    aggByCustomer.set(id, cur);
  }

  let result = (customers ?? [])
    .filter((c) => {
      const agg = aggByCustomer.get(c.id);
      // Include customers with no leads/tickets yet (e.g. added from CRM) and qualifying CRM rows.
      return !agg || agg.qualifies;
    })
    .map((c) => {
      const agg = aggByCustomer.get(c.id)!;
      const customer_status =
        agg.lead_count === 0 && agg.ticket_count === 0 ? "new" : "known";
      return {
        ...c,
        lead_count: agg.lead_count,
        ticket_count: agg.ticket_count,
        last_activity:
          agg.last_activity > (c.updated_at as string) ? agg.last_activity : (c.updated_at as string),
        customer_status,
      };
    });

  if (search) {
    result = result.filter(
      (c) =>
        c.first_name?.toLowerCase().includes(search) ||
        c.last_name?.toLowerCase().includes(search) ||
        c.email?.toLowerCase().includes(search) ||
        c.phone?.includes(search) ||
        c.company?.toLowerCase().includes(search),
    );
  }

  return NextResponse.json({ customers: result });
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({}));
  const { first_name, last_name, email, phone, company, industry, website, authority } = body;

  if (!phone) {
    return NextResponse.json(
      { error: "Phone is required.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  if (website != null && String(website).trim()) {
    const websiteErr = validateWebsite(String(website));
    if (websiteErr) {
      return NextResponse.json({ error: websiteErr, code: "VALIDATION_ERROR" }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .insert({
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      email: email ?? null,
      phone: digitsOnly(phone),
      company: company ?? null,
      industry: industry ?? null,
      website: website ? normalizeWebsite(String(website)) : null,
      authority: normalizeAuthority(authority),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ customer: data }, { status: 201 });
}
