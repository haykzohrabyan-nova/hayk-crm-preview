import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/auth/require-session";

// POST /api/auth/session
//
// body: { action: "start" }
//   → inserts a new user_sessions row with signed_in_at = now()
//
// body: { action: "end", reason: "manual" | "auto" | "deactivated", user_id?: string }
//   → closes all open session rows for this user
//     sets signed_out_at = now() and sign_out_reason
//
// For "end": accepts an optional user_id in the body because the idle-timer
// fires this right before supabase.auth.signOut() — the cookie is still valid
// at that point, but we also accept body.user_id as a fallback so the admin
// client can close the row even if requireSession() somehow fails.

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action: string = body.action ?? "";
  const admin = createAdminClient();

  // For session END we accept user_id from the body (sent by IdleTimer / sidebar)
  // so the row is always closed even if the auth cookie is mid-invalidation.
  if (action === "end") {
    const reason: string = body.reason ?? "unknown";

    // Prefer the cookie-based identity; fall back to body.user_id
    let userId: string | null = body.user_id ?? null;
    if (!userId) {
      const { userId: cookieUserId } = await requireSession();
      userId = cookieUserId;
    }

    if (!userId) {
      // Cannot identify user — still return ok so sign-out proceeds
      return NextResponse.json({ ok: true, warning: "user_id unknown, session not logged" });
    }

    // Update ALL open sessions for this user (normally just one)
    const { error } = await admin
      .from("user_sessions")
      .update({
        signed_out_at: new Date().toISOString(),
        sign_out_reason: reason,
      })
      .eq("user_id", userId)
      .is("signed_out_at", null);

    if (error) {
      console.error("[session/end] update error:", error.message);
    }

    return NextResponse.json({ ok: true });
  }

  // For session START the cookie must be valid (just finished MFA)
  const { userId, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  if (action === "start") {
    // Close any stale open session first (browser crash / token expiry recovery)
    await admin
      .from("user_sessions")
      .update({ signed_out_at: new Date().toISOString(), sign_out_reason: "unknown" })
      .eq("user_id", userId!)
      .is("signed_out_at", null);

    const { error } = await admin.from("user_sessions").insert({
      user_id: userId!,
      signed_in_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[session/start] insert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
