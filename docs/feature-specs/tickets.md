# Feature Spec — Tickets (Quotes & Orders)

Routes: `/quotes` · `/orders` · `/quotes/new` · `/quotes/[id]`

> **Status: Built** — all phases complete as of 2026-05-13.  
> Original design used an OrderDrawer modal. **Revised design uses dedicated full pages** (better UX, deep-linkable, side-by-side lead info).

---

## Overview

The Tickets module manages all job tickets: quotes sent to clients and production orders. Both use the same `job_tickets` table, distinguished by `ticket_kind` (`'quote'` | `'order'`) and `ticket_status`.

### Ticket Status Flow

```
[New Quote Created]
  └─ draft  ──► sent ──► approved (Won) ──► order ──► in_production ──► completed
       │
       └─ [SDR total > HV threshold] ──► routed ──► [Sales claims] ──► draft (new owner)
```

- `draft` — in progress, not yet sent to client
- `sent` — quote delivered to client; awaiting approval
- `approved` — client approved (transitions to Order page)
- `routed` — SDR's quote exceeded High-Value Threshold; routed to Sales for claiming
- `order` — confirmed order, in production queue
- `cancelled` — terminal; no payment recorded

---

## Entry Points for New Quotes

A new quote can be started from three places. The entry point controls the UI shown:

| Entry | URL | Customer Tab | Left Sidebar |
|-------|-----|:---:|---|
| From a **Lead** (SDR Verify or Sales drawer) | `/quotes/new?lead_id=<uuid>` | Hidden | `LinkedLeadCard` (read-only lead info) |
| From **CRM** ("Add Quote" button) | `/quotes/new?first_name=...&last_name=...&email=...&phone=...&company=...` | Hidden | Customer info card (read-only) |
| From **Quotes page** ("New Quote" button) | `/quotes/new` | Shown (step 1) | Nothing |

---

## `/quotes` — Quoted Requests page

**Component:** `components/quotes-page.tsx`

### Tabs (count badge on all tabs)

| Tab | Filter | Visible to |
|-----|--------|-----------|
| All | All non-order, non-routed tickets | All roles |
| Draft | `ticket_status = 'draft'` | All roles |
| Sent | `ticket_status = 'sent'` | All roles |
| Won | `ticket_status = 'approved'` | All roles |
| **Routed to Sales** | `ticket_status = 'routed'` | Sales + Admin only |

**Table columns (standard tabs):** Contact, Title, Channel, Total, Status pill, Follow-up (red if overdue), Created

**Routed to Sales tab columns:** Contact, Title, Total (warning color), Routed By (SDR name), Date, Claim button

**Behaviors:**
- Search: contact name, company, title, reference code
- Row click → `/quotes/[id]`
- Realtime: Supabase `postgres_changes` channel on `job_tickets` + `bazaar:tickets-changed` window event → silent refresh on any change from any session
- Claim action: `PATCH /api/tickets/[id]` with `{ claim_ownership: true }` → sets `ticket_status = 'draft'`, `created_by_id = claimant`, redirects to quote detail

### Sidebar badge (`/quotes`)

- **SDR:** count of `draft` + `sent` + `approved` tickets (own)
- **Sales/Admin:** same + count of all `routed` tickets

---

## `/orders` — Orders page

**Component:** `components/orders-page.tsx`

### Tabs (count badge on all tabs)

| Tab | Filter |
|-----|--------|
| All | `ticket_status = 'order'` |
| Active | `ticket_status = 'order'` AND `in_production = false` |
| Won | `ticket_status = 'completed'` |
| Cancelled | `ticket_status = 'cancelled'` |

> **Note:** `draft`, `sent`, `approved`, and `routed` tickets do NOT appear on the Orders page. They belong to the Quotes page only. The Orders page shows only tickets that have been fully confirmed as orders.

**Table columns:** Order # (ORD-YYYY-NNN), Contact, Title (⚡ Rush), Total, Priority (colour-coded), Due Date (orange = due soon, red = overdue), Status pill, Created

**Behaviors:**
- Search: contact name, company, title, reference
- Row click → `/quotes/[id]`
- No "New Order" button — orders are always created from the Quotes flow
- Realtime: listens to `bazaar:tickets-changed`

---

## `/quotes/new` — New Quote

**Component:** `components/new-quote-form.tsx`

### Layout

