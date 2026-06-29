# Feature Spec — SDR Lead Pipeline

Route: `/leads` (SDR + Admin only)

---

## Overview

The SDR Lead Pipeline is the primary workspace for SDRs. It is a **tabbed page** with six tabs. The SDR works leads from the All Leads queue, defers contact with **Follow Up Later**, puts them on hold, routes them to Sales, rejects them, or tracks Won conversions.

> **List vs drawer (2026-05-22):** Tab tables load a **slim** lead row from `GET /api/leads/workspace`. Opening the Verify Drawer fetches the **full** record via `GET /api/leads/[id]` (`fetchLeadById()`).

> **Page load (2026-05-26 / 2026-06-02):** `leads-page.tsx` uses **`useListPageData`** → **`GET /api/leads/workspace/page-data?…`** — paginated slim list, all tab counts, and (on Routed tab) `routedSubCounts`. Realtime refetch is immediate; `ListRefreshingNotice` during background sync. `enabled: !drawerLead || drawerReadOnly`. Lookups, product types, and SDR user list **lazy-load** when Add Lead or Reassign opens.

> **Pagination (May 2026):** Default **25** rows per page; selector 25 / 50 / 100. Search, SDR owner scope, routed sub-filters, and column sort are **server-side**. Reset to page 1 when any filter changes.

---

## Tab: All Leads (Inbox)

**Data:** `GET /api/leads/workspace` — leads where `is_inbox = false` and `status` in `['Pending', 'Validated']`

**Visibility filtering (server-side):**
- **SDR — All Leads tab:** only unclaimed leads (`locked_by_id IS NULL`); cannot see leads locked by another SDR
- **SDR — Claimed Leads tab:** only leads claimed by the current user (`locked_by_id = currentUserId`)
- **Admin:** receives all leads on All Leads (no lock filter); also gets `locked_by` profile joined on each row; no Claimed Leads tab

### Table Columns

| Column | Visible to | Notes |
|--------|-----------|-------|
| Name | All | `first_name + last_name` from linked customer |
| Company | All | |
| Source | All | Lead source label |
| Product Interests | All | From `interests` + `quantities` — e.g. `Booklets[1111], Labels[500]`; `—` when empty |
| Phone | All | Formatted display (stored digits-only) |
| Urgency | All | Colour-coded pill: High / Medium / Low / Not Defined |
| Status | All | `StatusPill` — Pending / Validated |
| Owner | All | SDR name / "You" / "Unclaimed" badge |
| Created | All | Relative time (e.g. "2 hours ago") |
| Action | All | **Claim** (SDR, unclaimed) / **View** (SDR, claimed) / **Edit** + **Assign/Reassign** + **Route to Sales** (Admin) |

### Behaviors

- **Search:** server-side filter (debounced) on name, email, phone, company — `?search=`
- **Sort:** server-side — **Created** or **Urgency** column headers (`?sort=created|urgency&sort_dir=`)
- **Pagination:** `ListPagination` at bottom of list — Showing 1–25 of N
- **Skeleton loader** while data fetches — never full-page spinner
- **Claim** (SDR, All Leads tab) → `POST /api/leads/[id]/lock` → global loading overlay + row spinner → opens **Verify Drawer** in edit mode
- **View** (SDR, Claimed Leads tab) → opens drawer for owned lead (`POST /lock` refreshes `locked_at`; no new `lead_claimed`)
- **Edit button** (Admin) → opens **Verify Drawer** in **edit mode** with no lock acquired — Admin can view and save any field changes via "Save Changes" button; the active SDR's lock is undisturbed
- **Assign / Reassign button** (Admin only) → "Assign" label when `locked_by_id IS NULL`; "Reassign" label when lead is already owned. Fixed `min-w-[72px]` so both labels render at the same button width. Opens a modal with a dropdown of all active SDR users plus an "Unassign" option. Disabled until an SDR is selected. On confirm → updates `locked_by_id`, `locked_at`, and `sdr_id`; row updates in place and tab counts refresh
- **Route to Sales button** (Admin only, gold CTA) → opens the **Route to Sales modal** to optionally assign a sales rep before routing. Hidden when `lead.status === "Routed to Sales"`. On confirm: calls `PATCH /api/leads/[id]` with `{ status: "Routed to Sales", sales_status: rep ? "Claimed" : null }` (plus `sales_owner_id` if a rep was selected), releases the lock via `POST /api/leads/[id]/unlock`, removes the row from the list, and fires `bazaar:refresh-counts`.
- **Empty state:** "No leads found." with muted text

