# Product Catalog — Admin-Managed Reference

Sourced from `/pulse/shared.js` (`PRODUCT_TYPES` + `MATERIALS` constants) and `/pulse/FULL-SPEC.md`.  
This is the authoritative product-material data for BazaarPrinting's production setup.

---

## Part 1 — Pricing Calculation (How It Works)

The full calculation chain from the shadow project, confirmed from `ContactCRM.jsx → calculateQuoteTotals()`.

### Step-by-step formula

```
1.  Line total        = quantity × unit_price                (per SKU row)
2.  Quote subtotal    = SUM of all line totals
3.  Discount amount   = if discount ON:
                          type = 'percent' → min(subtotal × value/100, subtotal)
                          type = 'fixed'   → min(fixed_value, subtotal)
                        if discount OFF → 0
4.  Pre-tax total     = max(subtotal − discount_amount + shipping, 0)
5.  Tax amount        = if tax_exempt → 0
                        else → round(pre_tax_total × (tax_rate / 100), 2)
6.  Final total       = round(pre_tax_total + tax_amount, 2)
7.  Prepayment split  = if prepayment_type = 'percent' → round(final_total × value/100, 2)
                        if prepayment_type = 'fixed'   → round(min(value, final_total), 2)
                        Balance due = max(final_total − prepayment, 0)
```

### Defaults on a new quote

| Field | Default |
|---|---|
| Tax rate | 8.25% |
| Tax exempt | false |
| Discount | off |
| Shipping | blank (0) |
| Prepayment type | percent |
| Prepayment value | 25% |
| Payment types | [Card Payment] |
| Requires client confirmation | true |
| Follow-up cycles | 3 |
| Follow-up frequency | Daily |
| First SKU product type | Labels (Roll) |
| Material | — (not selected) |
| Color mode | CMYK |
| Sides | Single-sided |

### SKU description (auto-derived)

```
description = [productType, material, lamination, finishings].filter(not empty).join(', ')

Example:
  productType = "Labels (Roll)"
  material    = "White BOPP"
  lamination  = "Matte"
  finishings  = ["UV Coating"]
  → "Labels (Roll), White BOPP, Matte Lamination, UV Coating"
```

### High-value warning
Triggered when `final_total >= 5,000`. Applies to SDR role (confirm with owner if Sales should also see it).

### Production ticket pricing (different from quote pricing)
The pulse production ticket uses a simpler formula:
```
order_total = quantity × price_per_unit
```
No tax, discount, or prepay at the production ticket level. Those are applied at the quote/order stage in the CRM.

---

## Part 2 — Material Groups

Sourced from `pulse/shared.js → MATERIALS`.  
Materials are organized in groups (categories). Each group contains specific sub-options.

### 16th Street Materials

| Group | Options |
|---|---|
| **BOPP** | Clear BOPP, White BOPP, Silver BOPP, Holo BOPP |
| **Cosmetic Web** | Clear Cosmetic Web, White Cosmetic Web, Silver Cosmetic Web |
| **Label Sheets** | Gloss Label Sheet, Matte Label Sheet, Semi Gloss |
| **Cardstock** | 14pt C1S, 14pt C2S, 16pt C1S, 16pt C2S, 18pt C1S, 18pt C2S, 18pt Silver, 24pt C1S, 24pt C2S |
| **Cover/Text Stock** | 80lb Cover, 100lb Cover, 110lb Cover, 80lb Text, 100lb Text |
| **Cover Stock** | 80lb Cover, 100lb Cover, 110lb Cover |

### Boyd Street Materials

| Group | Options |
|---|---|
| **Cardstock (Boyd)** | 16pt, 18pt, 20pt, 24pt |
| **Vinyl (Boyd)** | White Vinyl, White Vinyl - Aggressive Glue, Holographic Vinyl |
| **Banner Material (Boyd)** | Banner Material |
| **Window Decal Material (Boyd)** | Window Decal |
| **Wallpaper Material (Boyd)** | Self-Adhesive (Peel-and-Stick), Traditional / Unpasted |
| **Sheet (Boyd)** | 18pt (Boyd), 20pt (Boyd), 24pt (Boyd) |
| **Other** | Vinyl |

