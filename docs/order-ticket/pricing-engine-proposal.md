# Pricing Engine — Future Architecture Proposal

**Status:** Suggested for future consideration — not part of the current Tickets phase build.  
**Relevant when:** The Tickets module is live, the cost calculator is proven in production, and a second project needs the same pricing logic.

---

## The Problem

The production cost calculator (how reps figure out what to charge a client) currently lives as a standalone HTML page in the pulse project. It contains hardcoded press profiles, hardcoded tier tables, and inline calculation logic. As the CRM grows:

- The same calculation will be needed in the OrderDrawer
- It may be needed in a future customer-facing quoting tool
- It may be needed in a future mobile app or API service
- Every time a new project copies the math, bugs diverge and rates get out of sync

---

## The Proposal

Extract the pricing calculation into a **standalone, framework-agnostic TypeScript library** that any BazaarPrinting project can import.

### Suggested package name
`@bazaarprinting/pricing-engine`

### Core principle
The engine is **pure logic** — input in, result out. It has no dependency on React, Next.js, Supabase, or any browser API. It can run anywhere: server, browser, mobile, edge function.

---

## Structure

### Phase 1 — Build inside BazarCRM (do this now, during Tickets phase)

```
lib/
  pricing/
    engine.ts        ← pure calculation functions
    types.ts         ← TypeScript interfaces
    seed-data.ts     ← default machine profiles + tier tables
```

The engine reads config passed in as arguments (machine profile, tier table, surcharge rules). It does not fetch from the database itself — the caller fetches config and passes it in. This makes the engine fully testable without a database.

### Phase 2 — Extract to shared package (do this when a second project needs it)

```
packages/
  pricing-engine/
    src/
      engine.ts
      types.ts
    package.json    → name: "@bazaarprinting/pricing-engine"
    README.md
```

This becomes a private npm package (or a monorepo workspace package) that BazarCRM, any future quoting tool, and any API service can import.

---

## Engine API (proposed)

### Types

```typescript
interface MachineProfile {
  id: string;
  name: string;
  frameWidthIn: number;
  frameHeightIn: number;
  defaultBleedIn: number;
  squeezeWidthIn?: number;   // 6K labels only
  usableWidthIn?: number;    // 6K pouches only
}

interface PricingTier {
  thresholdFrames: number;   // minFrames (label/pouch) or maxFrames (box/flat)
  basePrice: number;         // $/frame
  uvExtra?: number;          // $/frame UV add-on
  foilExtra?: number;        // $/frame foil add-on
}

interface PricingTierTable {
  id: string;
  name: string;
  kind: 'min-frames' | 'max-frames';
  tiers: PricingTier[];
}

interface SurchargeRule {
  triggerType: 'material' | 'lamination' | 'uv' | 'foil' | 'double_sided';
  triggerValue?: string;     // e.g. 'Holo BOPP', 'Soft Touch' — null = any
  chargeType: 'percent_of_print' | 'flat';
  chargeValue: number;
}

interface PricingInput {
  machine: MachineProfile;
  tierTable: PricingTierTable;
  surcharges: SurchargeRule[];
  itemWidthIn: number;
  itemHeightIn: number;
  quantity: number;
  options: {
    hasUV?: boolean;
    hasFoil?: boolean;
    foilPasses?: number;
    material?: string;
    lamination?: string;
    isDoubleSided?: boolean;
    isPouch?: boolean;
    gussetIn?: number;
    allowRotation?: boolean;
    setupFee?: number;
    cutRatePerFrame?: number;
  };
}

interface PricingResult {
  fitsPerFrame: number;
  neededFrames: number;
  tierUsed: PricingTier | null;
  breakdown: {
    setup: number;
    print: number;
    material: number;
    cut: number;
    lamination: number;
    uv: number;
    foil: number;
    pouching: number;
    doubleSided: number;
    total: number;
  };
  pricePerPiece: number;
  warnings: string[];
  tierLabel: string;
}
```

### Functions

```typescript
// Calculate fits per frame for a given machine and item size
function calcFitsPerFrame(machine: MachineProfile, itemWidthIn: number, itemHeightIn: number, options?: { allowRotation?: boolean; isPouch?: boolean; gussetIn?: number }): number

// Look up the correct tier from a tier table given needed frames
function lookupTier(table: PricingTierTable, neededFrames: number): PricingTier | null

// Full pricing calculation — returns complete cost breakdown and price per piece
function calcProductionCost(input: PricingInput): PricingResult

// Customer-facing quote pricing (subtotal, discount, tax, total, prepay)
// Already in lib/utils/ticket-math.ts — would also move here in Phase 2
function calcQuoteTotals(quote: QuoteForm): QuoteTotals
function calcPrepaySplit(totalAmount: number, prepayConfig: PrepayConfig): PrepaySplit
```

---

## Consumers

| Consumer | Where | What it uses |
|---|---|---|
| OrderDrawer inline calculator | `components/order-drawer.tsx` | `calcFitsPerFrame`, `calcProductionCost` |
| Standalone pricing calculator page | `app/(app)/pricing-calculator/page.tsx` | Same functions |
| Quote totals (already exists) | `lib/utils/ticket-math.ts` | `calcQuoteTotals`, `calcPrepaySplit` |
| Future customer quoting tool | Separate project | Full package import |
| Future mobile app | Separate project | Full package import |
| API route (server-side price validation) | `app/api/tickets/route.ts` | Can run server-side since no browser dep |

---

## Config flow (how the engine gets its data)

```
Admin panel
    ↓ (saves to DB)
Supabase DB
  - machine_profiles
  - pricing_tier_tables + pricing_tiers
  - product_finishing_surcharges
    ↓ (fetched at runtime)
API route: GET /api/lookups/products
    ↓ (passed as config object)
pricing engine
    ↓ (returns PricingResult)
OrderDrawer / Pricing Calculator page
```

The engine never touches the database. The caller fetches the config and passes it in. This means:
- The engine is fully unit-testable with mock config
- The engine can run on the server (API route) or in the browser (component) without change
- Updating pricing rates in the admin panel immediately affects all calculators — no code deploy needed

---

## Migration path (when to extract)

**Do not extract yet.** Build in `lib/pricing/` first. Extract to a package when:

1. The Tickets module is live and the engine API is stable (no more breaking changes expected)
2. A second project actively needs the same logic (not just "might need it someday")
3. You have at least two consumers that would independently diverge without a shared package

Premature extraction creates overhead (versioning, publishing, linking) without benefit. The code is easy to move once the API is proven.

---

## Benefits summary

- **No duplicate math** — one source of truth for all production cost calculations across all projects
- **Admin-driven rates** — pricing tier changes in the DB take effect everywhere immediately
- **Fully testable** — pure functions with no framework dependencies, easy to unit test
- **Future-ready** — ready to extract when a second project needs it, without rewriting anything
- **Consistent results** — quote totals, production costs, and any future pricing feature all use the same engine

---

*Proposal prepared by: BazaarPrinting CRM development team*  
*Related documents: `docs/order-ticket/product-catalog.md` (pricing data), `docs/order-ticket/integration-plan.md` (current build plan)*
