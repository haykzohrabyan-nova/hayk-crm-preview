import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeAuthority } from "@/lib/utils/authority";

export async function POST(request: NextRequest) {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const body = await request.json();
  const {
    first_name,
    last_name,
    email,
    phone,
    company,
    industry,
    source,
    brand,
    website,
    authority,
    urgency,
    is_returning_customer,
    sdr_comment,
    initial_interest,
    interests,
    quantities,
    has_design,
    customer_id,
    create_customer,
  } = body;

  if (!phone) {
    return NextResponse.json(
      { error: "Phone is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }
  if (!first_name) {
    return NextResponse.json(
      { error: "First name is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }
  if (!source) {
    return NextResponse.json(
      { error: "Source is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }
  if (!industry) {
    return NextResponse.json(
      { error: "Industry is required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let resolvedCustomerId: string | null = customer_id ?? null;

  // Create a new customer record if requested
  if (!resolvedCustomerId && create_customer) {
    const { data: newCustomer, error: cErr } = await admin
      .from("customers")
      .insert({
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        email: email ?? null,
        phone: digitsOnly(phone),
        company: company ?? null,
        industry: industry ?? null,
        website: website ?? null,
        authority: normalizeAuthority(authority),
      })
      .select()
      .single();

    if (cErr) {
      return NextResponse.json({ error: cErr.message, code: "DB_ERROR" }, { status: 500 });
    }
    resolvedCustomerId = newCustomer.id;
  } else if (resolvedCustomerId && authority !== undefined) {
    await admin
      .from("customers")
      .update({
        authority: normalizeAuthority(authority),
        updated_at: new Date().toISOString(),
      })
      .eq("id", resolvedCustomerId);
  }

  const { data: lead, error: lErr } = await admin
    .from("leads")
    .insert({
      customer_id: resolvedCustomerId,
      source: source ?? null,
      brand: brand ?? null,
      urgency: (urgency && urgency !== "not_defined")
        ? urgency.charAt(0).toUpperCase() + urgency.slice(1).toLowerCase()
        : null,
      is_inbox: false,
      status: "Pending",
      sdr_id: userId,
      is_returning_customer: is_returning_customer ?? false,
      sdr_comment: sdr_comment ?? null,
      initial_interest: initial_interest ?? null,
      interests: interests ?? {},
      quantities: quantities ?? {},
      has_design: has_design ?? {},
    })
    .select("*, customer:customers(*)")
    .single();

  if (lErr) {
    return NextResponse.json({ error: lErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Log activity
  await admin.from("activities").insert({
    lead_id: lead.id,
    customer_id: resolvedCustomerId,
    type: "lead_manual_created",
    by_user_id: userId,
    payload: { source },
  });

  return NextResponse.json({ lead }, { status: 201 });
}
