import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { countExact } from "@/lib/utils/db-counts";
import { countLeadsWonViaSalesRoute } from "@/lib/utils/lead-sdr-won-filter";
import { countLeadsRoutedToSales } from "@/lib/utils/lead-routed-to-sales-query";

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  try {
    const [all, hold, routed, rejected, won] = await Promise.all([
      countExact(admin, "leads", (q) => {
        let query = q.eq("is_inbox", false).in("status", ["Pending", "Validated"]);
        if (roleName === "sdr" && userId) {
          query = query.or(`locked_by_id.is.null,locked_by_id.eq.${userId}`);
        }
        return query;
      }),
      countExact(admin, "leads", (q) => {
        let query = q.eq("is_inbox", false).eq("status", "On Hold");
        if (roleName !== "admin" && userId) {
          query = query.eq("sdr_id", userId);
        }
        return query;
      }),
      countLeadsRoutedToSales(admin, { userId, roleName }),
      countExact(admin, "leads", (q) => {
        let query = q.eq("is_inbox", false).eq("status", "Rejected");
        if (roleName !== "admin" && userId) {
          query = query.eq("sdr_id", userId);
        }
        return query;
      }),
      countLeadsWonViaSalesRoute(admin, { userId, roleName }),
    ]);

    return NextResponse.json({
      counts: { all, hold, routed, rejected, won },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Count query failed.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
