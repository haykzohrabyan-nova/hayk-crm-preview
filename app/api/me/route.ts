import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { resolveNavPagesForUser } from "@/lib/auth/resolve-nav-pages";

/** GET /api/me — session identity + nav pages for layout (server-validated). */
export async function GET() {
  const session = await requireSession();
  if (session.errorResponse) return session.errorResponse;

  const pages = await resolveNavPagesForUser(
    session.userId,
    session.roleName,
    session.roleId,
  );

  return NextResponse.json({
    userId: session.userId,
    roleName: session.roleName,
    fullName: session.fullName,
    allowedRoutes: session.allowedRoutes,
    actionGrants: session.actionGrants,
    pages,
  });
}
