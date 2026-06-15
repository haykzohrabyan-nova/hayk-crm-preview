import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getDashboardValuesHidden,
  redactSessionSummary,
} from "@/lib/utils/dashboard-privacy";

export interface TeamMember {
  id: string;
  full_name: string | null;
  role_name: string;
  role_display_name: string;
  claimed_leads: number;       // sales only; 0 for SDR/admin
  last_sign_in_at: string | null;
}

export async function GET() {
  const { userId, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const valuesHidden = await getDashboardValuesHidden(admin, userId!);

  // Fetch all active user profiles with their role (including admins)
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, full_name, is_active, roles(name, display_name)")
    .eq("is_active", true)
    .order("full_name");

  if (!profiles?.length) return NextResponse.json({ members: [] });

  // Fetch claimed lead counts per sales user in one query
  const { data: claimedRows } = await admin
    .from("leads")
    .select("sales_owner_id")
    .eq("status", "Routed to Sales")
    .in("sales_status", ["Ongoing", "Quote Sent"])
    .not("sales_owner_id", "is", null);

  const claimedMap: Record<string, number> = {};
  for (const row of claimedRows ?? []) {
    if (row.sales_owner_id) {
      claimedMap[row.sales_owner_id] = (claimedMap[row.sales_owner_id] ?? 0) + 1;
    }
  }

  // Fetch last_sign_in_at for all users from auth.admin
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const lastSignInMap: Record<string, string | null> = {};
  for (const u of authUsers?.users ?? []) {
    lastSignInMap[u.id] = u.last_sign_in_at ?? null;
  }

  const members: TeamMember[] = profiles.map((p) => {
    const role = p.roles as unknown as { name: string; display_name: string } | null;
    return {
      id: p.id,
      full_name: p.full_name,
      role_name: role?.name ?? "",
      role_display_name: role?.display_name ?? "",
      claimed_leads: claimedMap[p.id] ?? 0,
      last_sign_in_at: lastSignInMap[p.id] ?? null,
    };
  });

  const ROLE_ORDER: Record<string, number> = { admin: 0, sdr: 1, sales: 2, accountant: 3 };
  members.sort((a, b) => {
    const byRole = (ROLE_ORDER[a.role_name] ?? 99) - (ROLE_ORDER[b.role_name] ?? 99);
    if (byRole !== 0) return byRole;
    return (a.full_name ?? "").localeCompare(b.full_name ?? "", undefined, { sensitivity: "base" });
  });

  return NextResponse.json({
    values_hidden: valuesHidden,
    members: valuesHidden ? redactSessionSummary(members) : members,
  });
}