### Badge

Tab count for **All Leads** = unclaimed pool size (`locked_by_id IS NULL`), always — not affected by the All/My toggle. Admin badge shows total pending/validated leads.

---

## Tab: Follow Up Later

**Data:** `GET /api/leads/workspace?status=Follow Up Later&scope=mine`

- **SDR:** only their own follow-up leads — list, tab badge, and Resume are filtered by `sdr_id = currentUserId` (`scope=mine` on the workspace API). Marking follow-up sets `sdr_id` to the acting SDR; another SDR cannot mark or resume someone else's lead (403).
- **Admin:** all follow-up leads across every SDR (`scope=mine` is not applied server-side)

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` |
| Reason | Admin-managed `follow_up_reason` lookup label |
| Follow Up On | Optional date (`follow_up_until`) |
| Marked | Relative time (`follow_up_at`) |
| Actions | **Resume**, **View** |

### Behaviors

- **Follow Up Later** (Verify Drawer, before On Hold) → full-screen sub-form: reason (required), notes, optional follow-up date → `POST /api/leads/[id]/follow-up` → `status = 'Follow Up Later'`; SDR retains lock (same as On Hold). Choosing **Other** requires free-text in **Please specify** (Confirm disabled until filled; server returns `400` if empty)
- **Resume** → `POST /api/leads/[id]/resume` with `role: 'sdr'` → restores `prev_status` (typically `Pending`)
- Reasons editable in **Admin → Dropdown Options** (`follow_up_reason` category)

---

## Tab: On Hold

**Data:** `GET /api/leads/workspace?status=On Hold&scope=mine`

- **SDR:** only their own held leads (`sdr_id = currentUserId`)
- **Admin:** all held leads across every SDR (scope filter is skipped server-side)

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` from `interests` + `quantities` |
| Hold Reason | |
| Hold Until | Formatted date (or "—" if indefinite) |
| Held | Relative time (`held_at`) |
| Actions | **Resume** button, **View** button |

### Behaviors

- **Resume** → `POST /api/leads/[id]/resume` with `role: 'sdr'` → lead returns to `Pending` → removes from this tab
- **View** → opens Verify Drawer (attempts lock; read-only if locked by another SDR)
- From hold, SDR can: **Resume** (→ `Pending`), **Reject** (terminal), **Route to Sales**

---

## Tab: Directed to Sales

**Data:** `GET /api/leads/workspace?routed=true&scope=mine`

- **SDR:** every lead they personally routed to Sales (`lead_routed_to_sales` activity + `sdr_id = currentUserId`), **regardless of current outcome** (awaiting claim, in progress, won, rejected, dropped, etc.)
- **Admin:** all activity-routed leads across every SDR (scope filter is skipped server-side)

This tab is read-only for SDRs. Sub-filter pills slice the list by **pipeline stage**; each row shows a **Stage** badge.

### Sub-filter Pills

Server-side filters via `?routed_filter=` on page-data; badge counts from `routedSubCounts` in the API response:

| Pill | Filter logic |
|------|-------------|
| **All** | All routed leads returned by the API (includes Won / Rejected) |
| **Awaiting Claim** | No sales rep claimed yet (`sales_owner_id IS NULL`) |
| **In Progress** | Claimed or actively working — `sales_status IN ('Claimed', 'In Progress', 'Ongoing')`, draft quote, order not won, etc. |
| **Quote Sent** | `sales_status = "Quote Sent"` **or** linked quote ticket is `sent` / awaiting customer confirm |
| **On Hold** | `sales_status = "On Hold"` |
| **Follow Up Later** | `sales_status = "Follow Up Later"` (sales defer — SDR read-only on this tab) |
| **Dropped** | `sales_status = "Dropped"` |

