# Feature Spec — CRM

Route: `/crm` (SDR, Sales, Admin — not Accountant). API routes require **`requirePageAccess('/crm')`** in addition to MFA session.

---

## Overview

The CRM is the master customer registry. Every contact who has ever been a lead — or was added directly via **Add Customer** — is tracked here. The CRM shows customers, their status (New / Known), quotes & orders, and activity timeline.

**List API:** `GET /api/crm/page-data` — paginated CRM list with server-side search, status, and heat filters (May 2026). Requires `/crm` page permission. **`GET /api/customers`** remains for merge search and Add Customer flows (same permission). Slim customer fields plus lightweight `lead_count` / `ticket_count` aggregates via `lib/utils/fetch-crm-data.ts`.

---

## Customer Status (list & profile)

Computed on list APIs (`GET /api/crm/page-data`, `GET /api/customers`) from lead/ticket aggregates:

| Status | API value | Definition | Badge |
|--------|-----------|------------|-------|
| **New Contact** | `new` | No qualifying leads and no tickets yet (e.g. standalone Add Customer) | Grey |
| **Known Customer** | `known` | Has at least one qualifying lead **or** any ticket | Blue |

> **Note:** A separate three-tier model (New / Known / **Returning**) appears in older specs and dedup banner mockups. **Current list API uses two tiers only** (`new` | `known`). Completed-order history is visible on the customer profile under Quotes & Orders, not as a separate list status.

### Where status appears

- **CRM list** — Status column badge
- **Dedup lookup** (`GET /api/customers/lookup`) — may include `customer_status`, `order_count`, `lead_count` for Add Lead / New Quote banners
- **Customer profile** — badge in header
- **Verify Drawer** — badge next to customer name when linked

---

## Enriched Dedup Banner (Add Lead modal & Verify Drawer)

Currently the banner shows: *"Existing customer found: John Smith — Acme Corp"*

After CRM phase, the banner becomes:

**Returning Customer (has orders):**
```
★ Returning Customer
John Smith — Acme Corp
3 orders · Last order: March 2025
[Use their info]  [Continue new]
```

**Known Customer (has leads, no orders):**
```
👤 Known Customer
Sarah Lee — Beta LLC
2 previous leads · Never ordered
[Use their info]  [Continue new]
```

**Multi-match picker** also shows status badge next to each name in the list.

### API — lookup enrichment (New Quote pre-fill)

`GET /api/customers/lookup` returns customer rows enriched with:

```json
{
  "latest_source": "string | null"
}
```

`authority` is on the customer row directly. `latest_source` comes from the most recent lead or direct quote — used to pre-fill Source on New Quote.

> CRM list dedup banner (`order_count`, `lead_count`, `customer_status`) is a separate enrichment on `GET /api/customers` — not on lookup.

---

## Customer Profile Page (`/crm/customers/[id]`)

A dedicated full page for a single customer. Accessible from:
- **Company** link (or **—**) in the CRM list
- **View** on the CRM list
- Customer name in the Verify Drawer or Sales Drawer
- Dedup banner on New Quote

### Header
- Customer name (large), company subtitle, phone, email
- **Status badge**: New Contact / Known Customer
- Heat tag badge (Hot / Warm / Cold)
- **Add Quote** button → `/quotes/new` with customer params pre-filled (same as CRM list)
- **Edit** button → opens Edit Customer modal
- **Merge Duplicate** button — conditionally shown; hidden when the customer has a unique phone number (no other record shares it)

### Contact grid
- Company, Phone, Email, Industry, Website
- **Decision Maker** — `customers.authority` (`yes` / `no`)
- Total Leads, Customer Since

> **Source** is quote/lead metadata — shown on each quote row in Quotes & Orders and on lead history, not in the company contact grid.

### Section: Quotes & Orders
List of all `job_tickets` for this customer. Each row shows reference, date, **source** (quote or lead), total, and status. Click → quote/order detail.

> **Lead History** was removed from the customer profile (May 2026). SDRs view routed/won lead details from the **Leads** workspace (Directed to Sales / Won tabs → read-only Verify Drawer).

### Section: Quotes & Orders
Table of tickets for this customer via **`GET /api/tickets?customer_id=[id]`** (scoped by role). **Lead History** was removed (May 2026).

> **Activity timeline on profile:** Not built. Ticket/lead history lives on **Quote/Order detail → History** (`GET /api/activities?ticket_id=…`) and **Verify/Sales drawer → History** (`GET /api/leads/[id]/activities`).

---

## CRM List Page (`/crm`)

**Data:** `GET /api/crm/page-data` — DB-level pagination (`LIMIT`/`OFFSET` + `COUNT exact`). Only the requested page rows are fetched; total count is a separate lightweight query. Default 25 rows; 25 / 50 / 100 selectable (`bazaar-list-page-size` localStorage key).

### Table Columns