---

## Part 3 — Product Types & Material Mapping

Sourced from `pulse/shared.js → PRODUCT_TYPES`.  
Product type → facility → allowed material groups → allowed materials.

### 16th Street Products

| Product Type | Material Groups | Specific Materials | Print Type |
|---|---|---|---|
| **Labels (Roll)** | BOPP, Label Sheets | Clear BOPP, White BOPP, Silver BOPP, Holo BOPP, Gloss Label Sheet, Matte Label Sheet, Semi Gloss | Roll |
| **Labels (Sheet)** | Label Sheets | Gloss Label Sheet, Matte Label Sheet, Semi Gloss | Sheet |
| **Pouches** | Cosmetic Web | Clear Cosmetic Web, White Cosmetic Web, Silver Cosmetic Web | Roll |
| **Folding Cartons / Boxes** | Cardstock | 14pt C1S, 14pt C2S, 16pt C1S, 16pt C2S, 18pt C1S, 18pt C2S, 18pt Silver, 24pt C1S, 24pt C2S | Sheet |
| **Business Cards** | Cardstock, Cover Stock | All cardstock + 80lb/100lb/110lb Cover | Sheet |
| **Flyers / Postcards** | Cover/Text Stock, Cardstock | 80lb/100lb/110lb Cover, 80lb/100lb Text + all cardstock | Sheet |
| **Booklets** | Cover/Text Stock | 80lb Cover, 100lb Cover, 110lb Cover, 80lb Text, 100lb Text | Sheet |
| **Diecut Stickers** | BOPP, Label Sheets | Clear BOPP, White BOPP, Silver BOPP, Holo BOPP, Gloss Label Sheet, Matte Label Sheet, Semi Gloss | Sheet |

### Boyd Street Products

| Product Type | Material Groups | Specific Materials | Print Type |
|---|---|---|---|
| **Vinyl Labels / 54'' Rolls** | Vinyl (Boyd) | White Vinyl, White Vinyl - Aggressive Glue, Holographic Vinyl | Roll |
| **Vinyl Signage** | Vinyl (Boyd) | White Vinyl, White Vinyl - Aggressive Glue, Holographic Vinyl | Roll |
| **Banners / Large Format** | Specialty (Boyd) | Window Decal, Wallpaper Material, Banner Material | Roll |
| **Window Decals** | Specialty (Boyd) → Window Decal Material (Boyd) | Window Decal | Roll |
| **Wallpaper** | Specialty (Boyd) → Wallpaper Material (Boyd) | Self-Adhesive (Peel-and-Stick), Traditional / Unpasted | Roll |
| **Sheet Products (Boyd)** | Sheet (Boyd) | 18pt (Boyd), 20pt (Boyd), 24pt (Boyd) | Sheet |

### Both Facilities

| Product Type | Materials | Notes |
|---|---|---|
| **Folding Cartons / Boxes** (Boyd) | Cardstock (Boyd): 16pt, 18pt, 20pt, 24pt | Boyd uses different cardstock weights from 16th Street |
| **Diecut Stickers** (Boyd) | Vinyl (Boyd) | At Boyd, stickers use vinyl instead of BOPP |
| **Other** | All material groups | Catch-all |

### Roll Direction (labels only)
Roll direction is only shown for products with `defaultPrintType = 'Roll'`. Options:
- Direction 1 — Unwind from top
- Direction 2 — Unwind from bottom
- Direction 3 — Unwind left
- Direction 4 — Unwind right

---

## Part 4 — Finishing Options

Sourced from `pulse/shared.js → LAMINATION_OPTIONS` and job-ticket.html.

