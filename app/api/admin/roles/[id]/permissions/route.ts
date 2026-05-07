import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id: role_id } = await params;
  const { page_id } = await request.json();

  if (!page_id) {
    return NextResponse.json({ error: "page_id is required.", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("role_permissions")
    .upsert({ role_id, page_id }, { onConflict: "role_id,page_id" });

  if (error) return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });

  return NextResponse.json({ success: true });
}