| | With Lead / CRM params | Without params |
|--|--|--|
| Left sidebar | Read-only lead/customer card | None |
| Main area | 3-tab form (Info, Line Items, Quote) | 4-tab form (Customer, Info, Line Items, Quote) |
| Starting tab | Info | Customer |

### Customer Tab (only shown when no lead/CRM params)

- First Name \* (required)
- Last Name \*
- Email (EmailInput component)
- Phone (PhoneInput component)
- Company

> This data is **not saved to DB** until the user clicks Save Draft (from Line Items tab) or Save & Send Quote. Customer is upserted into `customers` table at save time so they appear in CRM.

### Info Tab

- Title \* (required)
- Priority (Low / Normal / High — from `ticket_priority` lookup; **Urgent** is system-set and filtered from user-facing dropdown)
- Due Date (custom DatePicker, click anywhere on input to open)
- Rush toggle
- Special Requirements
- Internal Notes

### Line Items Tab

Each SKU row:

| Row | Left | Right |
|-----|------|-------|
| 1 | Product Type \* | Material \* |
| 2 | Width (in) \* | Height (in) \* |
| 3 | Color Mode | Sides |
| 4 | Quantity \* | Unit Price ($) \* |
| 5 | Lamination | Roll Direction |

- Line price banner (qty × unit price)
- Add-on Finishings (UV Coating, Foil, Perforation checkboxes — pill/chip style)
- Design on file + Die Cut checkboxes (pill/chip style)
- Line Item Comment (free-text)
- Add Line Item — full-width dashed button (no icon)

**Validation:** At least one line item must be fully filled (product type + qty + unit price > 0) before advancing to Quote tab or saving.

### Quote Tab

- **Pricing Summary** (live — updates as you type): Subtotal → Shipping → Discount → Pre-tax Total → Tax → **Total** (gold)
- **Adjustments card**:
  - Row 1: Shipping ($) + Tax Rate (%) inputs
  - Row 2: Discount selector (None / % / $) + Tax Exempt toggle; conditional inputs when active
  - "Sales permit #" input shown when Tax Exempt is selected
- **Order Flow** (segmented control): **Quote First** | **Direct Order**
  - Quote First → shows "Send Quote to Customer" section (Send Via dropdown + destination field)
  - Direct Order → shows Payment Methods immediately
- **Payment Methods** (single-select, from `ticket_payment` lookup)
- **Send Quote to Customer** (if Quote First): Send Via + destination
- **Follow-up Schedule**: First Reminder date, Cycles (default 3), Frequency

### Validation before advancing

| Tab | Required before Next |
|-----|----------------------|
| Customer | First Name |
| Info | Title |
| Line Items | ≥ 1 fully filled item (product + qty + unit price) |

### High-Value Threshold (HVT) — SDR only

When an SDR advances from Line Items → Quote tab **and** `pricing.final_total > company_settings.high_value_threshold`:

1. A **non-dismissible blocking modal** appears
2. Displays the total, the threshold, and a 30-second countdown
3. On "OK" click or countdown reaching 0: quote is saved with `ticket_status = 'routed'` and SDR is redirected to `/quotes`
4. The routed quote appears in the "Routed to Sales" tab for all Sales/Admin users

### Footer actions

| Button | Condition | Effect |
|--------|-----------|--------|
| Back | Any tab (hidden on first tab if Customer tab is first) | Previous tab |
| Next | Any tab before Quote | Validate + advance |
| Save Draft | Line Items tab onwards | `POST /api/tickets` with `status = 'draft'` |
| Save & Send Quote | Quote tab | `POST /api/tickets` with `status = 'sent'`; redirects to `/quotes` |
| Cancel | Any | Navigate back |

---

## `/quotes/[id]` — Quote / Order Detail

**Component:** `components/quote-detail.tsx`

### Header (sticky)

- Back button
- Title + reference code badge (ORD-YYYY-NNN for orders)
- Status pill
- Edit button (shown for non-locked tickets) / Save Changes + Cancel (edit mode)

### Layout

- **Left sidebar** (sticky): `LinkedLeadCard` if lead is linked; `CustomerInfoCard` if customer exists but no lead; nothing if neither
- **Right**: 4-tab view (Info | Line Items | Quote | History)

### Info Tab

Same fields as new-quote Info tab. Read-only view or edit mode.

