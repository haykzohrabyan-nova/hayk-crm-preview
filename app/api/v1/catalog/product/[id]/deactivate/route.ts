// POST /api/v1/catalog/product/:id/deactivate — soft-delete a product from Bazaar side.

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSecret, handleProductDeactivate } from "@/lib/catalog/receiver";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const secret = request.headers.get("x-webhook-secret");
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: "invalid webhook secret" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isFinite(numId)) return NextResponse.json({ error: "invalid product id" }, { status: 400 });
    const result = handleProductDeactivate(numId);
    console.log(`[catalog/deactivate] id=${result.id} existed=${result.existed}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
