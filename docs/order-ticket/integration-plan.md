# Tickets Module — Integration Plan

Source analysis: [`shadow-project-findings.md`](./shadow-project-findings.md)  
Open questions: [`open-questions.md`](./open-questions.md)  
Existing BazarCRM spec: [`../feature-specs/tickets.md`](../feature-specs/tickets.md)

> **Status:** Pending owner answers to critical questions in `open-questions.md` (sections A, B, C, D, H).  
> Development starts after those are resolved.

---

## Prerequisites

Before any Tickets code is written, the following must be done:

1. All uncommitted current changes committed (migrations 039/040, hold-reasons constants, component updates).
2. Owner answers recorded for the 4 remaining decisions: **B5** (edit policy), **C4a/C4b** (product lists), **E1** (PDF company info), **H1** (reference number format). Everything else is confirmed from shadow project.
3. This plan updated to reflect the owner's decisions where noted with `[PENDING OWNER ANSWER]`.

---

## Phase 0 — Commit Current Work

Commit all uncommitted changes before any new work:
- `supabase/migrations/039_add_initial_interest_to_leads.sql`
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

## Phase 2 — Schema + Type Alignment

**Blocked by:** B5, C4b, E1, H1 from `open-questions.md` (all others confirmed from shadow project)

### 2a. Migration `041_extend_job_tickets.sql`

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

**RLS policies** — confirmed from shadow (A1/A2: all tickets visible to all):
- Single SELECT policy: `auth.role() = 'authenticated'` — all logged-in users can read all tickets
- INSERT: authenticated users can create tickets
- UPDATE: authenticated users can update tickets (edit guard enforced in application layer per B5)
- Admin bypass follows same pattern as other tables

### 2b. Update `lib/types/index.ts`

- Enrich `QuoteSku` interface: add `product_type`, `material`, `lamination`, `width`, `height`, `design_required`, `die_cut`
- Enrich `JobTicket` interface with all new columns from 2a
- Update `TicketStatus` to add `'Open'`, `'Pending Client Confirmation'`
- Replace `PaymentType` with `PaymentTypeKey = 'card_default' | 'zelle' | 'offline'` — `[PENDING OWNER ANSWER C1]`
- Add `TicketForm` interface for OrderDrawer form state

### 2c. Update `docs/schema.md`
Replace the `job_tickets` table definition with the new expanded version matching migration 041.

---

## Phase 3 — Pre-Build Cleanup: Lead Drawers + CRM Filter

**✅ DONE (2026-05-11)**

### 3a. Remove placeholder Quote/Order tabs from lead drawers

The SDR drawer (`verify-drawer.tsx`) and Sales drawer (`sales-drawer.tsx`) previously had placeholder "Quote" / "Order / Quote" tabs with no functionality. These have been removed. Both drawers now have **two tabs only: Lead Info and History**.

A disabled **"Create Quote / Order"** button has been added to the footer of both drawers. It will be wired to open `<OrderDrawer>` as a stacked modal during Phase 6. Until then it is visually present but non-clickable (`opacity-40`, `cursor-not-allowed`).

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

**Not blocked by any owner questions.** Can be done immediately after Phase 3.

**Files affected:**
- `components/sales-drawer.tsx` — change `const isReadOnly = readOnly || isTerminal` to `const isReadOnly = readOnly || (isTerminal && !isAdmin)`; show amber banner instead of red when `isAdmin && isTerminal`
- `components/verify-drawer.tsx` — same pattern for `isRejected`
- `components/sales-page.tsx` — already passes role info; ensure `isAdmin` prop flows to `<SalesDrawer>`
- `components/leads-page.tsx` — ensure `isAdmin` prop flows to `<VerifyDrawer>`

API is already correct (see `app/api/leads/[id]/route.ts` line ~53 — admin check already in place).

---

## Phase 4 — API Routes

**Blocked by:** H1 (reference number format) only. All scoping/visibility/workflow questions confirmed from shadow project.

### `app/api/tickets/route.ts`

