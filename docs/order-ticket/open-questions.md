# Open Questions — Tickets (Quotes & Orders) Module

Technical reference for the dev team. For the owner-facing version see [`owner-questionnaire.md`](./owner-questionnaire.md).

**Status key:**
- ✅ **ANSWERED** — confirmed from shadow project code
- ⚠️ **OWNER PENDING** — needs owner decision before this part can be built
- 🔄 **OWNER REVIEW** — pre-filled from shadow; owner should confirm it matches production intent

---

## Section A — Access Control & Visibility

---

**A1. Who can see the Quotes page (`/quotes`)?**

🔄 **OWNER REVIEW** — confirmed from shadow project code (`GET /api/tickets` in `backend/server.js` has zero auth filtering — all tickets returned to all users).

**Answer from shadow: Everyone sees all** — SDR, Sales, and Admin all see the same list.

Confirmed in code: `app.get('/api/tickets', (req, res) => { res.json(jobTickets); });`

_Owner must confirm this is correct for production. If scoping is wanted, raises build scope significantly._

Blocks: RLS policy in migration 041, `app/api/tickets/route.ts` GET filter.

---

**A2. Who can see the Orders page (`/orders`)?**

🔄 **OWNER REVIEW** — same as A1. All tickets (both quotes and orders) are returned unfiltered.

**Answer from shadow: Everyone sees all.**

Blocks: Same as A1.

---

**A3. Can Admin see and edit ALL tickets?**

✅ **ANSWERED** — Admin already has `bypass_rls` or is handled via role check in all other routes. Will follow the same pattern: Admin reads and edits all tickets.

No owner question needed — consistent with rest of app.

---

## Section B — Creation Rights & Workflow

---

**B1. Can an SDR create a quote or order?**

✅ **ANSWERED from shadow project code (`VerifyDrawer.jsx` lines 74, 288, 397–450).**

**Answer: Yes — from VerifyDrawer only.** The SDR creates tickets from inside the lead they are working. The standalone `/quotes` and `/orders` pages do not show a "Create" button for SDR.

Evidence:
```javascript
// VerifyDrawer.jsx line 288
const isLockedStatus = formData.status === 'Rejected' || formData.status === 'Routed to Sales' || formData.status === 'Quoted';
// Order/Quote tab is available when lead is NOT in a locked status
```

---

**B2. When SDR creates a ticket, does the lead auto-route to Sales?**

✅ **ANSWERED from shadow project code (`VerifyDrawer.jsx` lines 394–450).**

**Answer: Lead stays with SDR. Status changes, no auto-route.**

Exact behavior:
- Ticket has quote SKUs → `lead.status = 'Quoted'`, `lead.salesStatus = 'Quote Sent'`
- Order only (no quote) → `lead.status = 'Validated'`
- Lead does **not** get routed to Sales automatically

Evidence:
```javascript
// VerifyDrawer.jsx ~line 397
status: hasQuote ? 'Quoted' : 'Validated',
...(hasQuote ? { salesStatus: 'Quote Sent', ... } : {}),
// Then calls /api/leads/verify — NOT /api/leads/route
```

🔄 **OWNER REVIEW** — confirm this is correct for production (SDR-created ticket keeps lead with SDR).

---

**B3. Can Sales create a ticket for any contact, or only claimed leads?**

✅ **ANSWERED from shadow project (`SalesDashboard.jsx`, `ContactCRM.jsx`).**

**Answer: Both paths exist:**
1. From SalesDrawer on a claimed lead → linked to that lead
2. From CRM toolbar "+ Add Order" → contact search step first, no lead linked

No restriction to "claimed leads only."

---

**B4. Can a quote be "converted" to an order?**

✅ **ANSWERED from shadow project code (`ContactCRM.jsx` lines 1400–1435).**

**Answer: Both tickets (quote + order shell) are created simultaneously at save time.**

When `requireClientConfirmation = true` (the default):
- A `ticketKind: 'quote'` ticket is saved
- A `ticketKind: 'order'` ticket with `orderStatus: 'Pending Client Confirmation'` is saved alongside it
- The order shell is filtered OUT of the Orders tab until the client confirms (`orderTicketsForWorkspaceTab()` excludes `Pending Client Confirmation` orders)
- When client confirms → order becomes active, appears on Orders tab

When `requireClientConfirmation = false`:
- An order ticket is created directly with `orderSource: 'direct'`
- No quote ticket is created

🔄 **OWNER REVIEW** — confirm this "create both at once" model is correct for production.

