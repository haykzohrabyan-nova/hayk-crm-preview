// Catalog webhook receiver helpers.
// Called by /api/v1/catalog/* route handlers to mutate the in-memory catalog.
//
// Auth: shared secret in x-webhook-secret header (matches CATALOG_WEBHOOK_SECRET env).
// See david-integration-handoff/02-crm-receiver-spec.md for the spec.

import type { Product } from "./types";
import { _receiverReplaceAll, _receiverUpsert, _receiverDeactivate, catalogState } from "./catalog";

export function verifyWebhookSecret(headerSecret: string | null | undefined): boolean {
  const expected = process.env.CATALOG_WEBHOOK_SECRET?.trim();
  if (!expected) {
    // In dev with no secret set, accept anything but log loudly.
    console.warn("[catalog-receiver] CATALOG_WEBHOOK_SECRET not set — accepting all requests (dev only)");
    return true;
  }
  return !!headerSecret && headerSecret.trim() === expected;
}

export function assertSchemaVersion(v: string | undefined): void {
  if (!v) return;
  const major = Number(v.split(".")[0]);
  if (major !== 1) throw new Error(`Unsupported catalog schema version ${v} — expected major 1`);
}

// ─── Full snapshot ────────────────────────────────────────

export interface SyncPayload {
  schemaVersion?: string;
  source?: string;
  store?: string;
  productCount?: number;
  products: Product[];
}

export function handleCatalogSync(body: SyncPayload): { received: number; schemaVersion?: string } {
  if (!Array.isArray(body?.products)) throw new Error("products array required");
  assertSchemaVersion(body.schemaVersion);
  _receiverReplaceAll(body.products, body.schemaVersion);
  return { received: body.products.length, schemaVersion: body.schemaVersion };
}

// ─── Single product upsert ────────────────────────────────

export interface ProductUpsertPayload {
  schemaVersion?: string;
  event?: "product.upsert" | "product.deactivate";
  product: Product;
}

export function handleProductUpsert(body: ProductUpsertPayload): { id: number } {
  assertSchemaVersion(body.schemaVersion);
  if (!body?.product || typeof body.product.id !== "number") throw new Error("product.id required");
  _receiverUpsert(body.product);
  return { id: body.product.id };
}

// ─── Deactivate ───────────────────────────────────────────

export function handleProductDeactivate(productId: number): { id: number; existed: boolean } {
  const existed = catalogState.byId.has(productId);
  _receiverDeactivate(productId);
  return { id: productId, existed };
}