**GET** — list tickets:
- Supports `?kind=quote|order`, `?linked_lead_id=`, `?search=`, `?period=`
- **Scoping: none** — all authenticated users see all tickets (confirmed A1/A2)
- Joins: `customers`, `user_profiles` (created_by)

**POST** — create ticket:
- Requires `title` and at least one SKU for orders
- Auto-generates `reference_code` for orders — format **pending owner answer H1**
- When `ticket_kind = 'quote'` + `requires_client_confirmation = true`: also creates a linked order shell with `ticket_status = 'Pending Client Confirmation'` (confirmed B4)
- Logs `order_ticket_created` activity
- **TODO-002**: if `linked_lead_id` is set, updates lead status (confirmed B2 — no auto-route):
  - ticket has quote SKUs → `status = 'Quoted'`, `sales_status = 'Quote Sent'`
  - order only → `status = 'Validated'`
- Logs `lead_status_changed` activity

### `app/api/tickets/[id]/route.ts`

**GET** — single ticket with joined customer + lead + activity history.

**PATCH** — partial update:
- Strips `created_at` from patch (immutable)
- Activity logging:
  - `quote_approval_last_requested_at` patched → log `quote_approval_requested`
  - `follow_up_completed = true` → log `quote_follow_up_completed`
  - follow-up fields cleared → log `quote_follow_up_reset`
  - `client_confirmed = true` → log `ticket_client_confirmed`
  - Otherwise → log `order_ticket_updated` with `{ fields: string[] }`
- Edit guard: **pending owner answer B5** (always editable vs status-locked)

### `app/api/tickets/counts/route.ts`

**GET** — returns `{ quotes: number, orders: number }` for sidebar badges.
- Same scoping as the list routes.

---

## Phase 5 — Utilities

**Not blocked by owner questions.** Can be built as soon as Phase 2 types are done.

### `lib/utils/ticket-math.ts`
Port from `ContactCRM.jsx`:

```typescript
// Derives human-readable description from SKU fields (never typed by user)
export function quoteSkuDescription(sku: QuoteSku): string

// Normalizes raw SKU array: trims, derives descriptions, computes line_total
export function normalizeQuoteSkus(skus: Partial<QuoteSku>[]): QuoteSku[]

// Full pricing calculation
export function calcQuoteTotals(form: TicketForm): {
  quoteSubtotal: number
  discountAmount: number
  quotePreTaxTotal: number
  quoteTaxAmount: number
  quoteFinalTotal: number
}

// Prepayment split
export function calcPrepaySplit(
  finalTotal: number,
  prepaymentType: string,
  prepaymentValue: string
): { dueNow: number; balance: number } | null

export const HIGH_VALUE_THRESHOLD = 5000  // confirmed from shadow — owner to confirm threshold
export const DEFAULT_TAX_RATE = 8.25      // confirmed from shadow (DEFAULT_QUOTE_TAX_RATE_PERCENT) — owner to confirm
```