---

**B5. Can an existing ticket be edited after it is sent/approved?**

⚠️ **OWNER PENDING** — Shadow project has no restrictions (always editable). This is a business policy decision.

Options:
- Always editable (matches shadow)
- Only draft/sent tickets editable; approved = read-only unless admin re-opens
- Only creator can edit

Blocks: Edit button visibility logic in OrderDrawer read-only mode.

---

## Section C — Pricing & Business Rules

---

**C1. What payment methods?**

✅ **ANSWERED from shadow project code (`ContactCRM.jsx` lines 417–434).**

```javascript
const QUOTE_PAYMENT_TYPE_OPTIONS = [
  { value: 'card_default', label: 'Card Payment' },
  { value: 'zelle',        label: 'Zelle' },
  { value: 'offline',      label: 'Offline' },
];
// Default: ['card_default']
```

🔄 **OWNER REVIEW** — confirm these three are correct for BazaarPrinting. Add/remove/rename?

Blocks: `quote_payment_types` enum values, checkbox list in OrderDrawer.

---

**C2. Default tax rate?**

✅ **ANSWERED from shadow project code (`ContactCRM.jsx` line 441).**

```javascript
const DEFAULT_QUOTE_TAX_RATE_PERCENT = 8.25;
```

🔄 **OWNER REVIEW** — confirm 8.25% is correct for production jurisdiction.

Blocks: `DEFAULT_TAX_RATE` constant in `lib/utils/ticket-math.ts`.

---

**C3. High-value order warning threshold?**

✅ **ANSWERED from shadow project code (`ContactCRM.jsx` lines 1255, 1272, 1371, 1508, 1704).**

```javascript
// Threshold: $5,000
if (userRole === 'SDR' && calculateQuoteTotals(form.quote).quoteFinalTotal >= 5000) { ... }
```

**Important nuance found in code:** The $5,000 warning currently applies to **SDR only** in the shadow project. Sales reps see the warning banner but are not blocked.

🔄 **OWNER REVIEW** — confirm:
- Threshold of $5,000 is correct
- Warning for SDR only (not Sales) is correct, or should it apply to both equally?

Blocks: `HIGH_VALUE_THRESHOLD` constant, warning banner condition in OrderDrawer.

---

**C4. Are product types, materials, and finishes admin-managed or hardcoded?**

✅ **C4b ANSWERED by owner** — Admin-managed from the Admin → Products tab (dedicated tables, not hardcoded). See `docs/order-ticket/product-catalog.md` for full data model and schema.

**Updated product list from `pulse/shared.js` (`PRODUCT_TYPES` constant):**

Shadow project had simplified names; pulse project has the authoritative production names. See reconciliation table in `product-catalog.md` Part 5.

**16th Street products:**
- Labels (Roll) → materials: BOPP group (Clear/White/Silver/Holo BOPP), Label Sheets group
- Labels (Sheet) → materials: Label Sheets group only
- Pouches → materials: Cosmetic Web group (Clear/White/Silver Cosmetic Web)
- Folding Cartons / Boxes → materials: Cardstock group (14pt–24pt C1S/C2S)
- Business Cards → materials: Cardstock + Cover Stock
- Flyers / Postcards → materials: Cover/Text Stock + Cardstock
- Booklets → materials: Cover/Text Stock
- Diecut Stickers → materials: BOPP + Label Sheets (same as Labels Roll)

**Boyd Street products:**
- Vinyl Labels / 54'' Rolls → materials: Vinyl (Boyd)
- Vinyl Signage → materials: Vinyl (Boyd)
- Banners / Large Format → materials: Specialty (Boyd)
- Window Decals → materials: Specialty (Boyd) → Window Decal only
- Wallpaper → materials: Specialty (Boyd) → Wallpaper Material only
- Sheet Products (Boyd) → materials: Sheet (Boyd) (18pt/20pt/24pt)

**Both facilities:**
- Folding Cartons / Boxes at Boyd → Cardstock (Boyd): 16pt, 18pt, 20pt, 24pt
- Diecut Stickers at Boyd → Vinyl (Boyd) instead of BOPP
- Other → all material groups

**Full material groups with sub-options — see `product-catalog.md` Part 2.**

**Laminations (from `pulse/shared.js → LAMINATION_OPTIONS`):**
None, Gloss, Matte, Soft Touch, Holo, Coating

Note: Labels (Sheet) auto-default to Gloss; labels do not get laminated at Boyd.

