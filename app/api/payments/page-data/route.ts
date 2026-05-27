import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { fetchPaymentsPageData } from "@/lib/utils/fetch-payments-data";

/** GET /api/payments/page-data — pending + approved payment evidence lists and tab counts. */
export async function GET() {
  const { roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (roleName !== "accountant" && roleName !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();

  try {
    const pageData = await fetchPaymentsPageData(admin);
    return NextResponse.json(pageData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load payments data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
