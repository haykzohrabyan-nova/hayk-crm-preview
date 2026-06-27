import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeAuthority } from "@/lib/utils/authority";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";
import { validateLeadInterestsPayload } from "@/lib/utils/validate-lead-product-interests";

export async function POST(request: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "sdr" && roleName !== "admin") {
    Sentry.logger.warn("POST /api/leads/manual: role not allowed", { userId, roleName });
    return NextResponse.json({ error: "Forbidden.", code: "FORBIDDEN" }, { status: 403 });
  }

  const pageDeny = await requirePageAccess(userId!, roleName, "/leads");
  if (pageDeny) return pageDeny;

  const body = await request.json().catch(() => ({}));
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

  if (website != null && String(website).trim()) {
    const websiteErr = validateWebsite(String(website));
    if (websiteErr) {
      return NextResponse.json({ error: websiteErr, code: "VALIDATION_ERROR" }, { status: 400 });
    }
  }

  const interestsErr = validateLeadInterestsPayload(interests, quantities, has_design);
  if (interestsErr) {
    return NextResponse.json({ error: interestsErr, code: "VALIDATION_ERROR" }, { status: 400 });
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
        website: website ? normalizeWebsite(String(website)) : null,
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
      interests: interests ?? {},
      quantities: quantities ?? {},
      has_design: has_design ?? {},
      created_by_id: userId,
    })
    .select("*, customer:customers(*)")
    .single();

  if (lErr) {
    Sentry.logger.error("POST /api/leads/manual: DB insert failed", { userId, roleName, error: lErr.message });
    return NextResponse.json({ error: lErr.message, code: "DB_ERROR" }, { status: 500 });
  }

  Sentry.logger.info("POST /api/leads/manual: lead created", { leadId: lead.id, userId, roleName, source });

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