Pills always visible; count badge when that stage has leads. **Stage** badge and filter use the same rules (ticket-aware when linked tickets are loaded).

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` |
| Phone | |
| **Stage** | Pipeline stage badge (Awaiting Claim, In Progress, Quote Sent, On Hold, Dropped, Won, Rejected) |
| Lead Status | SDR `status` field (e.g. Routed to Sales, Quoted, Validated, Rejected) |
| Sales Rep | Name of the Sales rep who claimed the lead, or **Unclaimed** |
| Updated | `updated_at` relative time |

### Behaviors

- **Rows are clickable** — clicking any row opens the Verify Drawer in **read-only mode** (no lock acquired). SDR can view all lead details and history but cannot save, route, hold, or reject.
- **No action buttons in the drawer** — footer shows only "Close".
- **Closing the drawer** does not reload the list (read-only path keeps `useListPageData` enabled: `enabled: !drawerLead || drawerReadOnly`).
- **Sub-filter pills** persist until the SDR navigates away; pills reset to "All" when switching tabs.
- **Search** applies server-side (`?search=` on page-data).

### Lead Status Meanings on This Tab

| Lead status | sales_status | Sub-filter pill | Meaning |
|---|---|---|---|
| `Routed to Sales` | `null` | Awaiting Claim | SDR routed — no Sales rep has claimed it yet |
| `Routed to Sales` | `Claimed` or `In Progress` | In Progress | Sales rep claimed (Claimed) or marked in progress |
| `Validated` | `Claimed`, `In Progress`, or `null` | In Progress | Sales rep created a stub ticket (no SKUs) |
| `Quoted` | `Quote Sent` | Quote Sent | Sales rep created a quote with line items and sent it |
| `Routed to Sales` | `On Hold` | On Hold | Sales rep put the lead on hold |
| `Routed to Sales` | `Dropped` | Dropped | Sales rep dropped the deal without formal reject |
| `Quoted` | `Won` | _(excluded)_ | Linked ticket released to production — lead exits this tab, appears in Won tab |

---

## Tab: Won

**Data:** `GET /api/leads/workspace?won=true`

- **SDR:** only their own won leads (`sdr_id = currentUserId`)
- **Admin:** all won leads across every SDR

A lead appears here when:

1. The SDR **routed it to Sales** (`lead_routed_to_sales` activity — Route to Sales in the verify drawer), **and**
2. The linked ticket later entered **`in_production`** (`sales_status = 'Won'` via `markLeadWonOnProduction()`).

**Not included:** SDR quotes/orders the lead directly without routing to Sales — those may still get `sales_status = Won` globally, but they do not appear on this tab. Self-created completed orders appear on **`/completed`** for the SDR (scoped by `created_by_id`).

**Component:** `components/leads/lead-history-table.tsx` — shared table component (`lib/utils/lead-history-display.ts` for refs and source labels). **Not shown on customer profile** (removed May 2026).

### Table Columns

| Column | Notes |
|--------|-------|
| Status | `sales_status` via `StatusPill` (Won, Quote Sent, etc.) — **not** SDR inbox `status` |
| Source | Lookup label via `leadSourceLabel()` (e.g. Phone call) |
| Product Interests | `ProductName[quantity]` from `interests` + `quantities` |
| Urgency | `UrgencyPill` |
| Quote / Order | `QUO-…` / `ORD-…` badges from nested tickets — **reference codes only, no amounts** |
| Created | Relative time |

### Behaviors

- **Rows are clickable (SDR)** — opens **read-only Verify Drawer** (same as Directed to Sales tab)
- **Admin** — row click opens Verify Drawer in read-only mode
- Empty state copy explains routing-to-Sales + production release
- Count badge from page-data `counts.won` (or `GET /api/leads/workspace/counts` on counts-only refresh)
- API returns nested `tickets:job_tickets(id, reference_code, ticket_kind, ticket_status)` only — **no `quote_final_total` or closer name** in the browser

---

## Tab: Rejected

**Data:** `GET /api/leads/workspace?status=Rejected&scope=mine`

- **SDR:** only their own rejected leads (`sdr_id = currentUserId`)
- **Admin:** all rejected leads across every SDR (scope filter is skipped server-side)

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` |
| Rejection Reason | |
| Rejected At | Relative time |
| Actions | **View** button |

