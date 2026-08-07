// Unassigned intake actions (azat schema).
//  POST /api/inbox/assign
//    body: { commId?, leadId?, ownerId?, action?: "assign" | "convert",
//            title?, summary?, contactId?, orgId?, channel? }
//
//  action "assign" (default) — reuses the promote-engine task-insert style:
//    inserts an azat.tasks row (kind 'followup') owned by the chosen rep, linked
//    to the item's contact/lead. Also CLAIMS the item so it leaves the queue:
//    sets owner_id on the lead (leadId) or on the linked contact (commId), but
//    ONLY when currently null (additive — never steals an existing owner).
//
//  action "convert" — reuses the promote-engine deal-insert style: inserts an
//    azat.deals row (stage 'specs') owned by the chosen rep for the item's
//    contact, then claims the item the same way. Requires a contact.
//
// If ownerId is omitted it falls back to the least-loaded rep, exactly like
// /api/tasks and promote-actions.
//
// Auth: requireSession + requirePageAccess("/inbox"). Service-role azat client.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import {
  createAzatClient,
  fetchRepLoad,
  leastLoadedRep,
  repName,
  REPS,
  type AzatClient,
} from "@/lib/azat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_OWNER = new Set(REPS.map((r) => r.id));

type Body = {
  commId?: string;
  leadId?: string;
  ownerId?: string | null;
  action?: "assign" | "convert";
  title?: string;
  summary?: string;
  contactId?: string | null;
  orgId?: string | null;
  channel?: string | null;
};

// Resolve the item's contact/lead/org context from whichever id was provided.
async function loadContext(db: AzatClient, body: Body) {
  if (body.leadId) {
    const { data } = await db
      .from("leads")
      .select("id, contact_id, organization_id, channel, source, message")
      .eq("id", body.leadId)
      .maybeSingle();
    const l = data as
      | { id: string; contact_id: string | null; organization_id: string | null; channel: string | null; source: string | null; message: string | null }
      | null;
    return {
      leadId: body.leadId,
      commId: null as string | null,
      contactId: body.contactId ?? l?.contact_id ?? null,
      orgId: body.orgId ?? l?.organization_id ?? null,
      channel: body.channel ?? l?.channel ?? l?.source ?? null,
      title: body.title ?? (l?.message ? l.message.slice(0, 200) : "Lead follow-up"),
    };
  }
  if (body.commId) {
    const { data } = await db
      .from("comm_events")
      .select("id, contact_id, org_id, channel, subject")
      .eq("id", body.commId)
      .maybeSingle();
    const c = data as
      | { id: string; contact_id: string | null; org_id: string | null; channel: string | null; subject: string | null }
      | null;
    return {
      leadId: null as string | null,
      commId: body.commId,
      contactId: body.contactId ?? c?.contact_id ?? null,
      orgId: body.orgId ?? c?.org_id ?? null,
      channel: body.channel ?? c?.channel ?? null,
      title: body.title ?? (c?.subject ? c.subject.slice(0, 200) : "Inbound follow-up"),
    };
  }
  return null;
}

// Additive claim: stamp owner on the lead (or the comm's contact) if it's null.
async function claim(db: AzatClient, ctx: { leadId: string | null; contactId: string | null }, owner: string) {
  if (ctx.leadId) {
    await db.from("leads").update({ owner_id: owner, claimed_at: new Date().toISOString() }).eq("id", ctx.leadId).is("owner_id", null);
  } else if (ctx.contactId) {
    await db.from("contacts").update({ owner_id: owner }).eq("id", ctx.contactId).is("owner_id", null);
  }
}

export async function POST(req: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const deny = await requirePageAccess(userId!, roleName, "/inbox");
  if (deny) return deny;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  if (!body.commId && !body.leadId) {
    return NextResponse.json({ error: "commId or leadId is required." }, { status: 400 });
  }
  const action = body.action === "convert" ? "convert" : "assign";

  const db = createAzatClient();

  const ctx = await loadContext(db, body);
  if (!ctx) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  // Resolve owner: explicit valid rep, else least-loaded.
  let owner = body.ownerId && VALID_OWNER.has(body.ownerId) ? body.ownerId : null;
  if (!owner) {
    const load = await fetchRepLoad(db);
    owner = leastLoadedRep(load);
  }

  try {
    if (action === "convert") {
      if (!ctx.contactId) {
        return NextResponse.json({ error: "Cannot convert to a deal without a contact." }, { status: 400 });
      }
      const { data, error } = await db
        .from("deals")
        .insert({
          stage: "specs",
          title: (body.title ?? ctx.title).slice(0, 200),
          message: body.summary ?? null,
          value_cents: 0,
          contact_id: ctx.contactId,
          org_id: ctx.orgId,
          owner_id: owner,
          source: "inbox",
          source_channel: ctx.channel,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await claim(db, ctx, owner);
      return NextResponse.json({
        ok: true,
        action,
        deal_id: (data as { id: string }).id,
        owner_id: owner,
        owner_name: repName(owner),
      });
    }

    // action === "assign" → create a followup task owned by the rep.
    const insertRow = {
      kind: "followup",
      label: ctx.title,
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      owner_id: owner,
      contact_id: ctx.contactId,
      lead_id: ctx.leadId,
      deal_id: null as string | null,
    };
    const { data, error } = await db.from("tasks").insert(insertRow).select("id").single();
    if (error) throw new Error(error.message);
    await claim(db, ctx, owner);
    return NextResponse.json({
      ok: true,
      action,
      task_id: (data as { id: string }).id,
      owner_id: owner,
      owner_name: repName(owner),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