### `lib/utils/order-ticket-pdf.ts`
Port from `frontend/src/utils/orderTicketPdf.js` with TypeScript types.
- `export async function downloadOrderTicketPdf(ticket: JobTicket): Promise<void>`
- Dynamic `jspdf` import (keeps it out of the server bundle)
- Company name: **pending owner answer E1** (hardcode from owner's response until Company Info admin tab is built)
- Full field parity with shadow PDF — see `shadow-project-findings.md` section 7

### `lib/utils/ticket-filters.ts`
Port from `statsDateRange.js`:
- `quotedRequestsRowCount(tickets, leads)` — counts quote tickets + quoted leads not linked to a ticket
- `orderTicketsForTab(tickets)` — filters out `Pending Client Confirmation` placeholder orders
- `ticketAmount(ticket)` — `quote_final_total ?? quote_subtotal ?? 0`

---

## Phase 6 — OrderDrawer Component

**Blocked by:** B5, C4b, E1, H1 from `open-questions.md`. All other questions confirmed from shadow project.

**File:** `components/order-drawer.tsx`

The most complex component in this phase. Two modes:

```
Create/Edit mode tabs:   Info → Line Items → Quote
Read-only mode tabs:     Info | Line Items | Quote | History
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
  - `product_type` (select — values confirmed from shadow: Labels Roll/Sheet, Stickers, Pouches, Folding Cartons/Boxes, Business Cards, Flyer, Booklets, Vinyl Banners, Canvas Prints, Jars, Tubes, Other — owner to confirm list C4a)
  - `material` (select — White BOPP, Clear BOPP, Silver BOPP, Paper, Kraft, Vinyl, Cardstock, Other)
  - `lamination` (select — None, Gloss, Matte, Soft Touch, UV, Other)
  - Width × Height (two number inputs, inches)
  - `quantity` (number)
  - `unit_price` (number)
  - `line_total` (computed, read-only display)
  - `design_required` checkbox
  - `die_cut` checkbox
  - Add-on finishings checkboxes: Lamination, UV Coating, Foil, Perforation
- `description` column — derived and shown read-only (never user-typed)
- `+ Add Line` / remove buttons
- High-value warning banner when `quoteFinalTotal >= 5000` (SDR-only per shadow; owner to confirm C3)

### Quote tab
- Pricing summary display (subtotal, shipping, discount, pre-tax, tax, total)
- `quote_shipping` (number input, defaults to 0 — manual entry per shadow C6)
- Discount toggle: `discount_type` radio (percent / fixed) + `discount_value` input + `discount_reason`
- Tax rate input (default 8.25%) + tax exempt toggle + `sales_permit_number`
- Payment types: checkboxes — Card Payment, Zelle, Offline (confirmed C1; card default-checked)
- Prepayment row: `prepayment_type` (percent / fixed, no "None" in edit mode) + `prepayment_value` (default 25%)
- Quote delivery: `quote_channel` + `quote_destination` (input type adapts per channel)
- `requires_client_confirmation` toggle (default: on)
- Follow-up schedule: `quote_reminder_date` + `follow_up_cycles` (default 3) + `follow_up_frequency` (Daily/Every 2 days/Weekly)
- `client_confirmed` toggle — on toggle: logs `ticket_client_confirmed`; linked order shell becomes active (B4 confirmed)

### History tab (read-only mode only)
- `<HistoryTimeline ticketId={ticket.id} />`

### Footer actions
**Create mode:**
- Back / Next (tab navigation)
- Send Quote (`POST /api/tickets` with `ticket_status = 'sent'`, `ticket_kind = 'quote'` + linked order shell if requires_client_confirmation)
- Create Order (`POST /api/tickets` with `ticket_kind = 'order'`, `orderSource = 'direct'`)
- Cancel

**Read/Edit mode:**
- Edit (toggle to edit mode — guard pending B5)
- Save Changes (`PATCH /api/tickets/[id]`)
- Print PDF (`downloadOrderTicketPdf`)
- Mark Won (`ticket_status = 'approved'`, `client_confirmed = true`)
- Cancel Ticket (`ticket_status = 'cancelled'`)
- Close

Dispatches `bazaar:refresh-counts` after every successful save.

---

## Phase 7 — Pages

**No blockers** — two separate pages confirmed (D1 confirmed: keep `/quotes` and `/orders` as separate pages).

### `components/quotes-page.tsx`
Replaces the spec preview in `app/(app)/quotes/page.tsx`.

Table columns: Contact, Type pill (Ticket / Lead Quote), Channel, Quote Total, Status, Follow-up (red if overdue), Created, View button.

Data sources:
1. `GET /api/tickets?kind=quote` → formal quote tickets
2. Leads where `status = 'Quoted'` and no linked quote ticket (quoted by SMS/WhatsApp without a formal ticket)

Opens `<OrderDrawer readOnly initialTicket={ticket}>` on View.

### `components/orders-page.tsx`
Replaces the spec preview in `app/(app)/orders/page.tsx`.

Table columns: Order # (short UUID), Contact, Total, Status pill, Rush badge, Created By, Created, View + Print PDF.

Data source: `GET /api/tickets?kind=order` — filtered by `orderTicketsForTab()` to exclude placeholder "Pending Client Confirmation" shell orders.

Both pages:
- Mobile card layout (per `mobile-table-cards` rule)
- Search + period filter + sort
- Skeleton loader while fetching
- Tab count badges on nav

---

## Phase 8 — Integration

### 8a. SalesDrawer + VerifyDrawer — Wire up "Create Quote / Order" button
The disabled "Create Quote / Order" footer button already exists in both drawers (added in Phase 3a). Phase 8a wires it up: remove `disabled`, add `onClick={() => setOrderDrawerOpen(true)}`, and render `<OrderDrawer>` as a stacked modal pre-filled with the lead's contact data. Follow the exact pattern from the shadow project's `VerifyDrawer.jsx`.

### 8b. Sidebar counts
Update `app/api/sidebar-counts/route.ts` to include:
- `/quotes` badge count = `quotedRequestsRowCount()` (quote tickets + unlinked quoted leads)
- `/orders` badge count = count of open order tickets (`ticket_status NOT IN ('cancelled', 'completed')`)

### 8c. HistoryTimeline labels
In `components/history-timeline.tsx` (or wherever activity labels are mapped), confirm human-readable labels exist for all ticket activity types:
- `order_ticket_created` → "Ticket created"
- `order_ticket_updated` → "Ticket updated"
- `quote_approval_requested` → "Approval requested"
- `quote_follow_up_completed` → "Follow-up completed"
- `quote_follow_up_reset` → "Follow-up rescheduled"
- `ticket_client_confirmed` → "Client confirmed"

### 8d. Statistics integration — `[PENDING OWNER ANSWER F1/F2]`
Update `app/api/dashboard/kpis/route.ts` to include revenue from `quote_final_total` on approved tickets.

---

## File Inventory — New Files to Create

| File | Phase | Notes |
|---|---|---|
| `supabase/migrations/041_extend_job_tickets.sql` | 2a | Adds ~25 new columns + RLS |
| `lib/utils/ticket-math.ts` | 5 | Pricing calc, SKU normalization |
| `lib/utils/order-ticket-pdf.ts` | 5 | PDF export (port from shadow) |
| `lib/utils/ticket-filters.ts` | 5 | Date + kind filtering |
| `components/order-drawer.tsx` | 6 | 3-tab wizard — the core component |
| `components/quotes-page.tsx` | 7 | Quoted Requests list |
| `components/orders-page.tsx` | 7 | Orders list |
| `app/api/tickets/route.ts` | 4 | GET list + POST create |
| `app/api/tickets/[id]/route.ts` | 4 | GET single + PATCH update |
| `app/api/tickets/counts/route.ts` | 4 | Badge counts |

## Files to Modify

| File | Phase | Change |
|---|---|---|
| `lib/types/index.ts` | 2b | Enrich JobTicket, QuoteSku, add TicketForm |
| `docs/schema.md` | 2c | Update job_tickets table definition |
| `components/sales-drawer.tsx` | 3a, 3.5, 8a | ✅ Placeholder tabs removed + disabled CQ button (3a) · Admin override banner (3.5) · Wire up CQ button (8a) |
| `components/verify-drawer.tsx` | 3a, 3.5, 8a | ✅ Placeholder tabs removed + disabled CQ button (3a) · Admin override banner (3.5) · Wire up CQ button (8a) |
| `app/api/customers/route.ts` | 3b | ✅ Filter CRM to routed leads only |
| `components/sales-page.tsx` | 3 | Pass isAdmin to SalesDrawer |
| `components/leads-page.tsx` | 3 | Pass isAdmin to VerifyDrawer |
| `app/api/sidebar-counts/route.ts` | 8b | Add /quotes and /orders counts |
| `app/(app)/quotes/page.tsx` | 7 | Replace spec preview with real component |
| `app/(app)/orders/page.tsx` | 7 | Replace spec preview with real component |
| `docs/CHANGELOG.md` | each phase | Update as each phase completes |