### Behaviors

- Read-only view. No re-open action in v1.

---

## Lead Visibility — Lock-Based Filtering

SDR lead queues use separate tabs instead of an in-tab toggle:

- **All Leads** — only **unlocked** leads (`locked_by_id IS NULL`) in the shared pool; any SDR can **Claim**
- **Claimed Leads** — leads the current SDR has **claimed** (`locked_by_id = currentUserId`); **View** action
- **In Progress** — leads with `status = In Progress` scoped to the SDR (`sdr_id = me`); Admin sees all

Leads currently locked by another SDR are **hidden from the queue entirely**. SDRs never see a lead that someone else is working — there is nothing to click on.

**Admin** sees all leads on All Leads regardless of lock state, plus a **Working** column showing which SDR has each lead open. Admin opens leads with a **View** action (no lock acquired) so they can inspect any lead without disrupting an active SDR. Admin has no Claimed Leads tab.

### Race Condition Safety Net

If SDR B's page is stale (loaded before SDR A clicked **Claim**), SDR B may still see the lead. When SDR B clicks **Claim**, `POST /api/leads/[id]/lock` returns `409` and the drawer opens in read-only mode with a banner: **"[Name] is currently working this lead"**. No action buttons are shown. SDR B can close the drawer — on next refresh the lead will no longer appear in their queue.

Closing the drawer does **not** release the lock. Ownership persists until the SDR routes the lead to Sales, rejects it, or an Admin reassigns/force-releases it.

See `docs/feature-specs/lead-locking.md` for full lock spec.

---

## Verify Drawer

A right-side drawer (slide-in panel) that opens when the SDR clicks **Claim** (All Leads) or **View** (Claimed Leads / other tabs) on a workspace lead.

### Drawer Tabs

| Tab | Content |
|-----|---------|
| Lead Info | Contact fields, source, brand, product interests (`ProductInterestRows`: product + quantity + has design) |
| Quote | Quote total, channel, destination |
| History | Vertical timeline from `GET /api/leads/[id]/activities` — lazy-loaded on first open ✅ |

### Lead Info Tab — Contact Information section

Fields (editable when verifying, read-only when viewing):

| Field | Input | Required | Notes |
|-------|-------|----------|-------|
| Phone Number | Text | Yes | Digits-only placeholder; formatted for display; stored digits-only |
| Email Address | Email input | No | |
| First Name | Text | Yes | |
| Last Name | Text | No | |
| Source | Dropdown | Yes | **Admin-managed** — loaded from `lookup_values` (`source` category). Edit in Admin → Dropdown Options. |
| Created | Read-only | — | Timestamp, shown with lock icon |
| Authority | Dropdown | No | Decision maker? Yes / No — stored on **`customers.authority`**, not on the lead row. Pre-filled from customer when an existing profile is linked. |
| Company Name | Text | No | |
| Industry | Dropdown | Yes | **Admin-managed** — loaded from `lookup_values` (`industry` category). Edit in Admin → Dropdown Options. |
| Website / Social | Text | No | Validated on blur + save via `lib/utils/website.ts`; optional; **scheme optional** (`example.com`, `instagram.com/page` — auto-prefixes `https://` on save). Placeholder: `example.com or instagram.com/page`. Stored on **`customers.website`**. |
| Urgency | Dropdown | No | **Admin-managed** — loaded from `lookup_values` (`urgency` category). "Not Defined" is a static sentinel prepended to the list. Edit real options in Admin → Dropdown Options. Lookup values use lowercase keys (`high`, `medium`, `low`); the DB stores title case (`High`, `Medium`, `Low`). `lib/utils/urgency-form.ts` maps between them on load/save so saved urgency displays correctly when reopening the drawer. |
| Returning Customer | Checkbox | No | "Returning Customer (Existing Client)" — blue highlight row when checked |

### Lead Info Tab — Verify Lead Comment section

