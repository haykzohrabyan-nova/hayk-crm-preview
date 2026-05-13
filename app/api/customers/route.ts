import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { digitsOnly } from "@/lib/utils/phone";

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("*, leads(id, status, sales_status, updated_at), job_tickets(id, ticket_status, created_at)")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  type LeadRow = { id: string; status: string; sales_status: string | null; updated_at: string };
  type TicketRow = { id: string; ticket_status: string; created_at: string };

  // Show customers that either:
  // 1. Have a lead routed to Sales (came through the SDR pipeline), OR
  // 2. Have at least one quote/order ticket (created directly from New Quote)
  let customers = (data ?? [])
    .filter((c) =>
      (c.leads ?? []).some(
        (l: LeadRow) => l.status === "Routed" || l.sales_status != null
      ) ||
      (c.job_tickets ?? []).length > 0
    )
    .map((c) => {
      const leads = (c.leads ?? []) as LeadRow[];
      const tickets = (c.job_tickets ?? []) as TicketRow[];
      const lead_count = leads.length;
      const ticket_count = tickets.length;
      const lastLeadActivity = leads.reduce(
        (latest, l) => (l.updated_at > latest ? l.updated_at : latest),
        c.updated_at as string
      );
      const lastTicketActivity = tickets.reduce(
        (latest, t) => (t.created_at > latest ? t.created_at : latest),
        c.updated_at as string
      );
      const last_activity = lastLeadActivity > lastTicketActivity ? lastLeadActivity : lastTicketActivity;
      const customer_status = lead_count === 0 && ticket_count === 0 ? "new" : "known";
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { leads: _leads, job_tickets: _tickets, ...rest } = c;
      return { ...rest, lead_count, ticket_count, last_activity, customer_status };
    });

  if (search) {
    customers = customers.filter(
      (c) =>
        c.first_name?.toLowerCase().includes(search) ||
        c.last_name?.toLowerCase().includes(search) ||
        c.email?.toLowerCase().includes(search) ||
        c.phone?.includes(search) ||
        c.company?.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ customers });
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const body = await request.json();
  const { first_name, last_name, email, phone, company, industry, website } = body;

  if (!phone) {
    return NextResponse.json(
      { error: "Phone is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
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
      website: website ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ customer: data }, { status: 201 });
}