### Lamination (select)
None, Gloss, Matte, Soft Touch, Holo, Coating

> Note: Labels (Sheet) auto-defaults to Gloss and hides the lamination toggle. Labels do NOT get laminated at Boyd Street.

### Add-on Finishes (toggles/checkboxes)

| Finish | Notes |
|---|---|
| Spot UV | Requires UV file upload |
| Foil | Requires foil file upload + foil color: Gold, Silver, Rose Gold, Holographic, Custom |
| Perforation | Graphtec requires manual knife position adjustment (known issue) |

### Color Modes
CMYK, CMYK + White (white layer requires separate file upload)

> Note: Canon Colorado (Boyd) = CMYK only, Gloss materials. Roland (Boyd) = CMYK + Orange/Red/White/Gloss UV, Matte materials only.

---

## Part 4b — Internal Cost Calculation (Pricing Calculator)

Sourced from `pulse/pricing-calculator-sales.html → calculatePricing()`.

> **Important distinction:** There are TWO separate pricing systems:
> 1. **CRM Quote Pricing** (Part 1) — customer-facing price. Rep enters a unit price manually, system adds discount, tax, shipping, prepay. This is what gets sent to the client.
> 2. **Production Cost Calculator** (this section) — internal tool. Calculates the production cost from press dimensions, item size, and tier tables, so the rep knows *what to charge*. The output is a suggested unit price that the rep then enters into the quote.

### How the cost calculator works

```
1. Rep selects product type → system picks the press (6K / 15K / Boyd)
2. Rep enters item size (width × height) and quantity
3. System calculates:
     fits_per_frame = how many pieces fit on one press frame/sheet
                      (based on press clean area and item dimensions with bleed)
     needed_frames  = ceil(quantity / fits_per_frame)
4. System looks up the frame price from the tier table for needed_frames
5. Charges:
     print_charge    = tier_frame_price × needed_frames
     material_charge = Holo BOPP → +30% of print_charge; other materials → $0
     lamination      = Soft Touch → +10% of print_charge
                       Holo → flat +$20
                       Gloss / Matte / None → $0
     uv_charge       = Labels: built into tier (UV tier vs standard tier)
                       Pouches: +20% of print_charge
                       15K: +$uv_extra per frame (from tier table)
     foil_charge     = Pouches: +20% per foil pass
                       15K: +$foil_extra per frame (from tier table)
     double_sided    = % of print_charge (varies by press mode)
     setup_fee       = manual input (entered by rep)
     cut_fee         = manual_rate × needed_frames
     packaging_fee   = per-piece application fee (see rates below)
6. Total cost = setup + print + material + cut + lamination + UV + foil + pouching + double_sided
7. Suggested price per piece = total / quantity
```

### Press dimensions

| Press | Machine | Clean area | Notes |
|---|---|---|---|
| 6K Labels | HP Indigo 6K | 12" × 39" | 13" × 39" frame; squeeze mode: 12.2" |
| 6K Pouches | HP Indigo 6K + Karlville | 12.24" × 39" usable web | Pouch flat width = (bag_width × 2 + gusset) + bleed |
| 15K Flat/Box/Booklets | HP Indigo 15K | 530mm × 730mm clean | 550mm × 750mm full sheet |
| Boyd Manual | Boyd (Roland / Canon / Graphtec) | 34" × 54" clean | Vinyl, banners, large format |

### Label tier pricing (6K press)

| Min frames | Standard $/frame | With UV $/frame |
|---|---|---|
| 500+ | $3.40 | $4.40 |
| 238+ | $4.20 | $5.20 |
| 120+ | $5.00 | $6.00 |
| 60+ | $5.80 | $7.30 |
| 25+ | $8.50 | $12.50 |
| 13+ | $12.60 | $17.10 |
| 6+ | $20.00 | $40.00 |

The tier is selected by finding the **highest minFrames value that needed_frames still meets or exceeds**.

