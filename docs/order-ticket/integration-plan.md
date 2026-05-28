# Tickets Module — Integration Plan

Source analysis: [`shadow-project-findings.md`](./shadow-project-findings.md)  
Open questions: [`open-questions.md`](./open-questions.md)  
Existing BazarCRM spec: [`../feature-specs/tickets.md`](../feature-specs/tickets.md)

> **Status:** Phases 0–7 complete as of 2026-05-12. Phase 8 (Dashboard integration + PDF export) is next.  
> See `open-questions.md` for the full decision log and the three key design changes from the shadow project.  
> **Key design change (Phase 6):** OrderDrawer replaced with dedicated pages — `/quotes/new`, `/quotes/[id]`.

---

## Prerequisites

Before any Tickets code is written, the following must be done:

1. ✅ All uncommitted current changes committed (migrations 039/040, hold-reasons constants, component updates).
2. ✅ Owner answers recorded — all decisions resolved in the 2026-05-11 review session.
3. ✅ This plan updated to reflect owner decisions.

---

## Phase 0 — Commit Current Work ✅ DONE

Committed before Phase 1:
- `supabase/migrations/039_add_initial_interest_to_leads.sql` — **superseded:** column removed by `077_drop_initial_interest.sql` (May 2026)
- `supabase/migrations/040_fix_activities_by_user_fkey.sql`
- `lib/constants/hold-reasons.ts`
- All modified components: `hold-sub-form.tsx`, `verify-drawer.tsx`, `sales-drawer.tsx`, `sales-page.tsx`, `leads-page.tsx`, `components/ui/*`
- Updated docs: `CHANGELOG.md`, `TODO.md`, `docs/schema.md`, `docs/feature-specs/leads-sdr.md`

---

## Phase 1 — Documentation (Complete)

The following files have been created:

- `docs/order-ticket/shadow-project-findings.md` — Full analysis of `sdr-crm-system` POC
- `docs/order-ticket/open-questions.md` — All questions for the owner
- `docs/order-ticket/integration-plan.md` — This file

---

## Phase 2 — Schema + Type Alignment ✅ DONE (2026-05-12)

Key additions beyond the original plan: products catalog (`041`), `order_sequence_counters` table, `company_settings` table, and admin-managed order/quote dropdowns.

### 2a. Migration `042_extend_job_tickets.sql` ✅

Add missing columns to `job_tickets` (identified by comparing shadow project model with current schema):

```sql
alter table public.job_tickets
  -- Identity
  add column if not exists title                  text,
  add column if not exists reference_code         text,
  add column if not exists contact_phone          text,

  -- Quote delivery
  add column if not exists quote_channel          text,
  add column if not exists quote_destination      text,

  -- Richer pricing
  add column if not exists quote_subtotal         numeric,
  add column if not exists quote_shipping         numeric default 0,
  -- Migration 091 (May 2026): requires_shipping, ship_to_line1 … ship_to_zip
  add column if not exists discount_type          text,
  add column if not exists discount_value         text,
  add column if not exists discount_reason        text,
  add column if not exists quote_pre_tax_total    numeric,
  add column if not exists quote_tax_rate_percent numeric,
  add column if not exists quote_tax_amount       numeric,
  add column if not exists quote_final_total      numeric,
  add column if not exists tax_exempt             boolean not null default false,
  add column if not exists sales_permit_number    text,

  -- Payment (replaces single payment_type with array)
  add column if not exists quote_payment_types    text[] not null default '{}',
  add column if not exists prepayment_type        text,
  add column if not exists prepayment_value       text,

  -- Follow-up (extends existing follow_up_at)
  add column if not exists quote_reminder_date    date,
  add column if not exists follow_up_cycles       int,
  add column if not exists follow_up_frequency    text,

  -- Order-specific
  add column if not exists order_source           text,
  add column if not exists due_date               date,
  add column if not exists priority               text,
  add column if not exists special_requirements   text,
  add column if not exists design_required        boolean not null default false,
  add column if not exists die_cut                boolean not null default false;
```

Keep existing columns (`subtotal`, `discount_percent`, `discount_amount`, `total`, `payment_type`, `prepay_amount`, `follow_up_at`) as nullable for backwards compatibility.

**RLS policies** — owner decision (A1/A2: scoped visibility, not shared):
- SELECT policy: `created_by = auth.uid() OR user_role = 'admin'` — each rep sees only their own tickets; admin sees all
- INSERT: authenticated users can create tickets
- UPDATE: authenticated users can update tickets (edit guard enforced in application layer per B5 — locked once order status reached)
- Admin bypass follows same pattern as other tables

