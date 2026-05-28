import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeAuthority } from "@/lib/utils/authority";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";
import { fetchCrmCustomers, parseCrmListFilters } from "@/lib/utils/fetch-crm-data";

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const filters = parseCrmListFilters(request.nextUrl.searchParams);
  const admin = createAdminClient();

  try {
    const { rows } = await fetchCrmCustomers(admin, filters);
    return NextResponse.json({ customers: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "DB error";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
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
