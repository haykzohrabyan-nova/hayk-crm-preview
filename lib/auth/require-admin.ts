import { NextResponse } from "next/server";
import {
  requireSession,
  type RequireSessionOptions,
} from "@/lib/auth/require-session";

/**
 * Verifies the calling user is authenticated (MFA-complete) and has the admin role.
 */
export async function requireAdmin(
  options?: RequireSessionOptions,
): Promise<
  | { userId: string; errorResponse: null }
  | { userId: null; errorResponse: NextResponse }
> {
  const { userId, roleName, errorResponse } = await requireSession(options);
  if (errorResponse) {
    return { userId: null, errorResponse };
  }

  if (roleName !== "admin") {
    return {
      userId: null,
      errorResponse: NextResponse.json(
        { error: "Admin access required.", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }

  return { userId: userId!, errorResponse: null };
}
