import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { countExact } from "@/lib/utils/db-counts";

// GET /api/production/counts
// Returns tab badge counts for the /production page.

export async function GET() {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [all, balance_due] = await Promise.all([
      countExact(admin, "job_tickets", (q) => q.eq("ticket_status", "in_production")),
      countExact(admin, "job_tickets", (q) =>
        q
          .eq("ticket_status", "in_production")
          .neq("payment_status", "paid")
          .neq("ticket_payment_strategy", "net"),
      ),
    ]);

    return NextResponse.json({ counts: { all, balance_due } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
