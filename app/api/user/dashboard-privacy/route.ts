import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { getDashboardValuesHidden } from "@/lib/utils/dashboard-privacy";

export async function GET() {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const dashboard_values_hidden = await getDashboardValuesHidden(admin, userId!);

  return NextResponse.json({ dashboard_values_hidden });
}

export async function PATCH(request: Request) {
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const body = (await request.json().catch(() => ({}))) as {
    dashboard_values_hidden?: boolean;
  };

  if (typeof body.dashboard_values_hidden !== "boolean") {
    return NextResponse.json(
      { error: "dashboard_values_hidden must be a boolean." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_profiles")
    .update({
      dashboard_values_hidden: body.dashboard_values_hidden,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId!);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ dashboard_values_hidden: body.dashboard_values_hidden });
}
