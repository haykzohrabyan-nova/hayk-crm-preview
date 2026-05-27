# Feature Spec — Sales Pipeline

Route: `/sales` (Sales + Admin only)

---

## Overview

The Sales Pipeline shows leads that have been routed from SDRs. When a Sales rep opens a lead, it is **locked** to them — other Sales reps see it in read-only mode with a "Being worked by [Name]" banner. See `docs/feature-specs/lead-locking.md` for full locking behavior.

 Sales reps work these leads: claim them, update their status, create quotes and orders, and put them on hold. **Won credit** for linked leads is applied when the ticket enters **`in_production`**, not at order conversion.

> **List vs drawer (2026-05-22):** Tab tables load a **slim** lead row from `GET /api/leads/workspace`. Opening the Sales Drawer fetches the **full** record via `GET /api/leads/[id]` (`fetchLeadById()`).

> **Page load (2026-05-26):** On mount, `sales-page.tsx` calls **`GET /api/leads/sales/page-data?tab=…`** — one auth pass returns the active tab's slim list **and** all tab badge counts (`pipeline`, `hold`, `rejected`). Lookups and sales user list **lazy-load** when drawer/modal opens.

---

## Tab: Pipeline

**Data:** `GET /api/leads/workspace?status=Routed to Sales` — leads with `sales_status IN ('Ongoing', 'Quote Sent', null)`, filtered server-side to `sales_owner_id IS NULL OR sales_owner_id = currentUserId` for Sales reps. Admins see all.

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` from `interests` + `quantities` |
| Phone | Formatted display |
| Sales Status | Pill: Ongoing / Quote Sent (or "—" if null) |
| Urgency | `UrgencyPill` |
| Owner | `ownerLabel`: "You" / sales rep name / "Unclaimed" |
| Routed | `updated_at` relative time |
| Action | **Claim** (unclaimed, Sales only) / **Open** (owned, Sales only) / **View** (Admin, no lock) |

### Behaviors

- **Claim** → `POST /api/leads/[id]/claim` → sets `sales_owner_id = currentUser`, `sales_status = 'Ongoing'`; logs `lead_sales_claimed`; the modal opens immediately so the Sales rep can begin working the lead right away. The lead remains assigned even after the modal is closed or the page is refreshed.
- **Open** (owned lead) → `POST /api/leads/[id]/lock` → opens Sales Drawer in edit mode; 409 → read-only with banner
- **View** (Admin) → opens Sales Drawer in read-only mode with **no lock acquired** — active Sales rep is undisturbed
- **Search:** client-side filter on name, email, phone, company

---

## Tab: On Hold

**Data:** workspace leads where `sales_status = 'On Hold'` and `sales_owner_id = current_user`

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` |
| Hold Reason | |
| Hold Until | |
| Held At | |
| Actions | **Resume** button, **Open** button |

### Behaviors

- **Resume** → `POST /api/leads/[id]/resume` with `role: 'sales'` → restores `sales_status` from `prev_sales_status`

---

## Tab: Rejected

**Data:** `GET /api/leads/workspace?status=Rejected&prev_status=Routed+to+Sales` — only leads that were **rejected from the sales pipeline** (i.e. their previous status was `Routed to Sales`). SDR-rejected leads that never reached sales are excluded. **Lazy-fetched** — only loaded when the tab is first opened (not on page mount). Count badge comes from page-data `counts.rejected` on mount (same `prev_status` filter as `/api/leads/sales-counts`).

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Product Interests | `ProductName[quantity]` |
| Phone | Formatted display |
| Rejection Reason | |
| Rejected | `updated_at` relative time |
| Action | **View** (read-only, no lock) |

### Behaviors

- Read-only. **View** opens Sales Drawer with no lock acquired.
- Shows only leads that a Sales rep explicitly rejected while working them in the pipeline.
- SDR-rejected leads (rejected before being routed to Sales) are deliberately excluded — those remain visible on the SDR `/leads` Rejected tab instead.

---

## Sales Modal

A **centered modal** (not a side drawer) for a Sales rep to work a routed lead. The modal is `max-width: 780px`, `80vh` height, `12px` border-radius, with a backdrop overlay. Clicking outside the backdrop does **not** close the modal.

### Drawer Tabs

| Tab | Content |
|-----|---------|
| Lead Info | Contact details (read-only) + Sales fields |
| Order / Quote | Create or view job ticket |
| History | Lead activity timeline — fetches  lazily on first open |

### Lead Info Tab

Read-only view of contact fields (set by SDR). **Product Interests** shown as badge pills (`ProductName[quantity]`). **Sales status** appears as a pill in the modal header (not repeated in the body).

**Sales Notes** section — only editable field. Empty quote-related fields are hidden until a quote exists on the lead (`quote_total > 0`).

Removed from drawer body: Assigned To, Sales Status, and empty Quote Total rows (pipeline table and header already cover status/ownership).

### Order / Quote Tab

- Button: **Create Quote / Order** → silently saves the lead, then navigates to `/quotes/new?lead_id=<id>` (dedicated full page, not a modal/drawer)
- The full quote builder lives at `/quotes/new` and `/quotes/[id]` — see `docs/feature-specs/tickets.md`
- If a ticket already exists for this lead, the Sales rep can find it on `/quotes` or `/orders` pages

### Footer Actions

**All action buttons are hidden in read-only mode (lead locked by another Sales rep).**

