import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { requireTicketDetailPageAccess } from "@/lib/auth/require-page-access";
import { fetchLookupCategories } from "@/lib/utils/fetch-lookup-categories";
import { fetchProductsCatalog } from "@/lib/utils/fetch-products-catalog";
import { fetchTicketDetailPayload } from "@/lib/utils/fetch-ticket-detail";

type Params = { params: Promise<{ id: string }> };

const EDIT_LOOKUP_CATEGORIES = [
  "lamination",
  "color_mode",
  "sides",
  "roll_direction",
  "finishing",
  "ticket_priority",
  "quote_channel",
  "ticket_payment",
  "follow_up_freq",
] as const;

const ACTION_LOOKUP_CATEGORIES = [
  "quote_cancel_reason",
  "order_cancel_reason",
  "payment_refund_reason",
] as const;

const PUBLIC_SETTINGS_SELECT =
  "default_tax_rate, high_value_threshold, rush_surcharge_percent, session_idle_timeout_minutes";

/** GET /api/tickets/[id]/page-data — ticket + company + lookups + products in one auth pass. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const pageDeny = await requireTicketDetailPageAccess(userId, roleName);
  if (pageDeny) return pageDeny;

  const admin = createAdminClient();
  const detail = await fetchTicketDetailPayload(admin, rawId, userId!, roleName);

  if (!detail.ok) {
    const status = detail.code === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(
      { error: detail.code === "FORBIDDEN" ? "Forbidden." : "Ticket not found.", code: detail.code },
      { status },
    );
  }

  const [companyRes, editLookups, actionLookups, products] = await Promise.all([
    admin.from("company_settings").select(PUBLIC_SETTINGS_SELECT).eq("id", 1).single(),
    fetchLookupCategories(admin, [...EDIT_LOOKUP_CATEGORIES]),
    fetchLookupCategories(admin, [...ACTION_LOOKUP_CATEGORIES]),
    fetchProductsCatalog(admin),
  ]);

  if (companyRes.error) {
    return NextResponse.json({ error: companyRes.error.message, code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({
    ticket: detail.ticket,
    company: { settings: companyRes.data },
    lookups_edit: editLookups,
    lookups_actions: actionLookups,
    products,
  });
}