### Pouch tier pricing (6K + Karlville)

| Min frames | $/frame | UV add-on | Foil add-on (per pass) |
|---|---|---|---|
| 1100+ | $3.20 | +20% of print | +20% of print |
| 550+ | $4.00 | +20% | +20% |
| 275+ | $6.80 | +20% | +20% |
| 110+ | $9.00 | +20% | +20% |
| 55+ | $13.50 | +20% | +20% |

### 15K flat / flyers / booklets / boxes pricing

Uses max-frames tiers (frame count must be ≤ maxFrames to qualify).

| Max frames | Box $/frame | Flat $/frame | UV extra $/frame | Foil extra $/frame |
|---|---|---|---|---|
| ≤ 25 | $14.00 | $12.00 | +$4.00 | +$4.00 |
| ≤ 62.5 | $10.00 | $8.00 | +$3.00 | +$3.00 |
| ≤ 125 | $8.00 | $5.00 | +$2.00 | +$2.00 |
| ≤ 250 | $4.80 | $3.80 | +$1.50 | +$1.50 |
| ≤ 500 | $4.00 | $3.00 | +$1.25 | +$1.25 |
| ≤ 1000 | $3.60 | $2.60 | +$1.00 | +$1.00 |
| ≤ 2000 | $3.40 | $2.40 | +$1.00 | +$1.00 |
| ≤ 3000 | $3.20 | $2.20 | +$1.00 | +$1.00 |
| ≤ 4000 | $3.00 | $2.00 | +$1.00 | +$1.00 |
| ≤ 5000 | $2.80 | $1.80 | +$1.00 | +$1.00 |

### Boyd box pricing

| Max frames | $/frame |
|---|---|
| ≤ 10 | $30.00 |
| ≤ 25 | $28.00 |
| ≤ 62.5 | $25.00 |
| ≤ 125 | $23.00 |
| ≤ 250 | $22.00 |

### Application / packaging service fees

| Container | Rate |
|---|---|
| Jar | $0.10/unit |
| Tube | $0.10/unit |
| 7g–1lb Bag | $0.15/unit |
| Exit Bag | $0.25/unit |
| Large Bag (1lb+) | $0.50/unit |

### Key design question for BazarCRM

> Should the pricing calculator be **embedded inside the OrderDrawer** (so reps see the suggested price per piece while building the quote), or remain a **separate standalone tool**?

- **Option A — Embedded:** Rep enters item size + quantity in the SKU row → system shows suggested unit price from the tier table. Rep can accept or override.
- **Option B — Separate tool:** Rep opens `/pricing-calculator` separately, calculates the price, then enters it manually in the OrderDrawer. Same workflow as today.

This is **owner question P7** — needs a decision before Phase 6 (OrderDrawer build).

---

## Part 5 — Product Name Reconciliation (Shadow vs Pulse)

The shadow project (`sdr-crm-system`) used simplified product names. This table maps them to the correct pulse production names.

| Shadow Project Name | Pulse Production Name | Notes |
|---|---|---|
| Labels (Roll) | Labels (Roll) | Same |
| Labels (Sheet) | Labels (Sheet) | Same |
| Stickers | Diecut Stickers | More specific name |
| Pouches | Pouches | Same |
| Folding Cartons / Boxes | Folding Cartons / Boxes | Same |
| Business Cards | Business Cards | Same |
| Flyer | Flyers / Postcards | Broader name in pulse |
| Booklets | Booklets | Same |
| Vinyl Banners | Banners / Large Format | More general name |
| Canvas Prints | — | Not in pulse — confirm with owner if still offered |
| Jars | — | Not in pulse as product type — jars use labels (application service) |
| Tubes | — | Not in pulse as product type — tubes use labels (application service) |
| — | Vinyl Labels / 54'' Rolls | New — Boyd vinyl roll labels |
| — | Vinyl Signage | New — Boyd vinyl signs/decals |
| — | Window Decals | New — Boyd window graphics |
| — | Wallpaper | New — Boyd wallpaper |
| — | Sheet Products (Boyd) | New — Boyd cardstock sheets |