> **Note:** This differs from the shadow project which had no RLS filter. The customer/contact detail page will show all tickets for that customer regardless of creator — this is a UI-level join, not a policy exception.

### 2b. Update `lib/types/index.ts` ✅

- Enriched `QuoteSku` interface: added `product_type`, `material`, `lamination`, `width`, `height`, `design_required`, `die_cut`, `finishing[]`
- Enriched `JobTicket` interface with all 28 new columns from 2a
- Added `'Open'` and `'Pending Client Confirmation'` to `TicketStatus`
- Replaced `PaymentType` with `PaymentTypeKey = 'card_default' | 'zelle' | 'offline'` (owner decision C1)
- Added `TicketForm` interface for OrderDrawer form state
- Added `CompanySettings` interface matching migration 045

### 2c. Update `docs/schema.md` ✅
Expanded `job_tickets` definition, added `order_sequence_counters`, `company_settings`, product catalog tables, and all new RLS policies.

### 2d. Migrations 041–045 ✅ (all applied 2026-05-12)

| Migration | Description |
|---|---|
| `041_create_products_catalog.sql` | product_types, material_groups, materials, product_material_links with 15 types + 37 materials seeded |
| `042_extend_job_tickets.sql` | 28 new columns on job_tickets + order_sequence_counters + scoped per-user RLS |
| `043_fix_admin_rls_full_access.sql` | Admin full access on all tables; tightened product catalog policies; explicit no-delete rules for tickets/leads/activities |
| `044_seed_order_lookup_values.sql` | 7 new order/quote lookup categories seeded |
| `045_create_company_settings.sql` | company_settings single-row table (branding, address, order defaults) |

### 2e. Admin panel tabs for products + dropdowns + company ✅

| Component | Route | Purpose |
|---|---|---|
| `components/admin/products-section.tsx` | Admin → Products | Manage product types, material groups, materials |
| `components/admin/dropdowns-section.tsx` | Admin → Dropdown Options | Add/edit/deactivate/delete any lookup_value |
| `components/admin/company-section.tsx` | Admin → Company Info | Edit branding, address, and order defaults |
| `app/api/admin/materials/route.ts` + `[id]/route.ts` | REST | CRUD for materials |
| `app/api/admin/material-groups/route.ts` + `[id]/route.ts` | REST | CRUD for material groups |
| `app/api/admin/product-types/route.ts` + `[id]/route.ts` | REST | CRUD for product types |
| `app/api/admin/lookups/route.ts` + `[id]/route.ts` | REST | CRUD for lookup_values (with in-use safety check on delete) |
| `app/api/admin/company/route.ts` | REST | GET + PATCH for company_settings |
| `app/api/lookups/products/route.ts` | REST (authenticated + MFA) | Quote form / OrderDrawer product lookup |

---

## Phase 3 — Pre-Build Cleanup: Lead Drawers + CRM Filter

**✅ DONE (2026-05-11)**

### 3a. Remove placeholder Quote/Order tabs from lead drawers

The SDR drawer (`verify-drawer.tsx`) and Sales drawer (`sales-drawer.tsx`) previously had placeholder "Quote" / "Order / Quote" tabs with no functionality. These have been removed. Both drawers now have **two tabs only: Lead Info and History**.

A **"Create Quote / Order"** button is in the footer of both drawers. As of Phase 6 it is fully wired: clicking it saves the lead silently then navigates to `/quotes/new?lead_id=<id>`.

> **Pattern confirmed from shadow project:** The `VerifyDrawer` and `SalesDashboard` in the shadow project never embedded quote/order content inside the lead drawer tabs. A footer button opened the `OrderDrawer` as a separate, stacked modal (`stackZIndex={2500}`). BazarCRM mirrors this exactly.

### 3b. CRM page — filter customers to routed leads only

`GET /api/customers` previously returned every customer record regardless of lead state, meaning contacts from Pending / On Hold / Rejected leads polluted the CRM page.

**Fix applied:** `app/api/customers/route.ts` now filters to customers that have **at least one lead with `status = "Routed"` or a non-null `sales_status`**. A customer enters the CRM the moment the SDR routes the lead to Sales.

| Lead state | Visible in CRM? |
|---|---|
| Pending (SDR inbox) | No |
| On Hold (SDR side, not yet routed) | No |
| Rejected | No |
| Routed | **Yes** |
| Any Sales status (Ongoing / Won / Dropped / On Hold) | **Yes** |

---

## Phase 3.5 — Pre-Build Fix: TODO-001 (Admin Override for Terminal Leads)

**⏳ PENDING — deferred until after Phase 5.** Not blocked by owner questions; can be done anytime.

