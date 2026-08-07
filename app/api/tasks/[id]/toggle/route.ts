// POST /api/tasks/[id]/toggle — flip a task's done state.
// If done_at is null → mark done (now); otherwise clear it (reopen).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { createAzatClient } from "@/lib/azat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const deny = await requirePageAccess(userId!, roleName, "/tasks");
  if (deny) return deny;

  const { id } = await params;
  const db = createAzatClient();

  const { data: existing, error: readErr } = await db
    .from("tasks")
    .select("id, done_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const nextDoneAt = (existing as { done_at: string | null }).done_at ? null : new Date().toISOString();

  const { data, error } = await db
    .from("tasks")
    .update({ done_at: nextDoneAt })
    .eq("id", id)
    .select("id, done_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: (data as { id: string }).id, done_at: (data as { done_at: string | null }).done_at });
}