A full-width textarea below the Contact Information grid:

- **Label:** "Verify Lead Comment"
- **Placeholder:** "Add verification notes before opening Order / Quote..."
- **Field:** `sdr_comment` — internal notes visible only to SDR and Admin
- Not visible to Sales rep

### Lead Info Tab — Product Interests section

Shared UI: `components/leads/product-interest-rows.tsx` (used by Add Lead modal and Verify Drawer).

Dynamic row-based interface. Each row shows **Product**, **Quantity**, and **Has Design** on one horizontal line; labels sit on a separate grid row above the inputs so fields align consistently.

| Field | Input | Required | Notes |
|-------|-------|----------|-------|
| Product | Single-select dropdown | Yes (when row is used) | Options from active `product_types`; already-chosen products excluded from other rows |
| Quantity | Number input | Yes when product selected | Must be **> 0**; digits only, no negatives |
| Has Design | Centered checkbox | No | Whether the customer already has artwork/design |
| Remove | Bordered button | — | Removes the row; hidden in read-only mode |

- **"+ Add Product Interest"** button appends a new empty row (disabled when all products are already selected)
- Validation via `lib/utils/validate-lead-product-interests.ts` — product and quantity errors highlight the correct field separately
- In **read-only mode** (locked by another user), rows display without edit controls
- On save, rows are transformed into three JSONB fields: `interests`, `quantities`, `has_design`

**Duplicate banner:** While the SDR types phone or email, `GET /api/customers/lookup` is called with 600ms debounce. If a match is found:
- Banner appears: "Existing contact found: [Name] — [Company]"
- Two options: **Merge into existing contact** (auto-fills fields) or **Continue as new contact**

### Quote Tab

- Quote Total (number input)
- Quote Channel (dropdown: SMS / WhatsApp / Email / In-person)
- Quote Destination (phone digits for SMS/WhatsApp, email for Email; shown/hidden based on channel)

### Footer Actions

Actions available depending on drawer mode and current `status`. **All action buttons are hidden in read-only mode (lead locked by another user).**

| Action | When Available | What it does |
|--------|---------------|--------------|
| ~~**Validate**~~ | _Removed_ | The Validate step has been removed from the SDR workflow. SDRs go directly to Route to Sales, On Hold, or Reject. |
| **Route to Sales** | Edit mode (SDR **and** Admin), any non-routed status | Opens **Route to Sales modal** — radio list of active sales reps + "Add to queue — don't assign yet" (default). On confirm: saves form edits + sets `status = 'Routed to Sales'`, `sales_status = 'Claimed'` when rep selected (else `null` for unclaimed queue), optionally sets `sales_owner_id`. Admin also has a **Route to Sales** button on each list row (opens the same modal, no drawer required). |
| **Follow Up Later** | Edit mode, not On Hold / Follow Up Later / Rejected | Full-screen follow-up sub-form; `POST /api/leads/[id]/follow-up` |
| **On Hold** | Edit mode, status not Rejected | Replaces drawer body with full-screen hold sub-form (tabs + lead form hidden until hold is confirmed or cancelled) |
| **Resume** | Edit mode, `status = 'On Hold'` or `Follow Up Later` | Saves form edits + `POST /api/leads/[id]/resume` → restores `prev_status` |
| **Reject** | Edit mode, status not Rejected | Opens rejection form inline in footer — **TERMINAL** |
| **Save** | Edit mode (far-right of footer) | `PATCH /api/leads/[id]` with current form values; **Decision Maker** in payload updates `customers.authority`; contact field changes may prompt "Update customer profile?"; closes drawer on success |
| **Close (✕)** | Always (header) | Dismisses modal — ownership is **not** released (soft-lock persists until Route, Reject, or admin unlock) |

**Save button** is always visible at the far right of the footer when in edit mode (navy style). Route, Hold, and Reject also auto-save form fields before executing their specific action.

**Clicking outside the modal** (backdrop) or the **✕** header button closes the drawer without saving. Ownership is **not** released — the lead stays claimed until Route, Reject, or Admin reassign.

**Route to Sales is always available.** The SDR can route a lead directly from `Pending` without validating first.