---

## Part 6 — Admin Products Tab — Technical Spec

### Current state
`/admin/settings/products` tab exists as a planned spec-preview. Three sections are noted: Product types, Materials, Finishes — nothing is built yet.

### Data model recommendation — Dedicated tables

Use separate `product_types` and `materials` tables rather than extending `lookup_values`. Products have relationships (product-to-material links) and may later need pricing rules, images, default impositions, and facility associations.

```sql
-- Product types
create table public.product_types (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  default_print_type  text not null default 'Sheet', -- 'Roll' or 'Sheet'
  facilities          text[] not null default '{16th-street,boyd-street}',
  sort_order          int  not null default 0,
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now()
);

-- Material groups (e.g. "BOPP", "Cardstock", "Vinyl (Boyd)")
create table public.material_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  facility   text,  -- null = both, '16th-street', 'boyd-street'
  sort_order int  not null default 0,
  is_active  boolean not null default true
);

-- Individual materials (e.g. "White BOPP", "14pt C1S")
create table public.materials (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid references public.material_groups(id) on delete set null,
  name             text not null,
  sort_order       int  not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Junction: which materials are valid for which product type
create table public.product_material_links (
  product_type_id  uuid references public.product_types(id) on delete cascade,
  material_id      uuid references public.materials(id) on delete cascade,
  primary key (product_type_id, material_id)
);
```

Laminations, finishings, color modes, and sides continue as `lookup_values` categories — they are simple flat lists and do not need product associations.

### Admin Products tab UI

**Left panel — product list:**
- Table: Name, Print Type, Facilities, Active toggle, Sort order
- "+ Add Product Type" → inline row
- Click a product to select it

**Right panel — materials for selected product:**
- Grouped checklist (grouped by material group)
- Checked = available for this product; uncheck to remove
- Changes save on click (POST/DELETE `product_material_links`)
- "+ Add Material" at bottom → opens modal to add a new material (and optionally link it immediately)

**Second tab/section — standalone lists (flat):**
- Laminations
- Color Modes
- Finishings

**API routes:**
```
GET    /api/admin/product-types                        all product types + linked material IDs
POST   /api/admin/product-types                        create
PATCH  /api/admin/product-types/[id]                   update name / sort / active / facilities
DELETE /api/admin/product-types/[id]                   only if no tickets reference it

GET    /api/admin/materials                            all material groups + materials
POST   /api/admin/materials                            create material
PATCH  /api/admin/materials/[id]                       update
DELETE /api/admin/materials/[id]                       only if no tickets reference it

POST   /api/admin/product-types/[id]/materials/[matId] link material to product type
DELETE /api/admin/product-types/[id]/materials/[matId] unlink

GET    /api/lookups/products                           public read for OrderDrawer
```

**OrderDrawer behavior:**
1. Product Type dropdown loads from `GET /api/lookups/products`
2. When product type changes → material dropdown filters to linked materials, grouped by material group
3. Roll Direction row shows only when selected product has `default_print_type = 'Roll'`
4. If a saved ticket has a material that is no longer linked → show `"{material} (saved)"` at top of dropdown (same pattern as shadow project for legacy values)

---

## Part 6b — Product Pricing Configuration (Admin-Managed)

This is a new requirement: when an admin adds a product type, they should also configure how the production cost is calculated for that product. This keeps pricing rules in the database (admin-managed), not hardcoded.

### What admin configures per product type

