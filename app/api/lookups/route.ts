import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const raw = request.nextUrl.searchParams.get("categories") ?? "";
  const categoryList = raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (!categoryList.length) {
    return NextResponse.json(
      { error: "At least one category required.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lookup_values")
    .select("id, category, value, label, sort_order")
    .in("category", categoryList)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, code: "DB_ERROR" }, { status: 500 });
  }

  const result: Record<string, { id: string; value: string; label: string; sort_order: number }[]> = {};
  for (const item of data ?? []) {
    if (!result[item.category]) result[item.category] = [];
    result[item.category].push(item);
  }

  return NextResponse.json(result);
}