**Reject is terminal:** Once `status = 'Rejected'` is set, the drawer reopens in read-only mode for all non-Admin users. Only Admin sees an "Admin Override" banner with the ability to change status.

### Hold Sub-form (full-screen in drawer body)

When the SDR clicks **On Hold**, the drawer tabs and lead form are hidden; the hold UI fills the modal body and the footer action row is hidden until hold is confirmed or cancelled (`fullScreen` prop on `HoldSubForm`).

Radio button grid (2 columns). **Reasons are admin-managed** — loaded from `lookup_values` (`hold_reason` category) via `GET /api/lookups`. Admin edits from **Admin → Dropdown Options** without a code change.

Default seeded reasons: Awaiting customer response · Awaiting artwork / files · Awaiting payment confirmation · Pricing review needed · Vacation / customer unavailable · Other

- Notes (textarea, optional)
- Hold Until (date picker, optional)
- **Confirm Hold** button → `POST /api/leads/[id]/hold`

### Route to Sales Modal (`components/leads/route-to-sales-modal.tsx`)

Opens when the SDR or Admin clicks "Route to Sales" — from the Verify Drawer footer or the admin list row button.

- Fetches `GET /api/leads/sales-users` on open (active sales users, any auth)
- Radio list: **"Add to queue — don't assign yet"** (pre-selected, `sales_owner_id` omitted) + one option per active sales rep
- Skeleton placeholders while the user list loads
- **Confirm Route** → `PATCH /api/leads/[id]` with `{ status: 'Routed to Sales', sales_status: rep ? 'Claimed' : null, sales_owner_id? }` + `POST /api/leads/[id]/unlock`
- If a rep is selected, logs a `lead_reassigned` activity (role: "sales") in addition to `lead_routed_to_sales`

### Rejection Form (inline in drawer footer)

**Rejection reasons are admin-managed** — loaded from `lookup_values` (`reject_reason` category) via `GET /api/lookups`. Admin edits from **Admin → Dropdown Options**.

Default seeded reasons: Not a fit · No budget · Competitor · Spam/Bot · Other

- Notes (textarea, optional)
- **Confirm Reject** button → `PATCH /api/leads/[id]` with `status: 'Rejected'`

---

## Manual Add Lead

An **+ Add Lead** button in the page header opens a modal (full-screen drawer on mobile, centered modal on desktop).

### Customer Lookup (Smart Deduplication)

When SDR types in the **Phone Number** field (600ms debounce after last keystroke):

**Step 1 — Phone lookup:** `GET /api/customers/lookup?phone=[digits]`

**No match found:**
- Form stays editable, SDR fills in all fields
- On submit → new customer created + lead linked to it

**1 match found:**
A banner appears below the phone field:
```
[PersonIcon] Existing customer found: John Smith — Acme Corp
[Use their info]  [Continue with new info]
```
- **Use their info** → form auto-fills with customer's data; customer is pre-selected
- **Continue with new info** → banner dismissed, SDR fills manually; will create new customer on submit

**2+ matches found:**
A modal appears over the form:
```
We found 2 existing customers with this phone number.
Choose one or add as new:

○  John Smith — Acme Corp  (added Jan 2026)
○  Jane Doe — Beta LLC     (added Mar 2026)
○  Add as new customer

[Confirm]
```
- SDR selects one → form auto-fills
- SDR selects "Add as new" → form stays empty, new customer created on submit

**Secondary lookup (email):** If phone field is left blank but email is filled, the same lookup runs on email. If both phone and email are filled, phone takes priority.

---

### Modal Fields Layout

Two-column grid (matches POC screenshot):

| Left column | Right column |
|-------------|-------------|
| Phone Number * | Email Address |
| First Name * | Last Name |
| Source * | Created (auto, read-only) |
| Authority | Company Name |
| Industry * | Website / Social |
| **Urgency** | — |

Below the grid (full width):
- **Product Interests** — shared `ProductInterestRows` component (Product + Quantity + **Has Design** checkbox on one row; labels above inputs — see Verify Drawer section)
- **Returning Customer (Existing Client)** — checkbox with blue-tinted background row when checked
- **Verify Lead Comment** — textarea: "Add verification notes before opening Order / Quote..."

