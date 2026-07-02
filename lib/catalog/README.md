# CRM Catalog Module

Single source of catalog + pricing lookups inside the CRM. UI code imports from here; nothing else.

## Files

| File | Purpose |
|---|---|
| `catalog-v1.json` | Seed snapshot — 77 products / 53 materials from Bazaar (2026-06-29). Replaced at runtime by webhook payloads. |
| `types.ts` | Shape of `Product`, `Material`, `Category` — mirrors `catalog-v1.json`. |
| `categories.ts` | The 10 top-level categories Hayk locked + subcategory rollup rules. |
| `catalog.ts` | Read helpers UI calls. Static seed today, webhook-driven later. Same interface either way. |
| `pricing.ts` | POSTs specs to Bazaar's pricing endpoint. CRM does not compute price locally. |
| `receiver.ts` | (TO ADD) API routes for `/api/v1/catalog/sync|product|deactivate`. See `02-crm-receiver-spec.md`. |

## Usage

```ts
import {
  getCategoriesWithCounts,
  getProductsByCategory,
  getMaterialsForProduct,
  getEnabledFieldsForProduct,
  getFieldValues,
  getQuantityOptions,
} from "@/lib/catalog/catalog";

import { requestPrice } from "@/lib/catalog/pricing";

// Quote builder flow:
// 1. Category picker
const cats = getCategoriesWithCounts();

// 2. Product picker under category
const products = getProductsByCategory("labels-stickers");

// 3. Options — only render fields this product actually has
const fields = getEnabledFieldsForProduct(productId);
const materialOptions = getMaterialsForProduct(productId);
const quantityOptions = getQuantityOptions(productId);

// 4. Get price (from Bazaar)
const price = await requestPrice({
  productId,
  materialId,
  quantity,
  fields: { FINISHING: [177], DOUBLE_SIDED: false, /* ... */ },
});
```

## The 10 categories → subcategory rollup

| Category | Subcategories rolled up | Live count |
|---|---|---|
| Labels & Stickers | `labels-stickers` | 5 |
| Packaging & Boxes | `packaging-boxes` + `packaging-supplies` | 22 |
| Bags & Pouches | `bags-flexible-packaging` | 5 |
| Banners & Signs | `banners-signs` + `custom-vinyl-lettering` + `fridge-magnets` | 12 |
| Marketing Materials | `marketing-materials` | 8 |
| Trading Cards | `trading-cards` | 2 |
| Wallpapers | `wallpapers` | 1 |
| Apparel | (placeholder — no live products yet) | 0 |
| Combos | `label-bag-combo` + `label-jar-combo` + `label-tube-combo` | 22 |
| More | catch-all (any subcategory not mapped above) | 0 |
| **Total** | | **77** |

## Pricing decision (2026-07-01)

Hayk's decision: **CRM does not compute price locally.** Every quote calculation is a network call to Bazaar's pricing endpoint (`POST /api/v1/pricing/quote`).

Trade-offs:
- ✅ Single source of truth for pricing — no formula drift between CRM and Bazaar
- ✅ David doesn't have to port the frame-tier math
- ❌ Network dependency on every price display (mitigated by aggressive caching in the quote builder + retry with backoff in `pricing.ts`)

This flips the recommendation in `david-integration-handoff/04-order-handoff-contract.md` Decision Point #1. The order payload still carries a `pricingSnapshot` with the returned unit price + `frameTiersHash` so audits stay traceable.

## Webhook wiring (when receiver lands)

The three receiver routes (per `02-crm-receiver-spec.md`) call these functions to mutate state:

- `POST /api/v1/catalog/sync` → `_receiverReplaceAll(products, schemaVersion)`
- `POST /api/v1/catalog/product` → `_receiverUpsert(product)`
- `POST /api/v1/catalog/product/:id/deactivate` → `_receiverDeactivate(id)`

UI code never touches `catalogState` directly — always through the public read helpers. This means UI does NOT change when we flip from static seed to live webhook.

## Env vars needed

```
CATALOG_WEBHOOK_SECRET=wh_live_<32-char>      # for receiver auth (see 02-crm-receiver-spec.md)
NEXT_PUBLIC_BAZAAR_PRICING_URL=https://bazaarprinting.com/api/v1/pricing/quote
BAZAAR_PRICING_KEY=<internal-key>             # for pricing client
```
