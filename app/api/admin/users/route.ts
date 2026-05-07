import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const roleFilter = searchParams.get("role") ?? "";
  const showInactive = searchParams.get("is_active") === "false";

  // Fetch all profiles with role info
  let query = admin
    .from("user_profiles_with_role")
    .select("*")
    .order("created_at", { ascending: false });

  if (!showInactive) {
    query = query.eq("is_active", true);
  }
  if (roleFilter) {
    query = query.eq("role_name", roleFilter);
  }

  const { data: profiles, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  // Fetch auth users to get emails (requires admin client)
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? ""])
  );

  // Merge email into profiles
  const users = (profiles ?? []).map((p) => ({
    ...p,
    email: emailMap.get(p.id) ?? "",
  }));

  // Client-side search filter (name or email)
  const filtered = search
    ? users.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search)
      )
    : users;

  return NextResponse.json({ users: filtered });
}
