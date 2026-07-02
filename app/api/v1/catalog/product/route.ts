// POST /api/v1/catalog/product — single product upsert from Bazaar.

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret, handleProductUpsert } from "@/lib/catalog/receiver";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: "invalid webhook secret" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = handleProductUpsert(body);
    console.log(`[catalog/product] upsert id=${result.id} (${body?.product?.name})`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
