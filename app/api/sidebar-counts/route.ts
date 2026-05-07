import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

/**
 * Returns action-required counts for sidebar badges, scoped to the user's role.
 * SDR    → { "/leads": N }   — Pending + Validated leads
 * Sales  → { "/sales": N }   — Ongoing sales leads
 * Admin  → { "/leads": N, "/sales": N }
 */
export async function GET() {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("user_profiles")
    .select("roles(name)")
    .eq("id", userId)
    .single();

  const roleName = (profile?.roles as unknown as { name: string } | null)?.name ?? "";
  const counts: Record<string, number> = {};

  const isSdr = roleName === "sdr" || roleName === "admin";
  const isSales = roleName === "sales" || roleName === "admin";

  const queries: Promise<void>[] = [];

  if (isSdr) {
    queries.push(
      admin
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("is_inbox", false)
        .in("status", ["Pending", "Validated"])
        .then(({ count }) => { counts["/leads"] = count ?? 0; })
    );
  }

  if (isSales) {
    queries.push(
      admin
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("is_inbox", false)
        .eq("status", "Routed to Sales")
        .eq("sales_status", "Ongoing")
        .then(({ count }) => { counts["/sales"] = count ?? 0; })
    );
  }

  await Promise.all(queries);

  return NextResponse.json({ counts });
}
