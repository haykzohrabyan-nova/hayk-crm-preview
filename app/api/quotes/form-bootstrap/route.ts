import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { fetchLookupCategories } from "@/lib/utils/fetch-lookup-categories";
import { fetchProductsCatalog } from "@/lib/utils/fetch-products-catalog";

const QUOTE_LOOKUP_CATEGORIES = [
  "lamination",
  "color_mode",
  "sides",
  "roll_direction",
  "finishing",
  "ticket_priority",
  "quote_channel",
  "ticket_payment",
  "follow_up_freq",
  "source",
  "industry",
  "route_reason",
] as const;

const PUBLIC_SETTINGS_SELECT =
  "default_tax_rate, high_value_threshold, rush_surcharge_percent, session_idle_timeout_minutes";

/** GET /api/quotes/form-bootstrap — company + products + lookups for /quotes/new in one auth pass. */
export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  const pageDeny = await requirePageAccess(userId!, roleName, "/quotes/new");
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();

  try {
    const [companyRes, lookups, products] = await Promise.all([
      admin.from("company_settings").select(PUBLIC_SETTINGS_SELECT).eq("id", 1).single(),
      fetchLookupCategories(admin, [...QUOTE_LOOKUP_CATEGORIES]),
      fetchProductsCatalog(admin),
    ]);

    if (companyRes.error) throw companyRes.error;

    return NextResponse.json({
      company: { settings: companyRes.data },
      lookups,
      products,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load form data.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
