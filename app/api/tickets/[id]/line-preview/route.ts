import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { checkTicketDetailPageAccess } from "@/lib/auth/require-page-access";
import { fetchTicketLinePreview } from "@/lib/utils/fetch-ticket-line-preview";

type Params = { params: Promise<{ id: string }> };

/** GET /api/tickets/[id]/line-preview — line items for list quick preview (slim DB reads). */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const session = await requireSession();
  if (session.errorResponse) return session.errorResponse;
  const pageDeny = checkTicketDetailPageAccess(session.allowedRoutes, session.roleName);
  if (pageDeny) return pageDeny;
  const { userId, roleName } = session;

  const admin = createAdminClient();
  const result = await fetchTicketLinePreview(admin, rawId, userId!, roleName);

  if (!result.ok) {
    const status = result.code === "FORBIDDEN" ? 403 : 404;
    return NextResponse.json(
      {
        error: result.code === "FORBIDDEN" ? "Forbidden." : "Ticket not found.",
        code: result.code,
      },
      { status },
    );
  }

  return NextResponse.json(result.data);
}
