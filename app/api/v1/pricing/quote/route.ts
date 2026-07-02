// POST /api/v1/pricing/quote — MOCK pricing endpoint for local development.
//
// This is a TEMPORARY stand-in for the real Bazaar pricing endpoint.
// It walks the catalog's frame tiers to produce realistic prices so the CRM
// quote builder is testable end-to-end today.
//
// When David ships the real endpoint on bazaarprinting.com, flip:
//   NEXT_PUBLIC_BAZAAR_PRICING_URL=https://bazaarprinting.com/api/v1/pricing/quote
// No CRM code changes needed — pricing.ts already points at whatever URL you configure.
//
// This mock endpoint stays here as a DEV FALLBACK so the CRM keeps working
// offline or if the real endpoint is down.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getProduct } from "@/lib/catalog/catalog";
import type { PricingRequest, PricingResponse } from "@/lib/catalog/pricing";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const req = (await request.json()) as PricingRequest;

    const product = getProduct(req.productId);
    if (!product) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "product not found", retryable: false }, { status: 404 });

    const material = product.materials.find(m => m.id === req.materialId);
    if (!material) return NextResponse.json({ ok: false, code: "INVALID_COMBO", message: "material not valid for this product", retryable: false }, { status: 422 });

    if (!req.quantity || req.quantity <= 0) return NextResponse.json({ ok: false, code: "INCOMPLETE_SPEC", message: "quantity required", retryable: false }, { status: 400 });

    // MOCK MATH — approximation only. Real math lives on Bazaar (helperService.ts).
    // Factors: quantity, material multiplier, dimensions (sheet fitting proxy), finishes, special effects.
    const frameTiers = product.frameTiers;
    const frameW = frameTiers?.frameWidth ? Number(frameTiers.frameWidth) : 13;
    const frameL = frameTiers?.frameLength ? Number(frameTiers.frameLength) : 39;
    const partW = req.size?.widthIn ?? 2;
    const partH = req.size?.heightIn ?? 2;
    // Rough "how many parts fit on one frame" — cap at 1
    const partsPerFrame = Math.max(1, Math.floor((frameW / partW) * (frameL / partH) * 0.85));
    let framesUsed = Math.max(1, Math.ceil(req.quantity / partsPerFrame));
    let framePriceUsed = 0;
    let unitPrice = 0;

    if (frameTiers && Array.isArray(frameTiers.tiers) && frameTiers.tiers.length > 0) {
      const tier = frameTiers.tiers.find(t => framesUsed <= t.maxFrames) ?? frameTiers.tiers[frameTiers.tiers.length - 1];
      framePriceUsed = tier.framePrice;
      const raw = framePriceUsed * framesUsed * (material.priceMultiplier || 1);
      const withMin = Math.max(raw, frameTiers.minTicket ?? 0);
      unitPrice = withMin / req.quantity;
    } else {
      // Flat-rate fallback for products without frame tiers
      unitPrice = 2.5 * (material.priceMultiplier || 1);
    }

    const extended = Math.round(unitPrice * req.quantity * 100) / 100;

    // Coating / finish / special-effect upcharges (mock only — real logic on Bazaar)
    const finishBump = (req.finishingIds?.length ?? 0) * 0.08;
    const finalExtended = Math.round(extended * (1 + finishBump) * 100) / 100;
    const finalUnit = Math.round((finalExtended / req.quantity) * 10000) / 10000;

    // Hash the frame tiers so audits can verify we used the same ladder later.
    const frameTiersHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(product.frameTiers ?? {}))
      .digest("hex")
      .slice(0, 16);

    const response: PricingResponse = {
      ok: true,
      quoteRefId: `MOCK-${Date.now()}-${req.productId}`,
      unitPrice: finalUnit,
      extended: finalExtended,
      currency: "USD",
      validForDays: 30,
      breakdown: {
        material: Math.round(extended * 0.35 * 100) / 100,
        print: Math.round(extended * 0.45 * 100) / 100,
        coating: Math.round(extended * finishBump * 100) / 100,
        finish: 0,
        setup: 30,
        other: 0,
      },
      frameTiersHash,
      assumptions: [
        "Standard 5–7 business day turnaround",
        "Artwork print-ready on submission",
        `Priced from mock endpoint — real prices when Bazaar ships /api/v1/pricing/quote`,
      ],
      warnings: [
        `Frames used (mock): ${framesUsed} at $${framePriceUsed}/frame`,
      ],
    };

    return NextResponse.json(response);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, code: "UNKNOWN", message: msg, retryable: false }, { status: 500 });
  }
}
