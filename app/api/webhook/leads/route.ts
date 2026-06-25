import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { digitsOnly } from "@/lib/utils/phone";
import { normalizeAuthority } from "@/lib/utils/authority";
import { normalizeWebsite, validateWebsite } from "@/lib/utils/website";
import { PRODUCT_INTERESTS } from "@/lib/types";

const VALID_PRODUCTS = new Set<string>(PRODUCT_INTERESTS);
const VALID_URGENCIES = new Set(["high", "medium", "low"]);

// ── Type helpers ──────────────────────────────────────────────────────────────

function isString(v: unknown): v is string { return typeof v === "string"; }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Constant-time comparison to prevent timing attacks on the secret.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// ── Error response shape ──────────────────────────────────────────────────────
// Every error includes:
//   error  — plain-English description of what went wrong
//   code   — machine-readable category
//   field  — which JSON field caused the problem (omitted for auth/JSON errors)
//   fix    — exact instruction for how to correct it

interface ErrorBody {
  error: string;
  code: string;
  field?: string;
  fix?: string;
}

function err(body: ErrorBody, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.LEAD_WEBHOOK_SECRET;
  if (!secret) {
    return err({
      error: "This webhook endpoint is not enabled.",
      code: "NOT_CONFIGURED",
      fix: "Ask the BazaarPrinting team to set LEAD_WEBHOOK_SECRET in their Vercel environment.",
    }, 503);
  }

  const incomingSecret = request.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(incomingSecret, secret)) {
    Sentry.logger.warn("POST /api/webhook/leads: invalid secret — 401", {
      hasHeader: !!request.headers.get("x-webhook-secret"),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return err({
      error: "Authentication failed — the x-webhook-secret header is missing or incorrect.",
      code: "UNAUTHORIZED",
      fix: "Add the header: x-webhook-secret: <your-secret-key>. Contact BazaarPrinting if you need the secret.",
    }, 401);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let rawBody: Record<string, unknown> = {};
  try {
    rawBody = await request.json();
  } catch {
    return err({
      error: "Request body could not be parsed as JSON.",
      code: "INVALID_JSON",
      fix: "Ensure the body is valid JSON and the Content-Type header is set to application/json.",
    }, 400);
  }

  if (!isPlainObject(rawBody)) {
    return err({
      error: "Request body must be a JSON object, not an array or primitive.",
      code: "INVALID_JSON",
      fix: "Wrap your data in a JSON object: { \"phone\": \"...\", \"first_name\": \"...\" }",
    }, 400);
  }

  const {
    first_name, last_name, email, phone, company,
    industry, website, authority, source, brand,
    urgency, interests, quantities, has_design, notes,
  } = rawBody;

  const admin = createAdminClient();

  // ── Type checks — optional string fields ─────────────────────────────────
  const optionalStringFields: Array<[string, unknown]> = [
    ["last_name", last_name], ["email", email], ["company", company],
    ["website", website], ["authority", authority], ["brand", brand],
    ["urgency", urgency], ["notes", notes],
  ];
  for (const [fieldName, value] of optionalStringFields) {
    if (value !== undefined && value !== null && !isString(value)) {
      const body: ErrorBody = {
        error: `"${fieldName}" must be a string but received ${Array.isArray(value) ? "an array" : `a ${typeof value}`}.`,
        code: "TYPE_ERROR",
        field: fieldName,
        fix: `Change "${fieldName}" to a plain string. Example: "${fieldName}": "some text"`,
      };
      await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
      return err(body, 400);
    }
  }

  // ── Type checks — object fields ───────────────────────────────────────────
  const objectFields: Array<[string, unknown, string]> = [
    ["interests",  interests,  '{ "Labels": true, "Boxes": true }'],
    ["quantities", quantities, '{ "Labels": "5000", "Boxes": "200" }'],
    ["has_design", has_design, '{ "Labels": true }'],
  ];
  for (const [fieldName, value, example] of objectFields) {
    if (value !== undefined && value !== null && !isPlainObject(value)) {
      const body: ErrorBody = {
        error: `"${fieldName}" must be a JSON object but received ${Array.isArray(value) ? "an array" : `a ${typeof value}`}.`,
        code: "TYPE_ERROR",
        field: fieldName,
        fix: `Change "${fieldName}" to a JSON object. Example: "${fieldName}": ${example}`,
      };
      await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
      return err(body, 400);
    }
  }

  // ── Type checks — interests values must be booleans ───────────────────────
  if (isPlainObject(interests)) {
    for (const [key, val] of Object.entries(interests)) {
      if (typeof val !== "boolean") {
        const body: ErrorBody = {
          error: `interests["${key}"] must be true or false but received a ${typeof val}.`,
          code: "TYPE_ERROR",
          field: `interests.${key}`,
          fix: `Use boolean true or false. Example: "interests": { "${key}": true }`,
        };
        await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
        return err(body, 400);
      }
    }
  }

  // ── Type checks — has_design values must be booleans + valid product keys ──
  if (isPlainObject(has_design)) {
    const unknownHasDesign = Object.keys(has_design).filter((k) => !VALID_PRODUCTS.has(k));
    if (unknownHasDesign.length > 0) {
      const body: ErrorBody = {
        error: `has_design contains unknown product name(s): ${unknownHasDesign.map((p) => `"${p}"`).join(", ")}.`,
        code: "VALIDATION_ERROR",
        field: "has_design",
        fix: `Product names are case-sensitive. Accepted values: ${PRODUCT_INTERESTS.join(", ")}.`,
      };
      await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
      return err(body, 400);
    }
    for (const [key, val] of Object.entries(has_design)) {
      if (typeof val !== "boolean") {
        const body: ErrorBody = {
          error: `has_design["${key}"] must be true or false but received a ${typeof val}.`,
          code: "TYPE_ERROR",
          field: `has_design.${key}`,
          fix: `Use boolean true or false. Example: "has_design": { "${key}": true }`,
        };
        await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
        return err(body, 400);
      }
    }
  }

  // ── Type checks — quantities values must be positive numbers ─────────────
  if (isPlainObject(quantities)) {
    for (const [key, val] of Object.entries(quantities)) {
      if (typeof val !== "string" && typeof val !== "number") {
        const body: ErrorBody = {
          error: `quantities["${key}"] must be a number or numeric string but received a ${typeof val}.`,
          code: "TYPE_ERROR",
          field: `quantities.${key}`,
          fix: `Use a positive number or string. Example: "quantities": { "${key}": "5000" }`,
        };
        await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
        return err(body, 400);
      }
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) {
        const body: ErrorBody = {
          error: `quantities["${key}"] must be a positive number but received "${val}".`,
          code: "TYPE_ERROR",
          field: `quantities.${key}`,
          fix: `Set a quantity greater than zero. Example: "quantities": { "${key}": "5000" }`,
        };
        await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
        return err(body, 400);
      }
    }
  }

  // ── Required field validation ─────────────────────────────────────────────
  if (!phone) {
    const body: ErrorBody = {
      error: "\"phone\" is required but was not provided.",
      code: "VALIDATION_ERROR",
      field: "phone",
      fix: "Add \"phone\" to your request body. Example: \"phone\": \"6265551234\"",
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  if (!isString(phone) && typeof phone !== "number") {
    const body: ErrorBody = {
      error: `"phone" must be a string or number but received a ${typeof phone}.`,
      code: "TYPE_ERROR",
      field: "phone",
      fix: "Provide phone as a string or number. Example: \"phone\": \"6265551234\"",
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  const phoneStr = String(phone).trim();
  const phoneDigits = digitsOnly(phoneStr);
  if (phoneDigits.length < 10) {
    const body: ErrorBody = {
      error: `"phone" must contain at least 10 digits but "${phoneStr}" has only ${phoneDigits.length}.`,
      code: "VALIDATION_ERROR",
      field: "phone",
      fix: "Provide a 10-digit US phone number. Example: \"6265551234\". Formatting like (626) 555-1234 is also accepted — digits are extracted automatically.",
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  if (!first_name || !isString(first_name) || !first_name.trim()) {
    const body: ErrorBody = {
      error: !first_name
        ? "\"first_name\" is required but was not provided."
        : "\"first_name\" must be a non-empty string.",
      code: "VALIDATION_ERROR",
      field: "first_name",
      fix: "Add \"first_name\" to your request body. Example: \"first_name\": \"Jane\"",
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  if (!source || !isString(source) || !source.trim()) {
    const body: ErrorBody = {
      error: !source
        ? "\"source\" is required but was not provided."
        : "\"source\" must be a non-empty string.",
      code: "VALIDATION_ERROR",
      field: "source",
      fix: "Add \"source\" to describe where the lead came from. Example: \"source\": \"website_form\"",
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  if (!industry || !isString(industry) || !industry.trim()) {
    const body: ErrorBody = {
      error: !industry
        ? "\"industry\" is required but was not provided."
        : "\"industry\" must be a non-empty string.",
      code: "VALIDATION_ERROR",
      field: "industry",
      fix: "Add \"industry\" to your request body. Example: \"industry\": \"food_beverage\"",
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  const emailStr = isString(email) ? email.trim() : "";
  if (emailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    const body: ErrorBody = {
      error: `"email" value "${emailStr}" is not a valid email address.`,
      code: "VALIDATION_ERROR",
      field: "email",
      fix: "Provide a valid email address. Example: \"email\": \"jane@acmecorp.com\"",
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  if (isString(website) && website.trim()) {
    const websiteErr = validateWebsite(website.trim());
    if (websiteErr) {
      const body: ErrorBody = {
        error: `"website" value "${website.trim()}" is not valid: ${websiteErr}`,
        code: "VALIDATION_ERROR",
        field: "website",
        fix: "Provide a full URL starting with https://. Example: \"website\": \"https://acmecorp.com\"",
      };
      await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
      return err(body, 400);
    }
  }

  const urgencyStr = isString(urgency) ? urgency.trim().toLowerCase() : null;
  if (urgency !== undefined && urgency !== null && (!isString(urgency) || (urgencyStr && !VALID_URGENCIES.has(urgencyStr)))) {
    const body: ErrorBody = {
      error: `"urgency" value "${urgency}" is not valid.`,
      code: "VALIDATION_ERROR",
      field: "urgency",
      fix: `"urgency" must be one of: "High", "Medium", "Low" (case-insensitive). Remove it entirely to leave urgency unset.`,
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  const resolvedPhone = phoneDigits;

  // ── Validate product names ────────────────────────────────────────────────
  if (isPlainObject(interests)) {
    const unknownProducts = Object.keys(interests).filter((k) => !VALID_PRODUCTS.has(k));
    if (unknownProducts.length > 0) {
      const body: ErrorBody = {
        error: `interests contains unknown product name(s): ${unknownProducts.map((p) => `"${p}"`).join(", ")}.`,
        code: "VALIDATION_ERROR",
        field: "interests",
        fix: `Product names are case-sensitive. Accepted values: ${PRODUCT_INTERESTS.join(", ")}.`,
      };
      await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
      return err(body, 400);
    }

    for (const [key, enabled] of Object.entries(interests)) {
      if (!enabled) continue;
      const qty = isPlainObject(quantities) ? Number(quantities[key]) : NaN;
      if (!Number.isFinite(qty) || qty <= 0) {
        const body: ErrorBody = {
          error: `interests["${key}"] is set to true but quantities["${key}"] is missing or zero.`,
          code: "VALIDATION_ERROR",
          field: `quantities.${key}`,
          fix: `Add a quantity for every selected product. Example: "quantities": { "${key}": "5000" }`,
        };
        await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
        return err(body, 400);
      }
    }
  }

  if (isPlainObject(quantities)) {
    const interestKeys = isPlainObject(interests) ? new Set(Object.keys(interests)) : new Set<string>();
    const orphanQty = Object.keys(quantities).filter((k) => !interestKeys.has(k));
    if (orphanQty.length > 0) {
      const body: ErrorBody = {
        error: `quantities contains key(s) with no matching entry in interests: ${orphanQty.map((k) => `"${k}"`).join(", ")}.`,
        code: "VALIDATION_ERROR",
        field: "quantities",
        fix: `Every key in quantities must also appear in interests. Add ${orphanQty.map((k) => `interests["${k}"] = true`).join(", ")} or remove the orphan quantity key(s).`,
      };
      await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
      return err(body, 400);
    }
  }

  if (isPlainObject(has_design)) {
    const interestKeys = isPlainObject(interests) ? new Set(Object.keys(interests)) : new Set<string>();
    const orphanHasDesign = Object.keys(has_design).filter((k) => !interestKeys.has(k));
    if (orphanHasDesign.length > 0) {
      const body: ErrorBody = {
        error: `has_design contains key(s) with no matching entry in interests: ${orphanHasDesign.map((k) => `"${k}"`).join(", ")}.`,
        code: "VALIDATION_ERROR",
        field: "has_design",
        fix: `Every key in has_design must also appear in interests. Add ${orphanHasDesign.map((k) => `interests["${k}"] = true`).join(", ")} or remove the orphan has_design key(s).`,
      };
      await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
      return err(body, 400);
    }
  }

  // ── Q3: Validate source and industry against lookup_values table ─────────
  const { data: sourceLookups } = await admin
    .from("lookup_values")
    .select("value")
    .eq("category", "source")
    .eq("is_active", true);

  const validSources = new Set((sourceLookups ?? []).map((r: { value: string }) => r.value));
  if (validSources.size > 0 && !validSources.has(source.trim())) {
    const accepted = [...validSources].join(", ");
    const body: ErrorBody = {
      error: `"source" value "${source.trim()}" is not a recognised slug.`,
      code: "VALIDATION_ERROR",
      field: "source",
      fix: `Send one of the accepted source slugs: ${accepted}.`,
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  const { data: industryLookups } = await admin
    .from("lookup_values")
    .select("value")
    .eq("category", "industry")
    .eq("is_active", true);

  const validIndustries = new Set((industryLookups ?? []).map((r: { value: string }) => r.value));
  if (validIndustries.size > 0 && !validIndustries.has(industry.trim())) {
    const accepted = [...validIndustries].join(", ");
    const body: ErrorBody = {
      error: `"industry" value "${industry.trim()}" is not a recognised slug.`,
      code: "VALIDATION_ERROR",
      field: "industry",
      fix: `Send one of the accepted industry slugs: ${accepted}.`,
    };
    await logRequest(admin, "failed", 400, body.error, rawBody, null, null);
    return err(body, 400);
  }

  // ── Q1: Dedup — reject if multiple customers share the same phone ─────────
  let resolvedCustomerId: string | null = null;
  let isReturning = false;

  const { data: existingByPhone, count: phoneMatchCount } = await admin
    .from("customers")
    .select("id", { count: "exact" })
    .eq("phone", resolvedPhone);

  if (phoneMatchCount && phoneMatchCount > 1) {
    const body: ErrorBody = {
      error: `Duplicate phone number — ${phoneMatchCount} customers in the CRM share the phone number "${phoneStr}".`,
      code: "DUPLICATE_CUSTOMER",
      field: "phone",
      fix: "Merge the duplicate customer records in the CRM (CRM → customer profile → Merge), then resubmit this lead.",
    };
    await logRequest(admin, "failed", 409, body.error, rawBody, null, null);
    return err(body, 409);
  }

  if (phoneMatchCount === 1 && existingByPhone?.[0]) {
    resolvedCustomerId = existingByPhone[0].id;
    isReturning = true;
  } else if (emailStr) {
    const { data: existingByEmail } = await admin
      .from("customers")
      .select("id")
      .eq("email", emailStr)
      .limit(1)
      .maybeSingle();
    if (existingByEmail) {
      resolvedCustomerId = existingByEmail.id;
      isReturning = true;
    }
  }

  // ── Create customer if not found ──────────────────────────────────────────
  if (!resolvedCustomerId) {
    const { data: newCustomer, error: cErr } = await admin
      .from("customers")
      .insert({
        first_name: first_name.trim(),
        last_name: isString(last_name) ? last_name.trim() || null : null,
        email: emailStr || null,
        phone: resolvedPhone,
        company: isString(company) ? company.trim() || null : null,
        industry: industry.trim(),
        website: isString(website) && website.trim() ? normalizeWebsite(website.trim()) : null,
        authority: normalizeAuthority(isString(authority) ? authority : undefined),
      })
      .select("id")
      .single();

    if (cErr) {
      await logRequest(admin, "failed", 500, cErr.message, rawBody, null, null);
      return err({ error: "Database error while creating customer.", code: "DB_ERROR", fix: "Contact BazaarPrinting support with your request payload." }, 500);
    }
    resolvedCustomerId = newCustomer.id;
  }

  // ── Normalise urgency ─────────────────────────────────────────────────────
  const resolvedUrgency = urgencyStr && VALID_URGENCIES.has(urgencyStr)
    ? (urgencyStr.charAt(0).toUpperCase() + urgencyStr.slice(1) as "High" | "Medium" | "Low")
    : null;

  // ── Insert lead ───────────────────────────────────────────────────────────
  const { data: lead, error: lErr } = await admin
    .from("leads")
    .insert({
      customer_id: resolvedCustomerId,
      source: source.trim(),
      brand: isString(brand) ? brand.trim() || null : null,
      urgency: resolvedUrgency,
      is_inbox: false,
      status: "Pending",
      is_returning_customer: isReturning,
      sdr_comment: isString(notes) ? notes.trim() || null : null,
      interests: isPlainObject(interests) ? interests : {},
      quantities: isPlainObject(quantities) ? quantities : {},
      has_design: isPlainObject(has_design) ? has_design : {},
    })
    .select("id")
    .single();

  if (lErr) {
    await logRequest(admin, "failed", 500, lErr.message, rawBody, null, resolvedCustomerId);
    return err({ error: "Database error while creating lead.", code: "DB_ERROR", fix: "Contact BazaarPrinting support with your request payload." }, 500);
  }

  // ── Log activity ──────────────────────────────────────────────────────────
  await admin.from("activities").insert({
    lead_id: lead.id,
    customer_id: resolvedCustomerId,
    type: "lead_webhook_created",
    payload: { source: source.trim(), is_returning_customer: isReturning },
  });

  // ── Log to webhook_lead_log ───────────────────────────────────────────────
  await logRequest(admin, "accepted", 201, null, rawBody, lead.id, resolvedCustomerId);

  Sentry.logger.info("POST /api/webhook/leads: lead accepted", {
    leadId: lead.id,
    customerId: resolvedCustomerId,
    status: isReturning ? "deduplicated" : "created",
    source: source.trim(),
    phone: phoneDigits.slice(0, 6) + "xxxx",
  });

  return NextResponse.json(
    {
      ok: true,
      lead_id: lead.id,
      customer_id: resolvedCustomerId,
      status: isReturning ? "deduplicated" : "created",
    },
    { status: 201 }
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function logRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  status: "accepted" | "failed",
  httpStatus: number,
  errorMessage: string | null,
  rawPayload: Record<string, unknown>,
  leadId: string | null,
  customerId: string | null
): Promise<void> {
  await admin.from("webhook_lead_log").insert({
    status,
    http_status: httpStatus,
    error_message: errorMessage,
    raw_payload: rawPayload,
    lead_id: leadId,
    customer_id: customerId,
  });
}
