// Pricing webhook client — CRM does NOT compute price locally.
// Hayk's decision (2026-07-01): pricing lives on the Bazaar website.
// CRM POSTs specs → Bazaar returns price + breakdown.
//
// See david-integration-handoff/04-order-handoff-contract.md
// (Decision Point #1 flipped from "local compute" to "live webhook").

import type { FieldKey } from "./types";

export interface PricingRequest {
  productId: number;
  materialId: number;
  quantity: number;
  fields: Partial<Record<FieldKey, number | string | boolean | null>>;   // resolved single values (not the allowlists)
  size?: { widthIn?: number; heightIn?: number; custom?: boolean };
  finishingIds?: number[];
  clientQuoteId?: string;    // opaque, for tracing on the Bazaar side
}

export interface PricingResponse {
  ok: true;
  quoteRefId: string;        // Bazaar-side snapshot id — attach to the CRM quote for audit
  unitPrice: number;
  extended: number;
  currency: "USD";
  validForDays: number;
  breakdown: {
    material?: number;
    print?: number;
    coating?: number;
    finish?: number;
    setup?: number;
    other?: number;
  };
  frameTiersHash: string;    // sha256 of the frame_tiers used — locks the ladder version
  assumptions: string[];
  warnings: string[];
}

export interface PricingError {
  ok: false;
  code: "INVALID_COMBO" | "NOT_FOUND" | "INCOMPLETE_SPEC" | "PRICING_UNAVAILABLE" | "UNKNOWN";
  message: string;
  retryable: boolean;
}

// ─── Client ────────────────────────────────────────────
// URL comes from env. Timeout is aggressive because the quote builder is interactive.
// Retries with backoff are handled ONE level up (in the UI hook) so we can surface loading state.

export async function requestPrice(req: PricingRequest, opts: { signal?: AbortSignal } = {}): Promise<PricingResponse | PricingError> {
  const url = process.env.NEXT_PUBLIC_BAZAAR_PRICING_URL || process.env.BAZAAR_PRICING_URL;
  const key = process.env.BAZAAR_PRICING_KEY;
  if (!url) return { ok: false, code: "PRICING_UNAVAILABLE", message: "Pricing URL not configured", retryable: false };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "x-internal-key": key } : {}),
      },
      body: JSON.stringify(req),
      signal: opts.signal,
    });

    if (res.status === 400) return { ok: false, code: "INCOMPLETE_SPEC", message: (await res.text()).slice(0, 400), retryable: false };
    if (res.status === 404) return { ok: false, code: "NOT_FOUND", message: "Product or material not found", retryable: false };
    if (res.status === 422) return { ok: false, code: "INVALID_COMBO", message: (await res.text()).slice(0, 400), retryable: false };
    if (res.status === 503) return { ok: false, code: "PRICING_UNAVAILABLE", message: "Pricing engine unavailable", retryable: true };
    if (!res.ok) return { ok: false, code: "UNKNOWN", message: `HTTP ${res.status}`, retryable: res.status >= 500 };

    const body = await res.json();
    return { ok: true, ...body };
  } catch (e) {
    const msg = (e as Error).message || "network error";
    return { ok: false, code: "PRICING_UNAVAILABLE", message: msg, retryable: true };
  }
}

/** Convenience helper — fetches price for a whole quote (multiple line items) in parallel. */
export async function requestPricesForVariants(variants: PricingRequest[]): Promise<Array<PricingResponse | PricingError>> {
  return Promise.all(variants.map(v => requestPrice(v)));
}
