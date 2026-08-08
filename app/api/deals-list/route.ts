// Deals list API (azat schema).
//   GET /api/deals-list
//
// Returns every azat.deals row, joined to azat.contacts (for the customer name)
// and azat.organizations (for the company), plus a derived `bucket` that groups
// the raw stage into the six kanban columns the Deals board draws:
//
//   BUCKET      RAW STAGES
//   specs       new, specs
//   quote       quote
//   approval    approval, proof
//   payment     payment
//   won         won
//   lost        lost
//
// This mirrors the deal side of app/api/pipeline/route.ts (same azat-scoped
// service-role client, same .in() contact/org resolution, same repName owner
// labels) but is a flat, stage-based grouping — no quote/payment signal
// promotion, so it reflects deals.stage directly.
//
// Auth: same requireSession + requirePageAccess gate as sibling azat routes,
// gated on the "/deals" page. Reads go through the azat-schema service client
// (lib/azat/server.ts).

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { createAzatClient, type AzatClient, repName } from "@/lib/azat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kanban buckets shared with components/deals/deals-page.tsx.
export type DealBucket = "specs" | "quote" | "approval" | "payment" | "won" | "lost";

type DealRow = {
  id: string;
  title: string | null;
  stage: string;
  value_cents: number | null;
  owner_id: string | null;
  contact_id: string | null;
  org_id: string | null;
  created_at: string | null;
  last_activity_at: string | null;
};

type ContactInfo = { name: string | null; organization_id: string | null };

// Shape returned to the client (components/deals/deals-page.tsx mirrors this).
export type DealListItem = {
  id: string;
  bucket: DealBucket;
  stage: string;
  title: string;
  value_cents: number;
  owner_id: string | null;
  owner_name: string | null;
  contact_id: string | null;
  who: string;
  company: string | null;
  created_at: string | null;
  last_activity_at: string | null;
};

/** Raw deals.stage → kanban bucket. Unknown early stages fall into specs. */
function stageBucket(stage: string): DealBucket {
  switch (stage) {
    case "won":
      return "won";
    case "lost":
      return "lost";
    case "payment":
      return "payment";
    case "approval":
    case "proof":
      return "approval";
    case "quote":
      return "quote";
    case "new":
    case "specs":
    default:
      return "specs";
  }
}

// ── Contact / org resolution (one round-trip each, .in() splits) ────────────────
async function fetchContacts(db: AzatClient, ids: string[]): Promise<Map<string, ContactInfo>> {
  const out = new Map<string, ContactInfo>();
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (!clean.length) return out;
  const { data } = await db.from("contacts").select("id, name, organization_id").in("id", clean);
  for (const c of (data ?? []) as ({ id: string } & ContactInfo)[]) {
    out.set(c.id, { name: c.name, organization_id: c.organization_id });
  }
  return out;
}

async function fetchOrgNames(db: AzatClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (!clean.length) return out;
  const { data } = await db.from("organizations").select("id, name").in("id", clean);
  for (const o of (data ?? []) as { id: string; name: string | null }[]) {
    if (o.name) out.set(o.id, o.name);
  }
  return out;
}

export async function GET() {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const deny = await requirePageAccess(userId!, roleName, "/deals");
  if (deny) return deny;

  const db = createAzatClient();

  const { data: dealData, error: dealErr } = await db
    .from("deals")
    .select("id, title, stage, value_cents, owner_id, contact_id, org_id, created_at, last_activity_at")
    .limit(5000);
  if (dealErr) return NextResponse.json({ error: dealErr.message }, { status: 500 });

  const dealRows = (dealData ?? []) as DealRow[];

  // Resolve every referenced contact + org in one pass each.
  const contactIds = dealRows.map((d) => d.contact_id).filter(Boolean) as string[];
  const contacts = await fetchContacts(db, contactIds);

  const orgIds: string[] = [];
  for (const d of dealRows) {
    const ct = d.contact_id ? contacts.get(d.contact_id) : undefined;
    if (ct?.organization_id) orgIds.push(ct.organization_id);
    if (d.org_id) orgIds.push(d.org_id);
  }
  const orgName = await fetchOrgNames(db, orgIds);

  const deals: DealListItem[] = dealRows.map((d) => {
    const ct = d.contact_id ? contacts.get(d.contact_id) : undefined;
    const orgId = ct?.organization_id ?? d.org_id ?? null;
    const company = orgId ? orgName.get(orgId) ?? null : null;
    const who = ct?.name?.trim() || company || "Untitled deal";
    return {
      id: d.id,
      bucket: stageBucket(d.stage),
      stage: d.stage,
      title: d.title?.trim() || who,
      value_cents: d.value_cents ?? 0,
      owner_id: d.owner_id,
      owner_name: repName(d.owner_id),
      contact_id: d.contact_id,
      who,
      company: company && company !== who ? company : null,
      created_at: d.created_at,
      last_activity_at: d.last_activity_at ?? d.created_at,
    };
  });

  return NextResponse.json({ deals });
}
