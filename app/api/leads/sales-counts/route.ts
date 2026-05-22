import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { countExact } from "@/lib/utils/db-counts";

/**
 * Returns tab counts for the Sales Pipeline page.
 * - pipeline: Routed to Sales leads with sales_status Ongoing, Quote Sent, or null
 * - hold:     Routed to Sales leads with sales_status = 'On Hold'
 * - rejected: Leads with status = 'Rejected' AND prev_status = 'Routed to Sales'
 *
 * Sales reps only see unclaimed leads + their own (same filter as the workspace route).
 * Admins see all.
 */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  function routedCount(configure: (q: ReturnType<ReturnType<typeof admin.from>["select"]>) => ReturnType<ReturnType<typeof admin.from>["select"]>) {
    return countExact(admin, "leads", (q) => {
      let query = q.eq("is_inbox", false).eq("status", "Routed to Sales");
      if (roleName === "sales" && userId) {
        query = query.or(`sales_owner_id.is.null,sales_owner_id.eq.${userId}`);
      }
      return configure(query);
    });
  }

  try {
    const [pipeline, hold, rejected] = await Promise.all([
      routedCount((q) =>
        q.or("sales_status.eq.Ongoing,sales_status.eq.Quote Sent,sales_status.is.null"),
      ),
      routedCount((q) => q.eq("sales_status", "On Hold")),
      countExact(admin, "leads", (q) =>
        q
          .eq("is_inbox", false)
          .eq("status", "Rejected")
          .eq("prev_status", "Routed to Sales"),
      ),
    ]);

    return NextResponse.json({ counts: { pipeline, hold, rejected } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
