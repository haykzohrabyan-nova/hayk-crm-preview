import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

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

  await Promise.all([
    isSdr
      ? admin
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("is_inbox", false)
          .in("status", ["Pending", "Validated"])
          .then(({ count }) => { counts["/leads"] = count ?? 0; })
      : Promise.resolve(),
    isSales
      ? admin
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("is_inbox", false)
          .eq("status", "Routed to Sales")
          .eq("sales_status", "Ongoing")
          .then(({ count }) => { counts["/sales"] = count ?? 0; })
      : Promise.resolve(),
  ]);

  return NextResponse.json({ counts });
}