**Files affected:**
- `components/sales/sales-drawer.tsx` — change `const isReadOnly = readOnly || isTerminal` to `const isReadOnly = readOnly || (isTerminal && !isAdmin)`; show amber banner instead of red when `isAdmin && isTerminal`
- `components/leads/verify-drawer.tsx` — same pattern for `isRejected`
- `components/sales/sales-page.tsx` — already passes role info; ensure `isAdmin` prop flows to `<SalesDrawer>`
- `components/leads/leads-page.tsx` — ensure `isAdmin` prop flows to `<VerifyDrawer>`

API is already correct (see `app/api/leads/[id]/route.ts` line ~53 — admin check already in place).

---

## Phase 4 — API Routes ✅ DONE (2026-05-12)

### Files built

| File | Purpose |
|---|---|
| `app/api/tickets/route.ts` | `GET` list (scoped per user/admin) + `POST` create (auto ORD-YYYY-NNN, activity logging, linked lead status update) |
| `app/api/tickets/[id]/route.ts` | `GET` single ticket with joined lead/customer + `PATCH` update (edit guard: locked once order status, only admin can modify) |
| `app/api/tickets/counts/route.ts` | `GET` lightweight counts for tab badges: `{ drafts, sent, approved, orders, total }` |
| `app/api/activities/route.ts` | `GET` combined lifetime history: `?lead_id=` or `?ticket_id=` or `?ticket_id=&include_linked_lead=true` (merges lead + ticket activities chronologically, adds `_source` field) |
| `supabase/migrations/046_order_sequence_function.sql` | `increment_order_sequence(p_year)` — atomically increments `order_sequence_counters` for ORD-YYYY-NNN generation |

---

## Phase 5 — Utilities ✅ DONE (2026-05-12, partial)

### `lib/utils/ticket-math.ts` ✅
Pure pricing helpers used by both the create form and the detail page:

```typescript
computePricing(inputs: PricingInputs): PricingResult   // subtotal → shipping → discount → pre-tax → tax → final
skuLineTotal(sku: QuoteSku): number                    // qty × unit_price, rounded to 2dp
formatCurrency(value: number): string                  // USD formatted string
```

### `lib/utils/order-ticket-pdf.ts` ⏳ Phase 8
Port from `frontend/src/utils/orderTicketPdf.js` — deferred to Phase 8.

### `lib/utils/ticket-filters.ts` ⏳ Phase 8
Client-side filtering helpers — deferred to Phase 8.

---

## Phase 6 — Quote & Order Pages (design change: dedicated pages, not a modal)

> **⚠️ Design change from original plan (2026-05-12):** The OrderDrawer stacked modal is replaced with **dedicated full pages**. This is better UX for a complex multi-tab form and allows deep-linking, browser history, and side-by-side lead info.