Footer:
- **Save Lead** → `POST /api/leads/manual` → creates lead + customer (if new); lead stays **unclaimed** (`locked_by_id` null) until Claim/Assign
- **Cancel**

Required fields (*): Phone, First Name, Source, Industry.

### Client-side validation (May 2026)

On **Save Lead**, each field is validated in order. Failures show **inline error + red border on that field** (not a generic banner). If the field is scrolled out of view (common when Product Interests are below the fold), the modal **scrolls to and focuses** the invalid field via `lib/utils/scroll-field-into-view.ts` and `data-field-anchor` wrappers.

| Anchor id | Fields |
|-----------|--------|
| `phone` | Phone |
| `email` | Email |
| `firstName` | First Name |
| `source` | Source |
| `industry` | Industry |
| `website` | Website / Social |

Same website rules as Verify Drawer: `type="text"` (not HTML5 `type="url"`), `noValidate` on the form, optional `http://` / `https://`.

**Also opened from:** CRM customer profile (**Add Lead**, SDR only) — customer pre-filled and link locked; same validation behaviour.

---

### On Submit — What Happens to the Customer

**If SDR selected an existing customer:**
- Lead is created with `customer_id = existing_customer.id`
- If **Decision Maker** changed → `customers.authority` updated (not `leads.authority`)
- No new customer created

**If SDR filled fresh info (no existing customer chosen):**
- New `customers` row created with: first_name, last_name, email, phone, company, industry, website, **authority**
- Lead created with `customer_id = new_customer.id`

---

### "Update Customer?" Prompt — On Action

When the SDR takes an action on a lead (Hold / Route to Sales / Reject) **and** the fields in the drawer have been edited since it was opened:

**If lead is linked to an existing customer:**
```
[InfoIcon] You've updated this lead's contact info.
Update John Smith's customer profile with the new information?
[Yes, update profile]  [No, keep existing profile]
```
- Yes → `PATCH /api/customers/[id]` with changed fields (including **authority** and **industry** lookup values)
- No → lead saved as-is; customer record unchanged

**If lead has no customer linked yet:**
```
[PersonIcon] Save this contact as a customer profile?
This allows you to recognize them on future leads.
[Save as customer]  [Skip]
```
- Save → `POST /api/customers` → link lead to new customer
- Skip → lead saved without a customer link

---

## Loading & Error States

- **Table skeleton:** rows with shimmer placeholders while data loads
- **Drawer skeleton:** field skeletons while lead data re-fetches
- **Inline field errors:** phone, email, website, and required fields show red border + message under the control; invalid fields scroll into view in the drawer body
- **Toast on success:** "Lead verified", "Lead held", etc. (bottom-right, 4s auto-dismiss)
- **Toast on error:** "Something went wrong — please try again"

---

## Optimistic Updates

When an SDR acts on a lead (verify, hold, reject), the row is **immediately removed** from the current tab without waiting for a server round-trip. If the request fails, the row is restored and an error toast appears.

---

## Build Status & Gaps (as of 2026-05-09)

