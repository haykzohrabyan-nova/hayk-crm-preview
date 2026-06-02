import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";
import { checkTicketDetailPageAccess } from "@/lib/auth/require-page-access";
import { getTicketFormBootstrapPayload } from "@/lib/utils/ticket-form-bootstrap-server-cache";

/** GET /api/ticket-form-bootstrap — company + lookups + products (cached server-side). */
export async function GET() {
  const session = await requireSession();
  if (session.errorResponse) return session.errorResponse;

  const pageDeny = checkTicketDetailPageAccess(
    session.allowedRoutes,
    session.roleName,
  );
  if (pageDeny) return pageDeny;

  try {
    const admin = createAdminClient();
    const payload = await getTicketFormBootstrapPayload(admin);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load form bootstrap.";
    return NextResponse.json({ error: message, code: "DB_ERROR" }, { status: 500 });
  }
}
