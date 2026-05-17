import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

// GET /api/admin/sessions/health
// Quick diagnostic — checks that both DB changes from migrations 056 + 057 exist.
// Admin only.

export async function GET() {
  const { roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  if (roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const results: Record<string, { ok: boolean; detail: string }> = {};

  // Check 1 — session_idle_timeout_minutes column on company_settings
  const { data: col, error: colErr } = await admin
    .from("company_settings")
    .select("session_idle_timeout_minutes")
    .eq("id", 1)
    .single();

  results.migration_056 = colErr
    ? { ok: false, detail: colErr.message }
    : { ok: true, detail: `session_idle_timeout_minutes = ${col?.session_idle_timeout_minutes}` };

  // Check 2 — user_sessions table exists (count rows, should be 0 or more)
  const { count, error: tblErr } = await admin
    .from("user_sessions")
    .select("*", { count: "exact", head: true });

  results.migration_057 = tblErr
    ? { ok: false, detail: tblErr.message }
    : { ok: true, detail: `user_sessions table exists, ${count ?? 0} rows` };

  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json({ ok: allOk, checks: results });
}