| Column | Notes |
|--------|-------|
| Name | `first_name + last_name`; truncated with `…` if long |
| Company | Click company name (or **—**) → customer profile; truncated if long |
| Phone | `tel:` link; amber `Dup` badge if `is_duplicate_phone = true` |
| Email | `mailto:` link when present; truncated if long |
| Status | New / Known badge (`customer_status` — New = no leads/tickets yet) |
| Industry | Lookup label via `GET /api/lookups?categories=industry` (not raw value); truncated if long |
| Leads | Count of qualifying leads |
| Last Activity | Relative time from most recent lead or ticket |
| Actions | **View** → customer profile · **Add Quote** → `/quotes/new` pre-filled · **Merge** (icon button, only visible when `is_duplicate_phone = true`) |

**Row interaction:** The table row itself is not clickable. Use **Company**, **View**, or action buttons. All action buttons are always the same width (`shrink-0`) — layout never shifts regardless of which buttons are visible.

**Fixed column layout:** `<colgroup>` pins column widths so the actions column never wraps and long text columns truncate cleanly.

### Mobile cards
- Company link opens profile; phone/email use `tel:` / `mailto:` when present
- Industry shown as lookup label when set
- Duplicate phone shown with amber badge on phone field

### Filters & Controls

| Control | Behaviour |
|---------|---------|
| **Add Customer** | Header button — modal to create a customer record only (no lead/quote); opens profile after save |
| Search | Server-side filter on name, email, phone, company (`autoComplete="off"`, `type="search"` — debounced 300 ms) |
| Pagination | **Showing 1–25 of N**, Previous/Next, rows-per-page 25 / 50 / 100 (`ListPagination`; default 25) |
| Status filter | **All** / **New Contact** / **Known Customer** — server `?status=` |
| Heat Tag filter | **Hot** / **Warm** / **Cold** — optional toggle; server `?heat=`; click again to clear. Not shown as a table column. |
| **Duplicates filter** | Amber pill — when active, shows only customers whose phone number appears on 2+ records (`?duplicates=1`). Count reflects all matching rows, not just page. |

### Duplicate Phone Detection

`is_duplicate_phone` is computed on every `GET /api/crm/page-data` response via `fetchDuplicatePhoneIds` in `lib/utils/fetch-crm-data.ts`:

1. Fetches all customer `(id, phone)` pairs
2. Groups by phone; marks any `id` whose phone appears on 2+ records
3. The flag is added to every row in the page response

**Why:** The flag drives the amber badge, the Merge button, and the Duplicates filter. The overhead is one extra lightweight SELECT on every page load.

### Heat Tag (`heat_tag`)

**Source:** Manual only — set on customer profile → **Edit Customer** → **Heat Tag** (Hot / Warm / Cold / None). Saved to `customers.heat_tag` via `PATCH /api/customers/[id]`.

**Not auto-set from:** lead urgency, lead status, or Add Lead / Add Customer flows (Add Customer does not set a heat tag).

**CRM list filters:** Hot/Warm/Cold pills show only customers with that tag; click again to clear. Most customers have `heat_tag = null` until someone sets it on the profile.

---

## Edit Customer Modal

**Fields (editable):**
- First Name, Last Name
- Email
- Phone
- Company (autocomplete from existing company names)
- **Industry** — admin-managed lookup select (label shown, value stored)
- **Decision Maker?** — Yes / No (`customers.authority`)
- **Website / Social** — optional; validated client-side via `validateWebsite()`; normalized with `https://` prefix on save; scheme optional in the input
- Heat Tag (Hot / Warm / Cold / None)

**Validation:** Phone, email, and website validated on save. Invalid fields show inline error + red border and **scroll into view** if off-screen (`data-field-anchor` + `scrollToFormField()`).

**Save** → `PATCH /api/customers/[id]` + logs `contact_edited` activity.

**Display:** Contact grid shows industry and decision maker as **human-readable labels**, not raw DB values.

---

## Merge Duplicate Customers

**Where it appears:**
- **Merge** icon button in the CRM list Actions column — only rendered when `is_duplicate_phone = true` (invisible placeholder maintains button alignment otherwise)
- **Merge Duplicate** button on the customer profile page (`/crm/customers/[id]`) — conditionally shown: on load, `GET /api/customers?search={phone}` is called; the button renders only when the response contains 2+ customers (i.e. another record shares the same phone). Hidden for customers with a unique phone number.

**Auth:** `POST /api/customers/[id]/merge` — **Admin and Sales only** (`403` for SDR, Accountant, etc.). Destructive: deletes victim customers after reassigning leads, tickets, and activities.

**Component:** `components/crm/merge-customer-modal.tsx`

### 3-step merge flow

**Step 1 — Select keeper**

When the modal opens it immediately fetches all customers sharing the same phone number via `GET /api/customers?search={phone}` — including the customer the button was clicked on. All results are shown in a selectable list:

