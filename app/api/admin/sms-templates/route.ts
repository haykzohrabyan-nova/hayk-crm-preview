import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  SMS_TEMPLATE_DEFINITIONS,
  defaultSmsTemplatesMap,
  isSmsTemplateKey,
  type SmsTemplateKey,
} from "@/lib/integrations/sms-template-catalog";

/** GET /api/admin/sms-templates — list templates with metadata + current body */
export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const defaults = defaultSmsTemplatesMap();

  const { data, error } = await admin.from("sms_templates").select("template_key, body, updated_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map((data ?? []).map((r) => [r.template_key, r]));

  const templates = SMS_TEMPLATE_DEFINITIONS.map((def) => {
    const row = byKey.get(def.key);
    return {
      ...def,
      body: row?.body?.trim() || defaults[def.key],
      updated_at: row?.updated_at ?? null,
      isCustom: Boolean(row?.body?.trim() && row.body.trim() !== def.defaultBody),
    };
  });

  return NextResponse.json({ templates });
}

/** PATCH /api/admin/sms-templates — upsert one or more template bodies */
export async function PATCH(request: Request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({}));
  const updates = body.templates as Record<string, string> | undefined;

  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "templates object required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const rows: { template_key: SmsTemplateKey; body: string }[] = [];

  for (const [key, text] of Object.entries(updates)) {
    if (!isSmsTemplateKey(key)) {
      return NextResponse.json({ error: `Unknown template key: ${key}` }, { status: 400 });
    }
    const trimmed = String(text ?? "").trim();
    if (!trimmed) {
      return NextResponse.json({ error: `Template "${key}" cannot be empty.` }, { status: 400 });
    }
    if (trimmed.length > 1600) {
      return NextResponse.json({ error: `Template "${key}" exceeds 1600 characters.` }, { status: 400 });
    }
    rows.push({ template_key: key, body: trimmed });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await admin.from("sms_templates").upsert(rows, { onConflict: "template_key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