### ✅ Built and working
| Feature | Notes |
|---------|-------|
| All Leads / On Hold / Directed to Sales / Rejected / Won tabs | Tab counts visible before clicking; scoped correctly per SDR |
| Lock-based lead visibility (permanent ownership) | **All Leads** = unclaimed pool only; **Claimed Leads** tab = claimed by me; other SDRs' locks hidden; closing drawer does NOT release lock |
| Admin Edit action (no lock) | Admin opens any lead in **edit mode** without acquiring a lock — "Save Changes" + "Route to Sales" buttons in footer; active SDR's lock untouched |
| Admin "Working" column | All Leads table shows which SDR owns each lead; mobile cards too |
| Admin Assign / Reassign action | "Assign" on unclaimed leads; "Reassign" on owned leads. Fixed `min-w` so both labels are same button width. Modal with active SDR dropdown + Unassign; logs `lead_reassigned` |
| Admin Route to Sales — inline list button | Gold "Route to Sales" CTA in the Action column, hidden when `status = 'Routed to Sales'`. Opens **Route to Sales modal** to pick a rep or queue; on confirm: patches status + `sales_status = Claimed` (or null if queued) + optional `sales_owner_id`, releases lock, removes row, fires counts refresh |
| Admin Route to Sales — drawer button | "Route to Sales" in Verify Drawer footer; opens same `RouteToSalesModal`; uses `handleRoute` / `doRoute(salesOwnerId)` logic |
| Race condition safety net | If SDR clicks **Claim** on a stale lead, 409 → read-only drawer with locker banner |
| Manual Add Lead modal | Phone lookup + dedup; per-field validation; lead stays **unclaimed** until Claim/Assign; shared component on CRM profile (SDR Add Lead) |
| Verify Drawer (permanent lock, lock banner) | Lock acquired on **Claim**; ownership persists across close/save/hold until Route or Reject |
| Product Interests — select + quantity + has-design rows | Shared `product-interest-rows.tsx`; Product, Quantity, **Has Design** (checkbox) on one row; quantity **> 0** when product selected (Add Lead + Verify Drawer) |
| Claim loading UX | Global loading overlay + row spinner while lock + full lead fetch run |
| Hold action (with reason, notes, hold-until date) | Full-screen hold sub-form hides lead form; SDR retains ownership while on hold |
| Resume from hold | Restores to Validated; ownership retained |
| Reject (terminal) | Reason + notes; read-only after; ownership released |
| Route to Sales | Available from any status (Pending, Validated, On Hold). Sets status + `sales_status = Claimed` when rep assigned (null when queued); ownership released |
| Directed to Sales — full routed history | API `?routed=true&scope=mine`; stage badges + sub-filters (All / Awaiting Claim / In Progress / Quote Sent / On Hold / Dropped); includes Won & Rejected under All |
| Save without status change | PATCH lead fields; logs `lead_edited` for tracked field changes |
| Context-aware action buttons | On Hold → Resume shown; Routed leads → read-only drawer |
| Counts refresh after every action | bazaar:refresh-counts event fired |
| Activity logging | `lead_claimed` on Claim, `lead_edited` on field save, `lead_reassigned` on Admin reassign |

### ⏳ Not yet built — deferred

**1. Inbox tab is not separate from "All Leads"**
- Spec defines an **Inbox tab** (`is_inbox = true`, status = Pending) separate from the main All Leads queue
- Current implementation: All Leads tab shows all Pending + Validated leads regardless of `is_inbox`
- **When building:** Add `is_inbox` filter to the Inbox tab query; add a 5th tab or rework tab routing

**2. "Create Quote / Order" from Verify Drawer** ✅ Built (2026-05-12)
- "Create Quote / Order" button in the Verify Drawer footer is now live.
- Clicking it silently saves the lead (no toast, no close), then navigates to `/quotes/new?lead_id=<id>`.
- `status = 'Quoted'` is automatically set server-side by `POST /api/tickets` when a ticket is created for this lead — no separate "Quote" button needed.
- The old placeholder "Quote" tab in the drawer was intentionally left as-is; the full quote form lives on the dedicated `/quotes/new` page.

**4. "Update Customer?" prompt on action not built**
- ✅ **Built** — `promptThenRun()` wrapper in `verify-drawer.tsx` intercepts Validate, Route, Hold, and Reject actions. If `hasContactChanged()` detects a diff, an inline "Update customer profile?" prompt is shown before the action fires.

**5. History tab in Verify Drawer** ✅ Built
- `verify-drawer.tsx` now has a third "History" tab alongside Lead Info and Quote.
- Lazy-loads `GET /api/leads/[id]/activities` on first open — same pattern as Sales Drawer.
- Renders a vertical timeline with colored dots, human-readable activity labels, actor name, and relative timestamp. Full activity history is always available, even after a lead moves to Sales.

**6. Admin Override for terminal leads**
- Spec: Admin sees "Admin Override" banner and can reset a rejected lead
- **When building Admin enhancements:** Check role in drawer; if admin and terminal, show override banner + re-enable actions