**Color Modes:** CMYK, CMYK + White

**Finishing (toggles):** Spot UV (requires UV file), Foil (requires foil file + foil color), Perforation

**Not in pulse (were in shadow):** Canvas Prints, Jars (as product type), Tubes (as product type)
- Jars and Tubes appear as application service containers in the pricing calculator (see C7)

⚠️ **OWNER PENDING (C4a):** Confirm product name alignment: should the CRM use pulse production names (e.g. "Diecut Stickers", "Flyers / Postcards") or keep the shadow simplified names (e.g. "Stickers", "Flyer")? Should Canvas Prints / Jars / Tubes remain as product types?

⚠️ **OWNER PENDING (C4c):** Should the OrderDrawer filter materials by facility (16th Street vs Boyd), or show all materials for a product type regardless of facility?

Full product-to-material mapping table with owner review instructions: `docs/order-ticket/product-catalog.md` Part 3.

---

**C5. Does "Rush" affect pricing?**

✅ **ANSWERED from shadow project — Rush is informational only, no price impact.**

Evidence: Rush toggle sets `rush: true` boolean on the ticket. Pricing formula (`calculateQuoteTotals`) does not reference the rush flag.

🔄 **OWNER REVIEW** — confirm Rush = badge only, no surcharge.

---

**C6. Is shipping manual or fixed?**

✅ **ANSWERED from shadow project code (`ContactCRM.jsx` line 536).**

```javascript
quoteShipping: '',  // defaults to empty (zero)
```

**Answer: Manual entry per quote, defaults to blank (no charge).**

🔄 **OWNER REVIEW** — confirm this is correct.

---

## Section C7 — Production Cost Calculator

---

**C7. Should the pricing/cost calculator be embedded in the OrderDrawer?**

⚠️ **OWNER PENDING** — The pulse project has a standalone `pricing-calculator-sales.html` that calculates production cost from press + item size + quantity, producing a suggested price per piece. Currently this is a **separate tool** — the rep calculates the price there and then types it manually into the quote.

**Full tier pricing tables are documented in `docs/order-ticket/product-catalog.md` Part 4b.**

Summary of how it works:
1. Rep selects product type → system picks the press (6K / 15K / Boyd)
2. Rep enters item dimensions and quantity
3. System calculates fits per frame and needed frames
4. Tier table lookup → suggested price per piece (accounts for UV, foil, lamination, material surcharges, double-sided, setup fee, cut fee)

Options:
- **Option A — Keep as separate tool**: OrderDrawer stays simple (manual unit price entry). Rep opens the cost calculator separately, calculates, then enters the number.
- **Option B — Embed in OrderDrawer**: Each SKU row shows a "Calculate price" button. Rep enters size + options, system suggests a unit price. Rep can accept or override. More useful but significantly more build work.

Blocks: Scope of SKU row UI in `components/order-drawer.tsx` and whether to port the full pricing engine to `lib/utils/ticket-math.ts`.

---

**C8. Facility field on tickets (16th Street vs Boyd Street)?**

⚠️ **OWNER PENDING** — The pulse production system routes jobs to either 16th Street or Boyd Street and this determines which materials are available. Should the CRM OrderDrawer include a Facility selector that filters the material dropdown accordingly?

- **Yes — show facility selector**: material dropdown filters to the right options per facility (matches pulse workflow exactly)
- **No — skip facility selector**: show all materials for a product type; production figures out routing separately

Blocks: Schema (add `facility` column to `job_tickets`?), OrderDrawer product-type change handler.

---

**C9. Full material sub-options or group-level only?**

⚠️ **OWNER PENDING** — Cardstock alone has 9 sub-options (14pt C1S, 14pt C2S, 16pt C1S, 16pt C2S, 18pt C1S, 18pt C2S, 18pt Silver, 24pt C1S, 24pt C2S). Should the CRM quote show the full weight/finish breakdown, or just "Cardstock"?

- **Full sub-options**: accurate pricing, production knows exactly what was quoted
- **Group-level only (e.g. just "Cardstock")**: simpler for reps, production selects the weight

Blocks: How many materials are seeded in the admin Products tab and what the SKU row material dropdown looks like.

---

---

**D1. `/tickets` hub vs separate `/quotes` and `/orders` pages?**

🔄 **OWNER REVIEW** — BazarCRM already has `/quotes` and `/orders` as two separate sidebar items and pages. Shadow project had one tabbed page. The simplest path is to keep the two separate pages as already structured.

