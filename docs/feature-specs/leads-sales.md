# Feature Spec — Sales Pipeline

Route: `/sales` (Sales + Admin only)

---

## Overview

The Sales Pipeline shows leads that have been routed from SDRs. When a Sales rep opens a lead, it is **locked** to them — other Sales reps see it in read-only mode with a "Being worked by [Name]" banner. See `docs/feature-specs/lead-locking.md` for full locking behavior.

 Sales reps work these leads: claim them, update their status, create quotes and orders, and put them on hold.

---

## Tab: Pipeline

**Data:** `GET /api/leads/workspace?status=Routed to Sales` — leads with `sales_status IN ('Ongoing', 'Quote Sent', null)`, filtered server-side to `sales_owner_id IS NULL OR sales_owner_id = currentUserId` for Sales reps. Admins see all.

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Phone | Formatted display |
| Sales Status | Pill: Ongoing / Quote Sent (or "—" if null) |
| Urgency | `UrgencyPill` |
| Owner | `ownerLabel`: "You" / sales rep name / "Unclaimed" |
| Routed | `updated_at` relative time |
| Action | **Claim** (unclaimed, Sales only) / **Open** (owned, Sales only) / **View** (Admin, no lock) |

### Behaviors

- **Claim** → `POST /api/leads/[id]/claim` → sets `sales_owner_id = currentUser`, `sales_status = 'Ongoing'`; logs `lead_sales_claimed`; row updates in place
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
| Hold Reason | |
| Hold Until | |
| Held At | |
| Actions | **Resume** button, **Open** button |

### Behaviors

- **Resume** → `POST /api/leads/[id]/resume` with `role: 'sales'` → restores `sales_status` from `prev_sales_status`

---

## Tab: Rejected

**Data:** `GET /api/leads/workspace?status=Rejected&prev_status=Routed+to+Sales` — only leads that were **rejected from the sales pipeline** (i.e. their previous status was `Routed to Sales`). SDR-rejected leads that never reached sales are excluded. **Lazy-fetched** — only loaded when the tab is first opened (not on page mount). Count badge comes from `/api/leads/sales-counts` upfront (which applies the same `prev_status` filter).

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Phone | Formatted display |
| Rejection Reason | |
| Rejected | `updated_at` relative time |
| Action | **View** (read-only, no lock) |

### Behaviors

- Read-only. **View** opens Sales Drawer with no lock acquired.
- Shows only leads that a Sales rep explicitly rejected while working them in the pipeline.
- SDR-rejected leads (rejected before being routed to Sales) are deliberately excluded — those remain visible on the SDR `/leads` Rejected tab instead.

---

## Sales Drawer

A right-side drawer for a Sales rep to work a routed lead.

### Drawer Tabs

| Tab | Content |
|-----|---------|
| Lead Info | Contact details (read-only) + Sales fields |
| Order / Quote | Create or view job ticket |
| History | Lead activity timeline — fetches  lazily on first open |

### Lead Info Tab

Read-only view of contact fields (set by SDR). Editable Sales fields:

- Sales Status (dropdown: Ongoing / Quote Sent / Won / Dropped)
- Notes (free-text notes from Sales perspective)
- Quote Total (Sales can override SDR's quoted amount)
- Payment Type

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
| **Save** | Edit mode | `PATCH /api/leads/[id]` with changed fields |
| **Close** | Always | Dismisses drawer + releases lock |

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

## Build Status & Gaps (as of 2026-05-09)

### ✅ Built and working
| Feature | Notes |
|---------|-------|
| Pipeline / On Hold / Rejected tabs | All three tabs with counts visible before clicking; Rejected shows only sales-pipeline rejections () |
| Claim unclaimed lead | `POST /api/leads/[id]/claim` → row updates in place; logs `lead_sales_claimed` activity |
| Open owned lead (with locking) | Lock acquired on open, released on close |
| Admin View (no lock) | Admin opens any lead read-only without acquiring a lock — Sales rep's edit session undisturbed |
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
- `Won` is set automatically when an approved order ticket is created. `Dropped` is set when the lead is lost without a formal rejection.
- **When building:** Add `Won` and `Dropped` to `SALES_STATUS_OPTIONS` in `components/sales-drawer.tsx`; move lead out of Pipeline tab when either is selected.

**2. Order / Quote tab** ✅ Built (2026-05-12)
- "Create Quote / Order" button now saves the lead silently and navigates to `/quotes/new?lead_id=<id>`.
- Full ticket builder lives at `/quotes/new` and `/quotes/[id]` — dedicated pages, not a modal.
- `status = 'Quoted'` is set automatically by `POST /api/tickets` when a ticket is created.

**3. Admin Override for terminal leads**
- Spec: Admin can open a Rejected/Won/Dropped lead with an "Admin Override" banner and reset it to `Ongoing` or any other status.
- **When building Admin enhancements:** Check `roleName === 'admin'` in `SalesDrawer`; if true and `isTerminal`, show override banner and re-enable action buttons.

**5. Notes field (Sales perspective)**
- ✅ **Built** — `sales_notes` field added to the Lead Info tab (Sales Fields section). Saves via `PATCH /api/leads/[id]`. Changes logged to activity history as `lead_edited`.
