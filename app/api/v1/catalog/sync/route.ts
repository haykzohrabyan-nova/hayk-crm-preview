// POST /api/v1/catalog/sync — full catalog snapshot from Bazaar.
// Spec: david-integration-handoff/02-crm-receiver-spec.md

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret, handleCatalogSync } from "@/lib/catalog/receiver";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: "invalid webhook secret" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = handleCatalogSync(body);
    console.log(`[catalog/sync] received ${result.received} products (schemaVersion=${result.schemaVersion})`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