**Flow:**
1. Sales/SDR clicks **"Create Quote / Order"** in the lead drawer → lead is saved silently → browser navigates to `/quotes/new?lead_id=xxx`
2. New quote page shows a **lead info card** (contact, company, urgency, product interests + quantities) + the full form
3. On save → navigates to `/quotes/[id]` (the ticket's permanent page)
4. If the quote is converted to an order → same `/quotes/[id]` page reflects the updated status (no separate `/orders/[id]` redirect needed since it is the same record)

**Files:**
- `app/(app)/quotes/new/page.tsx` — server shell, reads `lead_id` from searchParams
- `components/quotes/new-quote-form.tsx` — full create form (client component)
- `app/(app)/quotes/[id]/page.tsx` — server shell, loads ticket + lead
- `components/quotes/quote-detail.tsx` — view/edit/read-only (client component)

Two modes:

```
Create mode tabs:    Info → Line Items → Quote
View/Edit mode tabs: Info | Line Items | Quote | History
```

### Info tab
- `title` (text, required)
- Contact section: pre-filled from lead (locked) or searchable from CRM
- `order_source` (quoted / direct)
- `priority` (Low / Normal / High)
- `due_date` (date picker)
- `special_requirements` (textarea)
- `rush` (toggle)
- `design_required` (toggle, auto-set from SKUs)
- `die_cut` (toggle, auto-set from SKUs)

### Line Items tab
- Dynamic SKU grid rows:
  - `product_type` (select — values read from Admin → Products; use production names confirmed by owner C4a: Diecut Stickers, Flyers/Postcards, Banners/Large Format, etc. Canvas Prints/Jars/Tubes are not seeded initially)
  - `material` (select — read from Admin → Products; no facility filter per owner C4c)
  - `lamination` (select — None, Gloss, Matte, Soft Touch, Holo, Coating)
  - Width × Height (two number inputs, inches)
  - `quantity` (number)
  - `unit_price` (number — rep enters manually; no calculator integration this phase per owner Q17)
  - `line_total` (computed, read-only display)
  - `design_required` checkbox
  - `die_cut` checkbox
  - Add-on finishings checkboxes: Spot UV, Foil, Perforation
- `description` column — derived and shown read-only (never user-typed)
- `+ Add Line` / remove buttons
- **High-value hard block (owner decision C3/Q8):** When `quoteFinalTotal >= company_settings.high_value_threshold` AND `user_role = 'SDR'`: hide "Send Quote" button entirely; show "Route to Sales Pipeline" button only. This is not a warning banner — it is a hard block. Admin and Sales reps are not blocked.

### Quote tab
- Pricing summary display (subtotal, shipping, discount, pre-tax, tax, total)
- **Fulfillment (May 2026):** Pickup vs Ship; `quote_shipping` manual when Ship (required > 0); optional `ship_to_*` address
- Discount toggle: `discount_type` radio (percent / fixed) + `discount_value` input + `discount_reason`
- Tax rate input (pre-filled from `company_settings.default_tax_rate` — admin-configurable, not hardcoded) + tax exempt toggle + `sales_permit_number`
- Payment types: checkboxes — Card Payment, Zelle, Offline (confirmed C1; card default-checked)
- Prepayment row: `prepayment_type` (percent / fixed, no "None" in edit mode) + `prepayment_value` (default 25%)
- Quote delivery: `quote_channel` + `quote_destination` (input type adapts per channel)
- **No `requires_client_confirmation` toggle** — the shadow project's dual-record model is not used (owner decision B4). The quote ticket transitions to order status in place.
- Follow-up schedule: `quote_reminder_date` + `follow_up_cycles` (default 3) + `follow_up_frequency` (Daily/Every 2 days/Weekly)
- `client_confirmed` toggle — on toggle: logs `ticket_client_confirmed`; transitions ticket from quote to order status (B4 design change)

### History tab (read-only mode only)
- Full lifetime history — combined lead activities + ticket activities, sorted chronologically, oldest first
- Each entry shows: icon, human-readable label, actor name, detail line, **Lead / Ticket source badge**, time
- Grouped by date with separators
- Auto-refreshes on `bazaar:activities-changed` event

### Footer actions (as built)
**Create mode (`/quotes/new`):**
- Back / Next tab navigation
- Save Draft (`POST /api/tickets` → `ticket_status = 'draft'`) — always available
- Save & Send Quote (`POST /api/tickets` → `ticket_status = 'sent'`) — available on Quote tab

**View mode (`/quotes/[id]`):**
- Edit button (toggle edit mode — only shown for non-order, non-cancelled tickets)
- Save Changes (`PATCH /api/tickets/[id]`)
- Send Quote (`PATCH` → `ticket_status = 'sent'`) — shown when in draft
- Mark Won (`PATCH` → `ticket_status = 'approved'`)
- Cancel Ticket (`PATCH` → `ticket_status = 'cancelled'`)

Dispatches `bazaar:refresh-counts` after every successful save.

---

## Phase 7 — Pages ✅ DONE (2026-05-12)

### `components/quotes/quotes-page.tsx` ✅
Replaces the spec preview in `app/(app)/quotes/page.tsx`.

- Tabs: All / Draft / Sent / Won / Routed to Sales — count badge on every tab
- Data: `GET /api/tickets?kind=quote` (slim list — no `quote_skus` on list load)
- Counts: `GET /api/tickets/counts`
- Realtime: `bazaar:tickets-changed` via sidebar (no page-level Supabase channel)
- Clicking row or View navigates to `/quotes/[id]`

### `components/orders/orders-page.tsx` ✅
Replaces the spec preview in `app/(app)/orders/page.tsx`.

- Tabs: All / Pending Payment / Cancelled — count badge on every tab (default: Pending Payment)
- Data: `GET /api/orders/orders` (slim scoped list — not full `/api/tickets`)
- Counts: `GET /api/tickets/counts` (orders + cancelled buckets)
- Realtime via `bazaar:tickets-changed`
- Navigates to `/orders/[id]`

### Sidebar badges ✅
`app/api/sidebar-counts/route.ts` updated — `/quotes` and `/orders` nav items now show live count badges.

### Realtime for job_tickets ✅
`supabase/migrations/047_enable_job_tickets_realtime.sql` — `REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE job_tickets`. Without this migration, the sidebar's `tickets-realtime` channel connects but never receives events.

---

## Phase 8 — Integration (⏳ Next)

### 8a. ~~SalesDrawer + VerifyDrawer — Wire up "Create Quote / Order" button~~ ✅ DONE in Phase 6
Both drawers now save the lead silently and navigate to `/quotes/new?lead_id=<id>`.

### 8b. ~~Sidebar counts~~ ✅ DONE in Phase 7

### 8c. HistoryTimeline activity labels ✅ DONE in Phase 6
Implemented directly in `components/quotes/quote-detail.tsx` `HistorySection`. Human-readable labels + icons for all ticket and lead activity types.

### 8d. Dashboard revenue integration ⏳
Update `app/api/dashboard/kpis/route.ts` to include revenue from `quote_final_total` on approved/active tickets:
- Each rep sees only their own revenue totals (filter by `created_by = auth.uid()`)
- Admin sees all reps' totals
- Data surfaces on Dashboard (not a separate Statistics page — owner decision F1)

### 8e. PDF export ⏳
`lib/utils/order-ticket-pdf.ts` — port from shadow project's `orderTicketPdf.js`:
- `downloadOrderTicketPdf(ticket: JobTicket): Promise<void>`
- Dynamic `jspdf` import (server-bundle safe)
- Company name, address, phone, email, logo from `company_settings` (owner decision E1/Q14/Q15)
- Wire Print PDF button on `/quotes/[id]` detail page

### 8f. High-value hard block for SDRs ⏳
When `quoteFinalTotal >= company_settings.high_value_threshold` AND `user_role = 'SDR'`: hide "Send Quote" button, show "Route to Sales Pipeline" only. Not yet implemented in `new-quote-form.tsx` or `quote-detail.tsx`.

---

## File Inventory — As Built

| File | Phase | Status |
|---|---|---|
| `supabase/migrations/041_create_products_catalog.sql` | 2 | ✅ |
| `supabase/migrations/042_extend_job_tickets.sql` | 2 | ✅ |
| `supabase/migrations/043_fix_admin_rls_full_access.sql` | 2 | ✅ |
| `supabase/migrations/044_seed_order_lookup_values.sql` | 2 | ✅ |
| `supabase/migrations/045_create_company_settings.sql` | 2 | ✅ |
| `supabase/migrations/046_order_sequence_function.sql` | 4 | ✅ (push pending) |
| `supabase/migrations/047_enable_job_tickets_realtime.sql` | 7 | ✅ (push pending) |
| `lib/utils/ticket-math.ts` | 5 | ✅ |
| `lib/utils/order-ticket-pdf.ts` | 8e | ⏳ |
| `lib/utils/ticket-filters.ts` | 8d | ⏳ |
| `app/api/tickets/route.ts` | 4 | ✅ |
| `app/api/tickets/[id]/route.ts` | 4 | ✅ |
| `app/api/tickets/counts/route.ts` | 4 | ✅ |
| `app/api/activities/route.ts` | 4 | ✅ |
| `app/(app)/quotes/new/page.tsx` | 6 | ✅ |
| `components/quotes/new-quote-form.tsx` | 6 | ✅ |
| `app/(app)/quotes/[id]/page.tsx` | 6 | ✅ |
| `components/quotes/quote-detail.tsx` | 6 | ✅ |
| `components/quotes/quotes-page.tsx` | 7 | ✅ |
| `components/orders/orders-page.tsx` | 7 | ✅ |

## Files Modified

| File | Phase | Change |
|---|---|---|
| `lib/types/index.ts` | 2b | ✅ Enriched JobTicket, QuoteSku, TicketForm, CompanySettings |
| `docs/schema.md` | 2c | ✅ Updated job_tickets, added new tables and RLS |
| `components/sales/sales-drawer.tsx` | 3a, 6 | ✅ Tabs removed · CQ button wired (save → navigate) |
| `components/leads/verify-drawer.tsx` | 3a, 6 | ✅ Tabs removed · CQ button wired (save → navigate) |
| `app/api/customers/route.ts` | 3b | ✅ Filter CRM to routed leads only |
| `app/api/sidebar-counts/route.ts` | 7 | ✅ Added /quotes and /orders badge counts |
| `components/sales/sales-page.tsx` | 3 | Pass isAdmin to SalesDrawer |
| `components/leads/leads-page.tsx` | 3 | Pass isAdmin to VerifyDrawer |
| `app/api/sidebar-counts/route.ts` | 8b | Add /quotes and /orders counts |
| `app/(app)/quotes/page.tsx` | 7 | Replace spec preview with real component |
| `app/(app)/orders/page.tsx` | 7 | Replace spec preview with real component |
| `docs/CHANGELOG.md` | each phase | Update as each phase completes |
