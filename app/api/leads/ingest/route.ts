// Lead-intake ingest endpoint (azat schema).
//   POST /api/leads/ingest
//   body: { source, source_id, channel, name?, email?, phone?, company?, message?, subject? }
//
// This is the single front door for an inbound from ANY channel. It does two things:
//
//   1. ROUTE — hands the raw inbound to the intake brain that already lives in the DB,
//      azat.crm_ingest_lead(...). That function dedupes by (source, source_id) and
//      decides where the inbound belongs:
//        • known customer (email/phone match) -> writes an azat.account_messages row
//          and tags the comm to that contact's owner        -> status 'account_message'
//        • known company (email domain / company name match) -> new contact + a WARM
//          lead auto-assigned to that company's deal owner   -> status 'warm_lead'
//        • brand-new                                          -> contact + a team-queue
//          lead with no owner                                 -> status 'team_lead_new'
//                                                                       | 'team_lead_known'
//
//   2. AUTO-TASK / AUTO-DEAL — layers the promise engine on top of the routing so an
//      inbound never slips, IDEMPOTENTLY via azat.engine_provenance (keyed on the
//      comm_event id + a per-purpose marker, so re-POSTing the same inbound is a no-op):
//        • warm_lead      -> ensure a +24h follow-up task on the assigned rep (adopts
//                            the task the durable trigger already created). If the
//                            message reads like a product/quote ask (extract-actions),
//                            also open a deal (stage 'quote'/'specs') + a follow-up task.
//        • account_message-> +task on the CUSTOMER'S owner ("Answer <name> — new <channel>
//                            message") so existing-customer inbound is always actioned;
//                            product/quote ask -> also open a deal + task.
//        • team_lead_*    -> NO auto-task; it already surfaces in the Inbox to be claimed.
//
// Auth: requireSession gate (mirrors sibling routes). Writes go through the
// service-role azat-schema client (lib/azat/server.ts).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  createAzatClient,
  type AzatClient,
  commIdFor,
  provenanceMarkers,
  ensureLeadFollowupTask,
  insertTaskWithProvenance,
  insertDealWithProvenance,
  hasOpenDeal,
  parseAmountCents,
  plusHours,
} from "@/lib/azat/server";
import { extractActions } from "@/lib/ai/extract-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Channels accepted by azat.comm_channel. Anything else is rejected up front so the
// RPC never throws on an invalid enum cast.
const CHANNELS = ["email", "call", "sms", "ig_dm", "webform", "ad_lead", "walk_in"] as const;
type Channel = (typeof CHANNELS)[number];

