import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";

export async function POST() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const deny = await requirePageAccess(userId!, roleName, "/admin");
  if (deny) return deny;

  const admin = createAdminClient();

  const { error } = await admin
    .from("webhook_lead_log")
    .update({ raw_payload: null })
    .not("raw_payload", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
