# Feature Spec — SDR Lead Pipeline

Route: `/leads` (SDR + Admin only)

---

## Overview

The SDR Lead Pipeline is the primary workspace for SDRs. It is a **tabbed page** with four tabs. The SDR works leads from the Inbox, validates them, and routes them to Sales, marks them as quoted, rejects them, or puts them on hold.

---

## Tab: All Leads (Inbox)

**Data:** `GET /api/leads/workspace` — leads where `is_inbox = false` and `status` in `['Pending', 'Validated']`

**Visibility filtering (server-side):**
- **SDR:** only receives leads where `locked_by_id IS NULL OR locked_by_id = currentUserId`
- **Admin:** receives all leads (no filter); also gets `locked_by` profile joined on each row

### Table Columns

| Column | Visible to | Notes |
|--------|-----------|-------|
| Name | All | `first_name + last_name` from linked customer |
| Company | All | |
| Source | All | Lead source label |
| Phone | All | Formatted display (stored digits-only) |
| Urgency | All | Colour-coded pill: High / Medium / Low / Not Defined |
| Status | All | `StatusPill` — Pending / Validated |
| Created | All | Relative time (e.g. "2 hours ago") |
| Working | Admin only | Name of SDR currently working the lead; "—" if unlocked; "You" if admin themselves has it open |
| Action | All | **Verify** (SDR) / **View** + **Reassign** (Admin) |

### Behaviors

- **Search:** client-side filter on name, email, phone, company
- **Sort:** by `updated_at` (newest first)
- **Skeleton loader** while data fetches — never full-page spinner
- **Verify button** (SDR) → acquires lock → opens **Verify Drawer** in edit mode
- **View button** (Admin) → opens **Verify Drawer** in read-only mode, **no lock acquired**
- **Reassign button** (Admin only, shown only when `locked_by_id IS NOT NULL`) → opens a modal to reassign the lead to a different active SDR or unassign it entirely; the row updates in place and tab counts refresh
- **Empty state:** "No leads found." with muted text

### Badge

Tab count reflects the filtered list — only leads the current SDR can work (unlocked + own). Admin badge shows total.

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

**Data:** `GET /api/leads/workspace?status=Routed to Sales&scope=mine`

- **SDR:** only leads they personally routed (`sdr_id = currentUserId`) — they cannot see other SDRs' routed leads
- **Admin:** all routed leads across every SDR (scope filter is skipped server-side)

This is a **status-tracking view only**. The SDR's job is done once they route a lead. This tab lets them see what happened to their leads after handoff — no actions, no drawer.

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Phone | |
| Sales Status | `StatusPill` — current Sales progress; "Unclaimed" if no Sales rep has picked it up yet |
| Sales Rep | Name of the Sales rep who claimed it, or "—" if unclaimed |
| Routed | `updated_at` relative time |

### Behaviors

- **No action buttons** — read-only list, no drawer opens
- **No hover state** — rows are not interactive
- **Search** applies (client-side filter on name, email, phone, company)

### What "Sales Status" tells the SDR

| Sales Status | Meaning |
|---|---|
| Unclaimed | Routed but no Sales rep has picked it up yet |
| Ongoing | A Sales rep claimed it and is working it |
| Quote Sent | Sales rep has sent a quote |
| On Hold | Sales rep put it on hold |
| Won | Deal closed |

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
| Rejection Reason | |
| Rejected At | Relative time |
| Actions | **View** button |

### Behaviors

- Read-only view. No re-open action in v1.

---

## Lead Visibility — Lock-Based Filtering

The All Leads tab only shows leads the SDR can actually work:

- **Unlocked leads** (`locked_by_id IS NULL`) — available to any SDR
- **Leads the SDR themselves have open** (`locked_by_id = currentUserId`) — their own in-progress work

Leads currently locked by another SDR are **hidden from the queue entirely**. SDRs never see a lead that someone else is working — there is nothing to click on.

**Admin** sees all leads regardless of lock state, plus a **Working** column showing which SDR has each lead open. Admin opens leads with a **View** action (no lock acquired) so they can inspect any lead without disrupting an active SDR.

### Race Condition Safety Net

If SDR B's page is stale (loaded before SDR A clicked Verify), SDR B may still see the lead. When SDR B clicks Verify, `POST /api/leads/[id]/lock` returns `409` and the drawer opens in read-only mode with a banner: **"[Name] is currently working this lead"**. No action buttons are shown. SDR B can close the drawer — on next refresh the lead will no longer appear in their queue.

Closing the drawer does **not** release the lock. Ownership persists until the SDR routes the lead to Sales, rejects it, or an Admin reassigns/force-releases it.

See `docs/feature-specs/lead-locking.md` for full lock spec.

---

## Verify Drawer

A right-side drawer (slide-in panel) that opens when the SDR clicks **Verify** on an inbox lead or **View** on a workspace lead.

### Drawer Tabs

| Tab | Content |
|-----|---------|
| Lead Info | Contact fields, source, brand, interests |
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
| Authority | Dropdown | No | Decision maker? Yes / No |
| Company Name | Text | No | |
| Industry | Dropdown | Yes | **Admin-managed** — loaded from `lookup_values` (`industry` category). Edit in Admin → Dropdown Options. |
| Website / Social | Text | No | |
| Urgency | Dropdown | No | **Admin-managed** — loaded from `lookup_values` (`urgency` category). "Not Defined" is a static sentinel prepended to the list. Edit real options in Admin → Dropdown Options. |
| Returning Customer | Checkbox | No | "Returning Customer (Existing Client)" — blue highlight row when checked |

