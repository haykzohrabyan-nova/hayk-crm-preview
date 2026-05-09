import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const counts: Record<string, number> = {};

  // ── Sidebar badge counts — disabled until confirmed with owner ────────────
  // Uncomment the block below to re-enable badges.
  //
  // const isSdr = roleName === "sdr" || roleName === "admin";
  //
  // await Promise.all([
  //   // /leads badge — SDR workspace: leads waiting to be worked
  //   isSdr
  //     ? admin
  //         .from("leads")
  //         .select("*", { count: "exact", head: true })
  //         .eq("is_inbox", false)
  //         .in("status", ["Pending", "Validated"])
  //         .then(({ count }) => { counts["/leads"] = count ?? 0; })
  //     : Promise.resolve(),
  //
  //   // /sales badge — Sales Pipeline
  //   // Sales rep: unclaimed leads (available to grab) + their own active deals
  //   // Admin: total active deals across all reps
  //   roleName === "sales"
  //     ? Promise.all([
  //         admin
  //           .from("leads")
  //           .select("*", { count: "exact", head: true })
  //           .eq("is_inbox", false)
  //           .eq("status", "Routed to Sales")
  //           .is("sales_owner_id", null),
  //         admin
  //           .from("leads")
  //           .select("*", { count: "exact", head: true })
  //           .eq("is_inbox", false)
  //           .eq("status", "Routed to Sales")
  //           .eq("sales_owner_id", userId)
  //           .in("sales_status", ["Ongoing", "Quote Sent"]),
  //       ]).then(([unclaimed, myActive]) => {
  //         counts["/sales"] = (unclaimed.count ?? 0) + (myActive.count ?? 0);
  //       })
  //     : roleName === "admin"
  //     ? admin
  //         .from("leads")
  //         .select("*", { count: "exact", head: true })
  //         .eq("is_inbox", false)
  //         .eq("status", "Routed to Sales")
  //         .in("sales_status", ["Ongoing", "Quote Sent"])
  //         .then(({ count }) => { counts["/sales"] = count ?? 0; })
  //     : Promise.resolve(),
  // ]);

  void userId;
  void roleName;
  void admin;

  return NextResponse.json({ counts });
}
