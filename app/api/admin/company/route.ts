import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/company — fetch the single company_settings row
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("company_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

// PATCH /api/admin/company — update company settings (admin only)
export async function PATCH(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  const allowed = [
    "company_name",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zip",
    "phone",
    "email",
    "website",
    "logo_url",
    "default_tax_rate",
    "high_value_threshold",
    "rush_surcharge_percent",
    "session_idle_timeout_minutes",
  ];

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("company_settings")
    .update(patch)
    .eq("id", 1)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}
