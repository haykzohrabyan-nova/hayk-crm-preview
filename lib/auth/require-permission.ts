import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { hasPermission } from "@/lib/auth/has-permission";

/**
 * Server-side helper: asserts a valid session AND the given permission key.
 * Returns 401 / 403 NextResponse on failure, or the session on success.
 *
 * NOTE: During RBAC Slice 0 this is available but NOT yet wired into existing
 * route handlers. Existing roleName checks remain authoritative.
 * Call this from NEW route handlers only, or during the Slice 1+ migration.
 *
 * Usage:
 *   const result = await requirePermission("leads.claim");
 *   if (result.errorResponse) return result.errorResponse;
 *   const { session } = result;
 */
export async function requirePermission(key: string): Promise<
  | { session: Awaited<ReturnType<typeof requireSession>> & { errorResponse: null }; errorResponse: null }
  | { session: null; errorResponse: NextResponse }
> {
  const session = await requireSession();
  if (session.errorResponse) {
    return { session: null, errorResponse: session.errorResponse };
  }

  if (!hasPermission(session, key)) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        {
          error: "You do not have permission to perform this action.",
          code: "FORBIDDEN",
          requiredPermission: key,
        },
        { status: 403 },
      ),
    };
  }

  return { session: session as typeof session & { errorResponse: null }, errorResponse: null };
}
