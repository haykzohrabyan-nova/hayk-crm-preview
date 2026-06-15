import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getDashboardValuesHidden,
  redactSessionSummary,
} from "@/lib/utils/dashboard-privacy";

// GET /api/admin/sessions
//
// Query params:
//   ?user_id=<uuid>   — filter to a specific user (optional)
//   ?from=<ISO date>  — start of date range (default: 7 days ago)
//   ?to=<ISO date>    — end of date range   (default: now)
//   ?limit=<n>        — page size (default 100, max 500)
//   ?offset=<n>       — pagination offset (default 0)
//
// Returns:
//   { sessions, total, summary }
//
//   summary: per-user aggregate for the requested period
//     { user_id, full_name, role_name, total_sessions, auto_signouts,
//       total_minutes, last_signed_in_at, currently_active }

export async function GET(request: Request) {
  const { userId, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const admin = createAdminClient();
  const valuesHidden = await getDashboardValuesHidden(admin, userId!);

  const { searchParams } = new URL(request.url);
  const filterUserId = searchParams.get("user_id") ?? null;
  const limitParam = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const offsetParam = parseInt(searchParams.get("offset") ?? "0");

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? now.toISOString();

  // ── Step 1: fetch raw sessions (no join — user_sessions → auth.users → user_profiles
  //    has no direct FK so PostgREST can't auto-join them) ────────────────────

  let sessionsQuery = admin
    .from("user_sessions")
    .select("id, user_id, signed_in_at, signed_out_at, sign_out_reason", { count: "exact" })
    .gte("signed_in_at", from)
    .lte("signed_in_at", to)
    .order("signed_in_at", { ascending: false })
    .range(offsetParam, offsetParam + limitParam - 1);

  if (filterUserId) sessionsQuery = sessionsQuery.eq("user_id", filterUserId);

  const { data: rawSessions, count, error: sessErr } = await sessionsQuery;
  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

  // For summary aggregation — all rows in range (no pagination)
  let allQuery = admin
    .from("user_sessions")
    .select("user_id, signed_in_at, signed_out_at, sign_out_reason")
    .gte("signed_in_at", from)
    .lte("signed_in_at", to);

  if (filterUserId) allQuery = allQuery.eq("user_id", filterUserId);

  const { data: allRaw } = await allQuery;

  // ── Step 2: fetch user profiles for all distinct user_ids ─────────────────
  const allUserIds = [...new Set((allRaw ?? []).map((s) => s.user_id))];

  const profileMap = new Map<
    string,
    { full_name: string | null; role_name: string | null; role_display_name: string | null }
  >();

  if (allUserIds.length > 0) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, full_name, roles(name, display_name)")
      .in("id", allUserIds);

    for (const p of profiles ?? []) {
      const roles = p.roles as unknown as { name: string; display_name: string } | null;
      profileMap.set(p.id, {
        full_name: p.full_name ?? null,
        role_name: roles?.name ?? null,
        role_display_name: roles?.display_name ?? null,
      });
    }
  }

  // ── Step 3: build per-user summary ───────────────────────────────────────
  const userMap = new Map<
    string,
    {
      user_id: string;
      full_name: string | null;
      role_name: string | null;
      role_display_name: string | null;
      total_sessions: number;
      auto_signouts: number;
      total_minutes: number;
      last_signed_in_at: string | null;
      currently_active: boolean;
    }
  >();

  for (const s of allRaw ?? []) {
    const uid = s.user_id;
    const prof = profileMap.get(uid) ?? { full_name: null, role_name: null, role_display_name: null };

    if (!userMap.has(uid)) {
      userMap.set(uid, {
        user_id: uid,
        ...prof,
        total_sessions: 0,
        auto_signouts: 0,
        total_minutes: 0,
        last_signed_in_at: null,
        currently_active: false,
      });
    }

    const entry = userMap.get(uid)!;
    entry.total_sessions++;
    if (s.sign_out_reason === "auto") entry.auto_signouts++;

    if (s.signed_out_at) {
      const mins = (new Date(s.signed_out_at).getTime() - new Date(s.signed_in_at).getTime()) / 60000;
      if (mins > 0) entry.total_minutes += mins;
    } else {
      const mins = (Date.now() - new Date(s.signed_in_at).getTime()) / 60000;
      if (mins > 0) entry.total_minutes += mins;
      entry.currently_active = true;
    }

    if (!entry.last_signed_in_at || s.signed_in_at > entry.last_signed_in_at) {
      entry.last_signed_in_at = s.signed_in_at;
    }
  }

  // Overlay currently-active status from any open session, regardless of date range.
  // This handles the case where a user has been continuously logged in for > 7 days —
  // their open session row (signed_out_at IS NULL) won't appear in the date-range query.
  const { data: openSessions } = await admin
    .from("user_sessions")
    .select("user_id")
    .is("signed_out_at", null);

  for (const s of openSessions ?? []) {
    const entry = userMap.get(s.user_id);
    if (entry) {
      entry.currently_active = true;
    } else {
      // User has an open session but no activity in the date window — still show them as active.
      // Fetch their profile if not already loaded.
      let prof = profileMap.get(s.user_id);
      if (!prof) {
        const { data: p } = await admin
          .from("user_profiles")
          .select("id, full_name, roles(name, display_name)")
          .eq("id", s.user_id)
          .single();
        if (p) {
          const roles = p.roles as unknown as { name: string; display_name: string } | null;
          prof = { full_name: p.full_name ?? null, role_name: roles?.name ?? null, role_display_name: roles?.display_name ?? null };
          profileMap.set(s.user_id, prof);
        }
      }
      userMap.set(s.user_id, {
        user_id: s.user_id,
        ...(prof ?? { full_name: null, role_name: null, role_display_name: null }),
        total_sessions: 0,
        auto_signouts: 0,
        total_minutes: 0,
        last_signed_in_at: null,
        currently_active: true,
      });
    }
  }

  const summary = Array.from(userMap.values()).sort(
    (a, b) => (b.last_signed_in_at ?? "").localeCompare(a.last_signed_in_at ?? "")
  );

  // ── Step 4: shape the paginated sessions list ─────────────────────────────
  const shaped = (rawSessions ?? []).map((s) => {
    const prof = profileMap.get(s.user_id) ?? { full_name: null, role_name: null, role_display_name: null };
    return {
      id: s.id,
      user_id: s.user_id,
      ...prof,
      signed_in_at: s.signed_in_at,
      signed_out_at: s.signed_out_at ?? null,
      sign_out_reason: s.sign_out_reason ?? null,
      duration_minutes: s.signed_out_at
        ? Math.round(
            (new Date(s.signed_out_at).getTime() - new Date(s.signed_in_at).getTime()) / 60000
          )
        : null,
    };
  });

  return NextResponse.json({
    values_hidden: valuesHidden,
    sessions: valuesHidden ? redactSessionSummary(shaped) : shaped,
    total: valuesHidden ? 0 : (count ?? 0),
    summary: valuesHidden ? redactSessionSummary(summary) : summary,
  });
}
