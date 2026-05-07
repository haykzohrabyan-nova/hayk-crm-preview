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
    .select("*, leads(id, status, updated_at)")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  let customers = (data ?? []).map((c) => {
    const leads = (c.leads ?? []) as { id: string; status: string; updated_at: string }[];
    const lead_count = leads.length;
    const last_activity = leads.reduce(
      (latest, l) => (l.updated_at > latest ? l.updated_at : latest),
      c.updated_at as string
    );
    const customer_status = lead_count === 0 ? "new" : "known";
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { leads: _leads, ...rest } = c;
    return { ...rest, lead_count, last_activity, customer_status };
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
