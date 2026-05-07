import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { digitsOnly } from "@/lib/utils/phone";

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const { searchParams } = request.nextUrl;
  const phone = searchParams.get("phone")?.trim() ?? "";
  const email = searchParams.get("email")?.trim() ?? "";

  if (!phone && !email) {
    return NextResponse.json(
      { error: "Provide phone or email.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let query = admin.from("customers").select("*");

  if (phone) {
    // Phone takes priority — lookup by digits-only stored value
    query = query.eq("phone", digitsOnly(phone));
  } else {
    query = query.ilike("email", email);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ customers: data ?? [], count: data?.length ?? 0 });
}