| Action | When Available | What it does |
|--------|---------------|--------------|
| **Create Quote / Order** | Edit mode | Saves lead silently → navigates to `/quotes/new?lead_id=<id>`; `sales_status` is updated automatically by the ticket creation API |
| **On Hold** | Edit mode, status not Rejected | Opens hold sub-form; sets `sales_status = 'On Hold'` |
| **Reject** | Edit mode, status not Rejected | Opens rejection form; sets `status = 'Rejected'`, clears `sales_status = null` + auto-saves `prev_status = 'Routed to Sales'` — **TERMINAL** |
| **Close** | Always (in same row as other action buttons, just before Save) | Dismisses modal + releases lock |
| **Save** | Edit mode (far-right of footer) | `PATCH /api/leads/[id]` with changed fields |

**Clicking outside the modal does not close it.** The backdrop is non-interactive. Use Save, On Hold, Reject, or Close to exit.

**Reject is terminal:** Once `status = 'Rejected'`, the drawer reopens in read-only mode for all non-Admin users. Only Admin can change this status.

### Hold Sub-form

- **Hold reasons are admin-managed** — loaded from `lookup_values` (`hold_reason` category) via `GET /api/lookups`. Edit from Admin → Dropdown Options. Default seeded reasons: Awaiting customer response · Awaiting artwork / files · Awaiting payment confirmation · Pricing review needed · Vacation / customer unavailable · Other
- Notes (optional)
- Hold Until (date picker, optional)
- **Confirm Hold** → `POST /api/leads/[id]/hold` with `role: 'sales'`
- Sets `sales_status = 'On Hold'`, snapshots `prev_sales_status = 'Ongoing'`

### Resume from Hold

From the Sales hold tab:
- **Resume** → `POST /api/leads/[id]/resume` with `role: 'sales'`
- Always restores to `Ongoing` (Sales hold can only go back to `Ongoing`, per business rule)
- Lead moves from On Hold tab back to Pipeline tab

### Rejected — Terminal State

- Once `status = 'Rejected'` (with `prev_status = 'Routed to Sales'` and `sales_status = null`), the lead appears in the Sales **Rejected** tab
- No action buttons in the drawer for non-Admin users
- Admin can open the lead with an "Admin Override" banner and set it back to `Ongoing` or any other status

---

## Loading & Error States

Same pattern as SDR pipeline:
- Table skeleton while loading
- Optimistic removal when Sales acts on a lead
- Toast on success/error

---

## Build Status & Gaps (as of 2026-05-26)

### ✅ Built and working
| Feature | Notes |
|---------|-------|
| Pipeline / On Hold / Rejected tabs | All three tabs with counts visible before clicking; Rejected shows only sales-pipeline rejections () |
| Product Interests column | All tabs — `ProductName[quantity]` via `format-lead-product-interests.ts`; drawer pills same format |
| Claim unclaimed lead | `POST /api/leads/[id]/claim` → **modal opens immediately** so Sales rep can start working; row persists assigned even after modal close or page refresh; logs `lead_sales_claimed` activity |
| Open owned lead (with locking) | Lock acquired on open, released on close (temporary lock — different from SDR soft lock) |
| Admin View (no lock) | Admin opens any lead read-only without acquiring a lock — Sales rep's edit session undisturbed |
| Sales Drawer → Sales Modal | Component converted from a right-side slide-in drawer to a centered modal (`780px` max-width, `80vh` height). Close button placed inline with other action buttons just before Save. |
| Sales Status (Ongoing / Quote Sent) | Editable in drawer |
| Quote Total | Editable in drawer |
| On Hold action | Hold sub-form with reason, notes, hold-until date |
| Resume from hold | Restores to Ongoing |
| Reject (terminal) | Rejection reason + notes, read-only after |
| Save | PATCH lead with Sales Status + Quote Total |
| Close (releases lock) | Unlock API called on close (Sales uses temporary locking — different from SDR soft lock) |
| Read-only mode (locked by other user) | "Being worked by [Name]" banner |
| Terminal state banner | Shown for Rejected / Won / Dropped |
| Rejected tab | Lazy-fetched on first open; fetches ; Phone + Rejection Reason columns; View read-only (no lock) |

### ⏳ Not yet built — deferred to Phase 8+

**1. Sales Status: `Won` and `Dropped` options missing from dropdown**
- Current dropdown: `Ongoing`, `Quote Sent`
- Spec dropdown: `Ongoing`, `Quote Sent`, `Won`, `Dropped`
- `Won` is set automatically when the linked ticket enters **`in_production`** (via `markLeadWonOnProduction()`). `Dropped` is set when the lead is lost without a formal rejection.
- **When building:** Add `Won` and `Dropped` to `SALES_STATUS_OPTIONS` in `components/sales/sales-drawer.tsx`; move lead out of Pipeline tab when either is selected.

**2. Order / Quote tab** ✅ Built (2026-05-12)
- "Create Quote / Order" button now saves the lead silently and navigates to `/quotes/new?lead_id=<id>`.
- Full ticket builder lives at `/quotes/new` and `/quotes/[id]` — dedicated pages, not a modal.
- `status = 'Quoted'` is set automatically by `POST /api/tickets` when a ticket is created.

**3. Admin Override for terminal leads**
- Spec: Admin can open a Rejected/Won/Dropped lead with an "Admin Override" banner and reset it to `Ongoing` or any other status.
- **When building Admin enhancements:** Check `roleName === 'admin'` in `SalesDrawer`; if true and `isTerminal`, show override banner and re-enable action buttons.

**5. Notes field (Sales perspective)**
- ✅ **Built** — `sales_notes` field added to the Lead Info tab (Sales Fields section). Saves via `PATCH /api/leads/[id]`. Changes logged to activity history as `lead_edited`.