### Line Items Tab

Read-only: product, material, size, qty, unit price, line total.  
Edit mode: full SKU rows.

### Quote Tab

Read-only: pricing summary + delivery/payment details.  
Edit mode: full Quote tab fields matching new-quote-form layout.  
Includes the **Order Flow** segmented control (Quote First / Direct Order).

### History Tab

- Full lifetime of the record (lead activities + ticket activities), merged chronologically
- Date separators
- Per-event icons, human-readable labels, actor name, relative timestamp
- Auto-refreshes on `bazaar:activities-changed`

### Action bar (read-only mode)

| Action | Condition | Effect |
|--------|-----------|--------|
| Send Quote | `status = 'draft'` | `PATCH → ticket_status = 'sent'` |
| Mark Won | `status = 'draft'` or `'sent'` | `PATCH → ticket_status = 'approved'` |
| Cancel Ticket | any non-locked | `PATCH → ticket_status = 'cancelled'` |

### Edit lock

Reps cannot edit tickets in `order` or `cancelled` status.

### High-Value Threshold (HVT) — SDR editing draft

When an SDR clicks "Save Changes" on a `draft` quote and `pricing.final_total > company_settings.high_value_threshold`:

1. Same non-dismissible blocking modal (30-second countdown)
2. On "OK" or timeout: ticket PATCH'd to `routed`, SDR redirected to `/quotes`

### Realtime

- Direct Supabase `postgres_changes` channel on `job_tickets` (within the component, independent of sidebar) — silent re-fetch
- `bazaar:leads-changed` → silent re-fetch (updates lead info card)
- `bazaar:activities-changed` → refreshes History tab

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/tickets` | GET | List tickets. SDRs see own. Sales/Admin see own + all `routed`. `kind`, `search` params. |
| `POST /api/tickets` | POST | Create ticket. Upserts customer. Auto-generates ORD-YYYY-NNN for orders. Logs activity. Updates linked lead status. Accepts `ticket_status = 'routed'` for HVT saves. |
| `GET /api/tickets/[id]` | GET | Single ticket. Sales/Admin can GET `routed` tickets they don't own. |
| `PATCH /api/tickets/[id]` | PATCH | Update ticket. If `claim_ownership: true`: Sales/Admin only, ticket must be `routed`; sets `draft` + transfers `created_by_id`. Logs `order_ticket_status_changed` activity. |
| `GET /api/tickets/counts` | GET | Tab badge counts: `{ drafts, sent, approved, orders, routed, total }`. SDRs get own routed count. Sales/Admin get global routed count. |
| `GET /api/activities` | GET | `?ticket_id=xxx&include_linked_lead=true` → full lifetime (lead + ticket activities merged) |

---

## Sidebar Badges

| Badge | SDR | Sales / Admin |
|-------|-----|---------------|
| `/quotes` | `draft` + `sent` + `approved` (own) | same + all `routed` |
| `/orders` | `order` status (own) | `order` status (all) |

Both updated in `app/api/sidebar-counts/route.ts` and refresh via `bazaar:refresh-counts`.

---

## High-Value Threshold — Full Business Rule

Configured in **Admin → Company Settings → High-Value Threshold ($)**.  
Default: `$5,000`.

| User Role | Behaviour |
|-----------|-----------|
| SDR creating/editing a quote | Blocked when total > threshold. Modal shown. Quote saved as `routed`. |
| Sales / Admin | No block. Full save regardless of total. |

When a `routed` quote is claimed by Sales:
- `ticket_status` → `draft`
- `created_by_id` → claiming Sales user's ID
- All other Sales users see it disappear from "Routed to Sales" tab instantly (via Realtime)
- Claimer finds it in their own "Draft" tab and can continue working it

---

## Customer Upsert (New Quote Flow)

When a quote is saved (draft or sent) from `new-quote-form.tsx`:

1. If `customer_id` already exists in form state → use it
2. Else if contact fields (name/email/phone) are present → `POST /api/customers` with upsert logic (match on email or phone; create if no match)
3. Set `customer_id` on the `job_tickets` row
4. Customer appears in CRM immediately

---

## Deferred

- **PDF export** — `lib/utils/order-ticket-pdf.ts` using `jspdf`, pre-filled from `company_settings`
- **Dashboard revenue integration** — approved ticket totals surfaced on Dashboard KPIs
