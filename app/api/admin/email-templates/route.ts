import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  EMAIL_TEMPLATE_DEFINITIONS,
  defaultEmailTemplatesMap,
  isEmailTemplateKey,
  type EmailTemplateKey,
} from "@/lib/integrations/email-template-catalog";
import {
  EMAIL_TEMPLATES_MIGRATION_HINT,
  isMissingEmailTemplatesTable,
} from "@/lib/integrations/email-templates-db-error";

function templatesFromDefinitions(
  byKey?: Map<string, { subject?: string | null; body?: string | null; cta_label?: string | null; updated_at?: string | null }>,
) {
  const defaults = defaultEmailTemplatesMap();
  return EMAIL_TEMPLATE_DEFINITIONS.map((def) => {
    const row = byKey?.get(def.key);
    const subject = row?.subject?.trim() || defaults[def.key].subject;
    const body = row?.body?.trim() || defaults[def.key].body;
    const ctaLabel = row?.cta_label?.trim() || defaults[def.key].ctaLabel;
    return {
      ...def,
      subject,
      body,
      ctaLabel,
      updated_at: row?.updated_at ?? null,
      isCustom: Boolean(
        row &&
          (subject !== def.defaultSubject ||
            body !== def.defaultBody ||
            ctaLabel !== def.defaultCtaLabel),
      ),
    };
  });
}

/** GET /api/admin/email-templates */
export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("email_templates")
    .select("template_key, subject, body, cta_label, updated_at");

  if (error && isMissingEmailTemplatesTable(error)) {
    return NextResponse.json({
      templates: templatesFromDefinitions(),
      dbAvailable: false,
      migrationHint: EMAIL_TEMPLATES_MIGRATION_HINT,
    });
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map((data ?? []).map((r) => [r.template_key, r]));

  return NextResponse.json({
    templates: templatesFromDefinitions(byKey),
    dbAvailable: true,
  });
}

/** PATCH /api/admin/email-templates */
export async function PATCH(request: Request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({}));
  const updates = body.templates as
    | Record<string, { subject?: string; body?: string; ctaLabel?: string }>
    | undefined;

  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "templates object required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const rows: {
    template_key: EmailTemplateKey;
    subject: string;
    body: string;
    cta_label: string;
  }[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!isEmailTemplateKey(key)) {
      return NextResponse.json({ error: `Unknown template key: ${key}` }, { status: 400 });
    }
    const subject = String(value?.subject ?? "").trim();
    const textBody = String(value?.body ?? "").trim();
    const ctaLabel = String(value?.ctaLabel ?? "").trim();
    if (!subject) {
      return NextResponse.json({ error: `Template "${key}" subject cannot be empty.` }, { status: 400 });
    }
    if (!textBody) {
      return NextResponse.json({ error: `Template "${key}" body cannot be empty.` }, { status: 400 });
    }
    if (!ctaLabel) {
      return NextResponse.json({ error: `Template "${key}" button label cannot be empty.` }, { status: 400 });
    }
    if (subject.length > 300) {
      return NextResponse.json({ error: `Template "${key}" subject exceeds 300 characters.` }, { status: 400 });
    }
    if (textBody.length > 8000) {
      return NextResponse.json({ error: `Template "${key}" body exceeds 8000 characters.` }, { status: 400 });
    }
    rows.push({ template_key: key, subject, body: textBody, cta_label: ctaLabel });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await admin.from("email_templates").upsert(rows, { onConflict: "template_key" });

  if (error && isMissingEmailTemplatesTable(error)) {
    return NextResponse.json(
      { error: EMAIL_TEMPLATES_MIGRATION_HINT, code: "MIGRATION_REQUIRED" },
      { status: 503 },
    );
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