| Field | Example | Notes |
|---|---|---|
| Press / Machine | HP Indigo 6K, HP Indigo 15K, Boyd | Drives which tier table is used |
| Pricing mode | Label tiers, Pouch tiers, 15K flat, 15K box, Boyd box, Manual | Selects the correct frame price lookup |
| Frame width (in / mm) | 12" (6K) · 530mm (15K) · 34" (Boyd) | Used to calculate fits per frame |
| Frame height (in / mm) | 39" (6K) · 730mm (15K) · 54" (Boyd) | Used to calculate fits per frame |
| Bleed (in) | 0.24" | Added to each piece before fit calculation |
| Allow rotation | true / false | 15K jobs can rotate for better yield |

### Machine profiles (seed data — pre-populated)

| Machine | Clean width | Clean height | Notes |
|---|---|---|---|
| HP Indigo 6K (Labels) | 12" | 39" | Squeeze mode: 12.2" |
| HP Indigo 6K (Pouches) | 12.24" | 39" | Usable pouch web width |
| HP Indigo 15K | 530mm (20.87") | 730mm (28.74") | Full sheet 550×750mm |
| Boyd (Roland / Canon) | 34" | 54" | Large format |
| Manual | — | — | Rep enters fit count manually |

### Tier tables (seed data — pre-populated, admin can edit)

| Table name | Used for |
|---|---|
| Label (6K) | Labels (Roll), Labels (Sheet), Diecut Stickers, Vinyl Labels |
| Pouch (6K) | Pouches |
| 15K Flat | Flyers / Postcards, Booklets, Business Cards |
| 15K Box | Folding Cartons / Boxes (16th Street) |
| Boyd Box | Folding Cartons / Boxes (Boyd) |
| Manual | Any product without a wired tier table |

Each tier row has: min or max frames threshold, price per frame, UV extra, foil extra.

### Finishing surcharges (admin-managed per product)

| Surcharge | Default rule | Admin can change per product |
|---|---|---|
| Holo BOPP material | +30% of print cost | Yes |
| Soft Touch lamination | +10% of print cost | Yes |
| Holo lamination | +$20 flat | Yes |
| UV | Built into tier (labels) or % of print (pouches) | Yes |
| Foil | % of print cost per pass | Yes |
| Double-sided | % of print cost (varies by press) | Yes |

### New database tables needed

```sql
-- Machine profiles (pre-seeded, admin can view/edit)
create table public.machine_profiles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,          -- 'HP Indigo 6K', 'HP Indigo 15K', 'Boyd'
  frame_width_in  numeric,               -- clean width in inches
  frame_height_in numeric,               -- clean height in inches
  default_bleed   numeric default 0.24,
  is_active       boolean default true
);

-- Pricing tier tables
create table public.pricing_tier_tables (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,   -- 'Label (6K)', '15K Flat', 'Boyd Box', etc.
  kind  text not null    -- 'min-frames' (labels/pouches) or 'max-frames' (boxes/flat)
);

-- Individual tier rows
create table public.pricing_tiers (
  id               uuid primary key default gen_random_uuid(),
  table_id         uuid references public.pricing_tier_tables(id) on delete cascade,
  threshold_frames numeric not null,   -- minFrames or maxFrames depending on kind
  base_price       numeric not null,   -- $/frame base
  uv_extra         numeric default 0,  -- $/frame UV add-on
  foil_extra       numeric default 0,  -- $/frame foil add-on
  sort_order       int default 0
);

-- Link product type to its pricing configuration
alter table public.product_types add column machine_profile_id uuid references public.machine_profiles(id);
alter table public.product_types add column pricing_table_id   uuid references public.pricing_tier_tables(id);
alter table public.product_types add column allow_rotation     boolean default false;

-- Finishing surcharge rules per product type
create table public.product_finishing_surcharges (
  id              uuid primary key default gen_random_uuid(),
  product_type_id uuid references public.product_types(id) on delete cascade,
  trigger_type    text not null,  -- 'material', 'lamination', 'uv', 'foil', 'double_sided'
  trigger_value   text,           -- e.g. 'Holo BOPP', 'Soft Touch' (null = any)
  charge_type     text not null,  -- 'percent_of_print' or 'flat'
  charge_value    numeric not null
);
```