**Default answer (no change needed): Keep as two separate pages.**

⚠️ **OWNER PENDING** only if they want to change to a single tabbed `/tickets` page — that would require nav and routing changes.

---

**D2. "Create" button on the standalone pages?**

✅ **ANSWERED from shadow project** — no standalone create button on the list pages. Creation always happens from a lead drawer (VerifyDrawer / SalesDrawer) or from CRM toolbar "+ Add Order".

🔄 **OWNER REVIEW** — confirm no "New Quote" button is needed on the `/quotes` page directly.

---

## Section E — PDF Export

---

**E1. Company info for PDF header?**

✅ **ANSWERED** — Company information (name, address, phone, email, logo, website) will be stored in and read from the **Admin → Company Info tab** (`/admin/settings/company`). The PDF generation will fetch these details from the database at render time. No hardcoding needed and no owner input required at this stage — the owner fills in the Company Info tab directly in the admin panel before generating their first PDF.

No longer blocks the PDF build — only requires the Company Info admin tab to be built first (already planned as part of the Admin phase).

---

**E2. Logo on PDF?**

⚠️ **OWNER PENDING** — shadow is text-only. Owner to decide.

If yes: need the logo file.

---

## Section F — Statistics & KPIs

---

**F1. Revenue in Statistics and Dashboard?**

✅ **ANSWERED from shadow project** — StatisticsTab (`StatisticsTab.jsx`) includes ticket revenue using `ticketAmount()` from `statsDateRange.js`.

**Answer: Yes — include revenue from tickets in Stats and Dashboard.**

🔄 **OWNER REVIEW** — confirm this is wanted in production.

---

**F2. How to count "Won" deals for Sales KPIs?**

✅ **ANSWERED** — will use `ticket_status = 'approved'` on job tickets (consistent with shadow's `clientConfirmed / Approved` state). `sales_status = 'Won'` on leads remains as a parallel signal.

---

## Section G — Notifications & Follow-up

---

**G1/G2 — Follow-up notifications and cross-rep alerts**

⚠️ **DEFERRED** — Notifications module is not yet built. These questions are noted for when notifications are built. No impact on Tickets phase build.

---

## Section H — Misc / Edge Cases

---

**H1. Order reference number format?**

⚠️ **OWNER PENDING** — Shadow uses `O${timestamp}_${random}` (not user-friendly). Owner to choose:
- Short UUID code: `#a3f9b12c`
- Sequential: `ORD-0001`
- Year + sequential: `ORD-2026-001`

Blocks: `reference_code` generation in `POST /api/tickets`.

---

**H2. Tickets on lead merge?**

✅ **ANSWERED** — existing customer merge API (`app/api/customers/[id]/merge/route.ts`) already updates `leads`. We will add `job_tickets.customer_id` to the same merge logic. `linked_lead_id` updates naturally since lead IDs are preserved in the surviving record.

---

**H3. Max SKU lines per ticket?**

✅ **ANSWERED from shadow** — no limit. Will use no limit in production unless owner requests one.

---

**H4. Locking on tickets (concurrent editing)?**

✅ **ANSWERED from shadow** — no locking. Any authorized user can edit at any time. Will use the same model in production (no ticket lock, unlike leads).

---

## Summary — Current Status

### ✅ Answered from shadow project code (no owner input needed)
A3, B1, B2, B3, B4, C1, C2, C3, C5, C6, D2, F1, F2, H2, H3, H4

### 🔄 Owner review (pre-filled, owner should confirm)
A1, A2, B2 (confirm no auto-route), C1, C2, C3, C5, C6, D1, F1

### ⚠️ Owner must answer before building
| ID | Question | Blocks |
|---|---|---|
| B5 | Editing policy after ticket sent/approved | OrderDrawer edit guard |
| C4a | Product name alignment (pulse vs shadow names) + Canvas/Jars/Tubes | SKU dropdown product list |
| C4c | Facility filter in OrderDrawer? (16th St vs Boyd) | Material dropdown logic |
| C7 | Cost calculator: embedded in OrderDrawer or separate tool? | OrderDrawer SKU row scope |
| C8 | Facility field on ticket? | Schema + material filter |
| C9 | Full material sub-options vs group-level only? | Admin seed data + dropdown |
| E2 | Logo on PDF | PDF complexity |
| H1 | Order reference number format | `reference_code` generation |

### ⚠️ Deferred (no impact on current build)
G1, G2 — notifications module not yet built
