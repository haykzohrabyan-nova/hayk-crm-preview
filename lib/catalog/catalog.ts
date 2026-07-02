// CRM catalog module — the single place UI code reads product/material/field data.
//
// TODAY: reads from the static catalog-v1.json seed (77 products / 53 materials
// snapshot from Bazaar taken 2026-06-29).
//
// LATER: same interface, but data comes from an in-memory Map populated by the
// webhook receiver at POST /api/v1/catalog/sync + /product + /product/:id/deactivate
// (see /lib/catalog/receiver.ts). No UI code has to change when the switch happens.

import type { Product, Material, CategoryId, FieldKey } from "./types";
import { CATEGORIES, getCategoryId } from "./categories";
import seedJson from "./catalog-v1.json";

// ─── Seed load ────────────────────────────────────────────
// Static seed. Replaced at runtime by webhook payloads once wired.
const SEED = seedJson as unknown as {
  store: string;
  source: string;
  schemaVersion: string;
  productCount: number;
  products: Product[];
};

// Public state — mutable so the webhook receiver can swap it in place.
export const catalogState = {
  schemaVersion: SEED.schemaVersion,
  lastSyncedAt: null as string | null,
  byId: new Map<number, Product>(SEED.products.map(p => [p.id, p])),
};

// ─── Read helpers (this is what UI code uses) ─────────────

export function getSchemaVersion(): string {
  return catalogState.schemaVersion;
}

export function getAllProducts(): Product[] {
  return Array.from(catalogState.byId.values());
}

export function getProduct(id: number): Product | undefined {
  return catalogState.byId.get(id);
}

/** Group all products under the 10 top-level categories, preserving CATEGORIES order. */
export function getCategoriesWithCounts(): Array<{
  id: CategoryId;
  label: string;
  icon: string;
  count: number;
  order: number;
}> {
  const products = getAllProducts();
  const counts: Record<string, number> = {};
  for (const p of products) {
    const cat = getCategoryId(p.subcategory);
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return CATEGORIES.map(c => ({ id: c.id, label: c.label, icon: c.icon, order: c.order, count: counts[c.id] ?? 0 }));
}

/** Products in a given top-level category, sorted alphabetically by name. */
export function getProductsByCategory(categoryId: CategoryId): Product[] {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return [];
  const products = getAllProducts()
    .filter(p => cat.subcategories.length === 0
      ? getCategoryId(p.subcategory) === "more"
      : cat.subcategories.includes(p.subcategory ?? ""))
    .sort((a, b) => a.name.localeCompare(b.name));
  return products;
}

/** Materials for a given product, resolved from Material.id → Material row. */
export function getMaterialsForProduct(productId: number): Material[] {
  const p = getProduct(productId);
  return p?.materials ?? [];
}

/** Which option fields the UI should render for this product (only the ones with values). */
export function getEnabledFieldsForProduct(productId: number): FieldKey[] {
  const p = getProduct(productId);
  if (!p) return [];
  const out: FieldKey[] = [];
  for (const [key, value] of Object.entries(p.fields)) {
    if (value && Array.isArray(value) && value.length > 0) out.push(key as FieldKey);
  }
  return out;
}

/** Available option values for a specific field on a product (raw IDs — UI resolves labels). */
export function getFieldValues(productId: number, field: FieldKey): Array<number | string> {
  const p = getProduct(productId);
  const v = p?.fields[field];
  if (!v || !Array.isArray(v)) return [];
  return v as Array<number | string>;
}

/** Quantity tier picker options. Returns the frame-tier quantity ladder as strings. */
export function getQuantityOptions(productId: number): string[] {
  const p = getProduct(productId);
  if (!p) return [];
  const q = p.fields.QUANTITY;
  if (q && Array.isArray(q)) return q.map(String);
  // Fall back to frame tier maxFrames × frames-in-a-sheet if QUANTITY not defined.
  return [];
}

// ─── Webhook wiring point (STUB for now) ──────────────────
//
// The CRM receiver spec (02-crm-receiver-spec.md) defines three routes:
//   POST /api/v1/catalog/sync       → replaces catalogState wholesale
//   POST /api/v1/catalog/product    → upserts one product by id
//   POST /api/v1/catalog/product/:id/deactivate → removes one product
//
// When those routes are wired, they call these functions to mutate catalogState.
// UI code never touches catalogState directly — it only calls the read helpers above.

export function _receiverReplaceAll(products: Product[], schemaVersion?: string) {
  catalogState.byId = new Map(products.map(p => [p.id, p]));
  catalogState.schemaVersion = schemaVersion ?? catalogState.schemaVersion;
  catalogState.lastSyncedAt = new Date().toISOString();
}

export function _receiverUpsert(product: Product) {
  catalogState.byId.set(product.id, product);
  catalogState.lastSyncedAt = new Date().toISOString();
}

export function _receiverDeactivate(productId: number) {
  catalogState.byId.delete(productId);
  catalogState.lastSyncedAt = new Date().toISOString();
}