- Radio-circle selection indicator
- Customer name + company / phone / email
- "This record" pill marks the record the merge was initiated from
- "Customer since" date (`created_at`) shown beneath to help identify the original record

User clicks a record to mark it as the keeper; "Next →" is disabled until a selection is made.

**Step 2 — Choose field values**

For every field where two or more candidates have *different* values (`first_name`, `last_name`, `company`, `email`, `industry`, `heat_tag`), a radio group is shown — one option per unique value, labelled with which customer it comes from. The keeper's values are pre-selected but can be overridden.

If all records have identical values, a green "no conflicts" notice is shown and the step is skipped on confirm.

**Step 3 — Confirm**

Amber warning box lists exactly which records will be deleted and that all their leads, tickets, and activities will be moved to the keeper. "Merge & Delete N records" button executes sequential API calls:

- For each non-keeper: `POST /api/customers/{victim_id}/merge` with `{ target_id: keeper_id, overrides: { … } }`
- `overrides` contains the user's field selections for the first call; subsequent calls omit overrides (already applied)

On success: modal closes, success toast, `bazaar:customers-changed` event dispatched, CRM list refreshes, browser navigates to `/crm/customers/{survivingId}`.

### Merge API

`POST /api/customers/[id]/merge`

**Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `target_id` | `string` (UUID) | ✅ | The surviving customer. Must differ from path `id`. |
| `overrides` | `Record<string, unknown>` | ❌ | Field values to apply to the surviving record before moving child rows. Allowed keys: `first_name, last_name, company, email, industry, heat_tag`. Other keys are silently dropped. |

**Server steps:**
1. Apply `overrides` to target via `UPDATE customers SET … WHERE id = target_id`
2. `UPDATE leads SET customer_id = target_id WHERE customer_id = source_id`
3. `UPDATE job_tickets SET customer_id = target_id WHERE customer_id = source_id`
4. `UPDATE activities SET customer_id = target_id WHERE customer_id = source_id`
5. Insert `contact_edited` activity on target with `action: "merge"`, `overrides_applied: [...]`
6. `DELETE customers WHERE id = source_id`

**Response `200`:** `{ success: true, surviving_id: "uuid" }`

### Automated bulk merge script

`scripts/auto-merge-duplicates.py` — Python script for bulk deduplication. Fetches all customers, groups by phone, and auto-merges using:

1. **Rule 1:** Keep the customer with the **oldest** `created_at` (original relationship)
2. **Rule 2 (tie):** Keep the one with the most non-empty profile fields
3. **Rule 3 (tie):** Keep the one with the lowest UUID string

Supports `--dry-run` flag for safe preview without DB changes.

```bash
# Preview only
python3 scripts/auto-merge-duplicates.py --dry-run

# Execute
python3 scripts/auto-merge-duplicates.py
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` env vars.

---

## Connection to Add Lead Modal & Verify Drawer

Once the CRM is built, both the **Add Lead modal** and the **Verify Drawer** will have a direct **"View customer profile →"** link in the dedup banner and in the drawer header. Clicking it opens `/crm/customers/[id]` so the SDR can see the full history without leaving their workflow.

---

## Add Quote from CRM ✅ Built

Available to SDR and Sales via **+ Add Quote** button in the CRM customer list (Actions column, next to View) and on the **customer profile page** (`/crm/customers/[id]`, next to Edit).

**Flow:**
1. Clicking "Add Quote" navigates to `/quotes/new?customer_id=...&first_name=...&last_name=...&email=...&phone=...&company=...&industry=...&website=...` (via `lib/utils/new-quote-from-customer.ts`)
2. The New Quote form detects CRM params, **skips the Customer tab**, shows a read-only customer card on the left sidebar, and shows **Quote source** (required) on the **Info** tab
3. User fills in Info → Line Items → Quote as normal
4. On save: existing customer linked via `customer_id`; `quote_source` stored on ticket with `from_quote_page: true`; no duplicate customer or auto-lead created
5. Quote/order detail timeline (when opened later): **Customer in CRM** origin node if the customer existed before the ticket; creation shows **Quote created** with `QUO-*` (see `docs/feature-specs/tickets.md` — lifecycle timeline)

> **No drawer used** — the New Quote page (`/quotes/new`) handles all entry points (lead, CRM, standalone).

---

## Add Order from CRM (Deferred)

Direct order creation from CRM (bypassing the quote step) is deferred. For now, all orders start as quotes via the Add Quote flow above.

---

## Loading & Error States

- Table skeleton while customers load
- Profile page section skeletons while lead/order/activity data loads
- Empty state per section: "No leads yet", "No orders yet", "No activity yet"

---

## Build Dependencies

| Dependency | Required for |
|-----------|-------------|
| `job_tickets` table | Order history section, Returning Customer status |
| `GET /api/customers/lookup` enriched response | Enriched dedup banner |
| `HistoryTimeline` component | Activity timeline section |
| Tickets phase complete | Order count available for status computation |
