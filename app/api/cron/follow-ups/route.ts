import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueQuoteFollowUps } from "@/lib/utils/process-due-follow-ups";

/**
 * Vercel Cron — automated quote follow-up reminders.
 *
 * Schedule: see `vercel.json` (default daily 2pm UTC).
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (set in Vercel env vars).
 *
 * Manual test (local):
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/follow-ups
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured.", code: "CONFIG_ERROR" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized.", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const result = await processDueQuoteFollowUps(admin);

    console.info("[cron/follow-ups]", result);

    return NextResponse.json({
      ok: true,
      ...result,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/follow-ups] failed:", message);
    return NextResponse.json({ error: message, code: "CRON_ERROR" }, { status: 500 });
  }
}