type IngestBody = {
  source?: unknown;
  source_id?: unknown;
  channel?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  company?: unknown;
  message?: unknown;
  subject?: unknown;
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

// A short, human channel word for task labels.
function channelWord(ch: string): string {
  switch (ch) {
    case "email": return "email";
    case "sms": return "text";
    case "call": return "call";
    case "ig_dm": return "Instagram";
    case "webform": return "web form";
    case "ad_lead": return "ad lead";
    case "walk_in": return "walk-in";
    default: return "message";
  }
}

type RpcStatus = {
  status: string;
  lead?: string;
  owner?: string;
  contact?: string;
  communication?: string;
  deal?: string | null;
  [k: string]: unknown;
};

// Run extract-actions and, if it reads like a real product/quote ask, open a deal
// (+ a follow-up task on the owner). Idempotent via provenance markers.
async function maybeCreateDeal(
  db: AzatClient,
  args: {
    message: string | null;
    channel: string;
    contactId: string | null;
    orgId: string | null;
    ownerId: string | null;
    commId: string | null;
    contactName: string | null;
    markers: Set<string>;
  },
): Promise<{ dealCreated: boolean; dealTaskCreated: boolean; dealId: string | null }> {
  const out = { dealCreated: false, dealTaskCreated: false, dealId: null as string | null };
  const text = (args.message ?? "").trim();
  if (!text || !args.contactId) return out;
  if (args.markers.has("deal:ingest_deal")) return out; // already produced a deal for this inbound

  const r = await extractActions({ text, channel: args.channel, direction: "inbound", contactName: args.contactName });
  if (!r.deal?.detected) return out;
  if (await hasOpenDeal(db, args.contactId)) return out; // don't stack onto an open deal

  const dealId = await insertDealWithProvenance(
    db,
    {
      stage: r.deal.quote_promised ? "quote" : "specs",
      title: r.deal.product || r.headline,
      message: r.headline,
      valueCents: parseAmountCents(r.deal.amount),
      contactId: args.contactId,
      orgId: args.orgId,
      ownerId: args.ownerId,
      sourceChannel: args.channel,
    },
    args.commId,
  );
  out.dealCreated = Boolean(dealId);
  out.dealId = dealId;

  if (dealId && !args.markers.has("task:ingest_deal_task")) {
    const taskLabel =
      r.deal.quote_promised
        ? `Send quote — ${r.deal.product || args.contactName || "new deal"}`
        : `Work up specs — ${r.deal.product || args.contactName || "new deal"}`;
    const taskId = await insertTaskWithProvenance(
      db,
      {
        kind: "followup",
        label: taskLabel.slice(0, 140),
        dueAt: plusHours(24),
        ownerId: args.ownerId,
        contactId: args.contactId,
        dealId,
      },
      args.commId,
      "ingest_deal_task",
    );
    out.dealTaskCreated = Boolean(taskId);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const { errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const source = str(body.source);
  const sourceId = str(body.source_id);
  const channelRaw = str(body.channel);
  if (!source || !sourceId || !channelRaw) {
    return NextResponse.json(
      { error: "source, source_id and channel are required." },
      { status: 400 },
    );
  }
  if (!(CHANNELS as readonly string[]).includes(channelRaw)) {
    return NextResponse.json(
      { error: `channel must be one of: ${CHANNELS.join(", ")}` },
      { status: 400 },
    );
  }
  const channel = channelRaw as Channel;

  const name = str(body.name);
  const email = str(body.email);
  const phone = str(body.phone);
  const company = str(body.company);
  const message = str(body.message);
  const subject = str(body.subject);

  const db = createAzatClient();

  try {
    // ── 1. Route through the intake brain (already in the DB). ──────────────────
    const { data, error } = await db.rpc("crm_ingest_lead", {
      p_source: source,
      p_source_id: sourceId,
      p_channel: channel,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_company: company,
      p_message: message,
      p_has_design: {},
      p_subject: subject,
    });
    if (error) {
      return NextResponse.json({ error: `ingest failed: ${error.message}` }, { status: 500 });
    }
    const routed = (data ?? {}) as RpcStatus;
    const status = routed.status ?? "unknown";

    // Auto-task/deal only for live routings. Duplicates + suppressed/review just echo.
    const auto = {
      lead_followup_task: false,
      account_answer_task: false,
      deal_created: false,
      deal_task_created: false,
      deal_id: null as string | null,
    };

    if (status === "warm_lead" || status === "account_message") {
      const commId = routed.communication ?? (await commIdFor(db, source, sourceId));
      const markers = commId ? await provenanceMarkers(db, commId) : new Set<string>();

      if (status === "warm_lead" && routed.lead && routed.owner) {
        // Lead row carries the contact + org for labelling and deal linkage.
        const { data: lead } = await db
          .from("leads")
          .select("contact_id, organization_id, owner_id")
          .eq("id", routed.lead)
          .maybeSingle();
        const leadRow = lead as
          | { contact_id: string | null; organization_id: string | null; owner_id: string | null }
          | null;
        const contactId = leadRow?.contact_id ?? null;
        const orgId = leadRow?.organization_id ?? null;
        const who = name || company || null;

        if (!markers.has("task:ingest_lead_followup")) {
          const res = await ensureLeadFollowupTask(
            db,
            {
              leadId: routed.lead,
              contactId,
              ownerId: routed.owner,
              label: `Follow up new lead${who ? ` — ${who}` : ""}`.slice(0, 140),
              dueAt: plusHours(24),
            },
            commId,
            "ingest_lead_followup",
          );
          auto.lead_followup_task = Boolean(res.id);
        }

        const deal = await maybeCreateDeal(db, {
          message,
          channel,
          contactId,
          orgId,
          ownerId: routed.owner,
          commId,
          contactName: name,
          markers,
        });
        auto.deal_created = deal.dealCreated;
        auto.deal_task_created = deal.dealTaskCreated;
        auto.deal_id = deal.dealId;
      }

      if (status === "account_message") {
        // The account_messages row holds the customer's owner + linkage.
        const { data: am } = await db
          .from("account_messages")
          .select("contact_id, org_id, owner_id, deal_id")
          .eq("comm_event_id", commId)
          .maybeSingle();
        const amRow = am as
          | { contact_id: string | null; org_id: string | null; owner_id: string | null; deal_id: string | null }
          | null;
        const ownerId = amRow?.owner_id ?? null;
        const contactId = amRow?.contact_id ?? routed.contact ?? null;
        const orgId = amRow?.org_id ?? null;

        // Answer task on the customer's owner (skip if the customer has no owner).
        if (ownerId && !markers.has("task:ingest_answer")) {
          const taskId = await insertTaskWithProvenance(
            db,
            {
              kind: "followup",
              label: `Answer ${name ?? "customer"} — new ${channelWord(channel)} message`.slice(0, 140),
              dueAt: plusHours(24),
              ownerId,
              contactId,
            },
            commId,
            "ingest_answer",
          );
          auto.account_answer_task = Boolean(taskId);
        }

        const deal = await maybeCreateDeal(db, {
          message,
          channel,
          contactId,
          orgId,
          ownerId,
          commId,
          contactName: name,
          markers,
        });
        auto.deal_created = deal.dealCreated;
        auto.deal_task_created = deal.dealTaskCreated;
        auto.deal_id = deal.dealId;
      }

      return NextResponse.json({ ...routed, auto });
    }

    // team_lead_new | team_lead_known | duplicate | internal_identity_suppressed |
    // identity_review | existing_contact_logged | unknown — return the routing verdict as-is.
    return NextResponse.json({ ...routed, auto });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