### Updated admin Products tab UI

**When creating or editing a product type, the form has three sections:**

1. **Basic info** — Name, Active, Sort order, Facilities (16th Street / Boyd / Both)
2. **Materials** — checklist of available materials for this product
3. **Pricing config** — Machine profile selector, Tier table selector, Allow rotation toggle, plus a finishing surcharges sub-table

### New owner question (P8)

**P8 — Should pricing tier tables be admin-editable?**

The tier rates (e.g. Labels: 500+ frames = $3.40/frame) are currently business decisions. Should the admin be able to update these rates from the admin panel, or should they be fixed in the database seed and only changeable by a developer?

- [ ] **Admin-editable** — owner can update frame prices, add tiers, adjust UV/foil extras without a code change
- [ ] **Database seed only** — rates are set once via migration; changing them requires a developer

This affects whether the admin Products tab includes a full tier table editor UI.

---

**P1 — Product name alignment**
The pulse system has more specific product names. Should the CRM quote builder use the pulse names, or keep the simplified shadow project names?
- [ ] Use pulse names (e.g. "Diecut Stickers", "Flyers / Postcards", "Banners / Large Format")
- [ ] Keep shadow names (e.g. "Stickers", "Flyer", "Vinyl Banners")

**P2 — Canvas Prints, Jars, Tubes**
These are in the shadow project but NOT in the pulse production system.
- Canvas Prints: are these still quoted through the CRM?
- Jars / Tubes: should these be product types (with label materials), or should labels for jars be handled as "Labels (Roll)" with a note?

**P3 — Boyd Street facility split in the CRM**
The pulse system splits products by facility (16th Street vs Boyd). Should the CRM OrderDrawer also ask for facility, and filter materials accordingly?
- [ ] Yes — ask facility first, then filter materials (matches pulse workflow)
- [ ] No — show all materials for each product type, rep selects manually (simpler)

**P4 — Material groups in the CRM**
Cardstock alone has 9 options (14pt C1S, 14pt C2S, 16pt C1S, etc.). Should these sub-options show in the CRM quote, or should the quote just say "Cardstock" and let production decide?
- [ ] Full sub-options (14pt C1S, etc.) — sales needs this for accurate pricing
- [ ] Group-level only (just "Cardstock") — production handles the weight

**P5 — Should admin be able to add new product types?**
- [ ] Yes — full CRUD on product types from admin panel (no code deploy needed)
- [ ] No — product types are fixed by a developer

**P6 — Default material per product type?**
Should admin be able to set a default material so the field auto-fills when a product is selected?
- [ ] Yes
- [ ] No — rep always selects manually

**P7 — Pricing calculator: embedded in OrderDrawer or separate tool?**
The pulse project has a standalone calculator that suggests a unit price based on press + item size + quantity. Should this be built into the OrderDrawer so reps see it while quoting, or remain a separate page?
- [ ] Embedded in OrderDrawer — rep enters size and qty, sees suggested price inline
- [ ] Separate standalone calculator — rep calculates separately and types the price manually

---

## Part 8 — Updated Build Order

```
Phase 2a:  Migration 041 (extend job_tickets)
Phase 2b:  Types update
Phase 3:   TODO-001 admin override UI fix
Phase 3.5: Admin Products tab (required before OrderDrawer)
           · Migrations: product_types, material_groups, materials, product_material_links
           · Seed data: insert all products + materials from Parts 2–3 above
           · API: /api/admin/product-types, /api/admin/materials, link endpoints, /api/lookups/products
           · UI: components/admin/products-section.tsx
Phase 4:   Ticket API routes
Phase 5:   Utilities (ticket-math, pdf, filters)
Phase 6:   OrderDrawer (loads products/materials from DB, filters dynamically)
Phase 7:   Quotes + Orders pages
Phase 8:   Integration
```