### Lead Info Tab — Verify Lead Comment section

A full-width textarea below the Contact Information grid:

- **Label:** "Verify Lead Comment"
- **Placeholder:** "Add verification notes before opening Order / Quote..."
- **Field:** `sdr_comment` — internal notes visible only to SDR and Admin
- Not visible to Sales rep

### Lead Info Tab — Product Interests section

- Checkbox grid with `PRODUCT_INTERESTS` (Labels, Boxes, Flyers, Stickers, etc.)
- For each checked interest: a quantity text input appears inline

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
| **Route to Sales** | Edit mode, any status | Saves all form edits + sets `status = 'Routed to Sales'`, `sales_status = 'Ongoing'` |
| **On Hold** | Edit mode, status not Rejected | Opens hold sub-form inline in footer |
| **Resume** | Edit mode, `status = 'On Hold'` | Saves all form edits + restores to `Pending` |
| **Reject** | Edit mode, status not Rejected | Opens rejection form inline in footer — **TERMINAL** |
| **Save** | Edit mode (far-right of footer) | `PATCH /api/leads/[id]` with current form values; closes drawer on success |
| **Close** | Read-only mode only | Dismisses modal — ownership is **not** released |

**Save button** is always visible at the far right of the footer when in edit mode (navy style). Route, Hold, and Reject also auto-save form fields before executing their specific action.

**Clicking outside the modal does not close it.** The backdrop is non-interactive. The SDR must use Save, Route to Sales, On Hold, Reject, or the ✕ header button (read-only only) to exit. This prevents accidental dismissal of in-progress edits.

**Route to Sales is always available.** The SDR can route a lead directly from `Pending` without validating first.

**Reject is terminal:** Once `status = 'Rejected'` is set, the drawer reopens in read-only mode for all non-Admin users. Only Admin sees an "Admin Override" banner with the ability to change status.

### Hold Sub-form (inline in drawer footer)

Radio button grid (2 columns). **Reasons are admin-managed** — loaded from `lookup_values` (`hold_reason` category) via `GET /api/lookups`. Admin edits from **Admin → Dropdown Options** without a code change.

Default seeded reasons: Awaiting customer response · Awaiting artwork / files · Awaiting payment confirmation · Pricing review needed · Vacation / customer unavailable · Other

- Notes (textarea, optional)
- Hold Until (date picker, optional)
- **Confirm Hold** button → `POST /api/leads/[id]/hold`

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
- **Returning Customer (Existing Client)** — checkbox with blue-tinted background row when checked
- **Verify Lead Comment** — textarea: "Add verification notes before opening Order / Quote..."

Footer:
- **Save Lead** → `POST /api/leads/manual` → creates lead + customer (if new)
- **Cancel**

Required fields (*): Phone, First Name, Source, Industry.

**Note:** Product Interests section is NOT in the add modal — it appears in the Verify Drawer after the lead is created. Keeps the add form fast.

---

### On Submit — What Happens to the Customer

**If SDR selected an existing customer:**
- Lead is created with `customer_id = existing_customer.id`
- No new customer created

**If SDR filled fresh info (no existing customer chosen):**
- New `customers` row created with: first_name, last_name, email, phone, company, industry, website
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
- Yes → `PATCH /api/customers/[id]` with changed fields
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
| All Leads / On Hold / Directed to Sales / Rejected tabs | Tab counts visible before clicking; scoped correctly per SDR |
| Lock-based lead visibility (soft lock / permanent ownership) | SDRs only see unlocked leads + their own; locked-by-other leads hidden; closing drawer does NOT release lock |
| Admin View action (no lock) | Admin opens any lead read-only without acquiring a lock |
| Admin "Working" column | All Leads table shows which SDR owns each lead; mobile cards too |
| Admin Reassign action | Button shown on owned leads; modal with SDR dropdown + Unassign option; logs `lead_reassigned` activity |
| Race condition safety net | If SDR clicks Verify on a stale lead, 409 → read-only drawer with locker banner |
| Manual Add Lead modal | Phone lookup + deduplication banner + customer auto-fill |
| Verify Drawer (soft lock, lock banner) | Lock acquired on Verify; ownership persists across close/save/validate/hold until Route or Reject |
| Product Interests — select + quantity rows | Replaced checkbox grid with select picker + quantity inputs |
| Hold action (with reason, notes, hold-until date) | Full hold sub-form; SDR retains ownership while on hold |
| Resume from hold | Restores to Validated; ownership retained |
| Reject (terminal) | Reason + notes; read-only after; ownership released |
| Route to Sales | Available from any status (Pending, Validated, On Hold). Sets status + sales_status = Ongoing; ownership released; Directed to Sales tab shows Sales Rep + Sales Status — no drawer, no actions |
| Save without status change | PATCH lead fields; logs `lead_edited` for tracked field changes |
| Context-aware action buttons | On Hold → Resume shown; Routed leads → view-only |
| Counts refresh after every action | bazaar:refresh-counts event fired |
| Activity logging | `lead_claimed` on Verify, `lead_edited` on field save, `lead_reassigned` on Admin reassign |

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
