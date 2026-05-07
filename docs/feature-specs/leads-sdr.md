# Feature Spec — SDR Lead Pipeline

Route: `/leads` (SDR + Admin only)

---

## Overview

The SDR Lead Pipeline is the primary workspace for SDRs. It is a **tabbed page** with four tabs. The SDR works leads from the Inbox, validates them, and routes them to Sales, marks them as quoted, rejects them, or puts them on hold.

---

## Tab: Inbox

**Data:** `GET /api/leads/inbox` — leads where `is_inbox = true` and `status = 'Pending'`

### Table Columns

| Column | Notes |
|--------|-------|
| Name | `first_name + last_name` from linked customer |
| Company | |
| Source | Lead source label |
| Phone | Formatted display (stored digits-only) |
| Urgency | Colour-coded pill: High (red) / Medium (amber) / Low (green) / Not Defined (grey) |
| Status | `StatusPill` — Pending / Validated |
| Created | Relative time (e.g. "2 hours ago") |
| Action | **Verify** button — opens Verify Drawer + acquires lock |

### Behaviors

- **Search:** client-side filter on name, email, phone, company
- **Sort:** by `created_at` (newest first by default)
- **Skeleton loader** while data fetches — never full-page spinner
- **Verify button** → opens **Verify Drawer** (see below)
- **Supervisor unlock:** If a lead has been locked (future feature), admin can unlock it. Out of scope for v1 — field reserved.
- **Empty state:** "No leads in inbox" with an icon

### Badge

Tab header shows live count of Pending inbox leads.

---

## Tab: On Hold

**Data:** `GET /api/leads/workspace?status=On Hold`

Leads where `status = 'On Hold'` (SDR-initiated holds). Shows the SDR's own held leads.

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Hold Reason | |
| Held By | User display name |
| Hold Until | Formatted date (or "—" if indefinite) |
| Held At | Relative time |
| Actions | **Resume** button, **View** button |

### Behaviors

- **Resume** → `POST /api/leads/[id]/resume` with `role: 'sdr'` → lead returns to `Validated` → removes from this tab
- **View** → opens Verify Drawer (attempts lock; read-only if locked by another SDR)
- From hold, SDR can: **Resume** (→ `Validated`), **Reject** (terminal), **Route to Sales**

---

## Tab: Directed to Sales

**Data:** `GET /api/leads/workspace?status=Routed to Sales`

Leads the SDR has routed but that have not yet been claimed by Sales.

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Quote Total | Formatted currency or "—" |
| Quote Channel | |
| Routed At | `updated_at` when status changed to Routed |
| Actions | **View** button |

### Behaviors

- Read-only for SDR. View opens the drawer in view mode.
- No action buttons (SDR cannot un-route from this tab; use hold or re-verify flow)

---

## Tab: Rejected

**Data:** `GET /api/leads/workspace?status=Rejected`

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

## Lead Locking in the SDR Pipeline

When the SDR clicks **Verify** on a lead, the client immediately calls `POST /api/leads/[id]/lock` before opening the drawer.

- **Lock acquired** → drawer opens in edit mode (normal flow)
- **Lead locked by another SDR** → drawer opens in read-only mode with banner: **"[Name] is currently working this lead"**. No action buttons are shown.
- **Admin opens any lead** → always gets edit access, overrides any existing lock.

When the SDR closes the drawer (any way: save action, Cancel, Escape, close button) → `POST /api/leads/[id]/unlock` is called automatically.

See `docs/feature-specs/lead-locking.md` for full lock spec.

---

## Verify Drawer

A right-side drawer (slide-in panel) that opens when the SDR clicks **Verify** on an inbox lead or **View** on a workspace lead.

### Drawer Tabs

| Tab | Content |
|-----|---------|
| Lead Info | Contact fields, source, brand, interests |
| Quote | Quote total, channel, destination |
| History | `HistoryTimeline` component for this lead |

### Lead Info Tab — Contact Information section

Fields (editable when verifying, read-only when viewing):

| Field | Input | Required | Notes |
|-------|-------|----------|-------|
| Phone Number | Text | Yes | Digits-only placeholder; formatted for display; stored digits-only |
| Email Address | Email input | No | |
| First Name | Text | Yes | |
| Last Name | Text | No | |
| Source | Dropdown | Yes | From `LEAD_SOURCES` (Manual, Website, Google, Walk-in, Referral, etc.) |
| Created | Read-only | — | Timestamp, shown with lock icon |
| Authority | Dropdown | No | Decision maker? Yes / No |
| Company Name | Text | No | |
| Industry | Dropdown | Yes | From industry list |
| Website / Social | Text | No | |
| Urgency | Dropdown | No | Not Defined (stored as null) / High / Medium / Low |
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

**Duplicate banner:** While the SDR types phone or email, `GET /api/contacts/lookup` is called with 600ms debounce. If a match is found:
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
| **Validate** | `status = 'Pending'` | Sets `status = 'Validated'`, moves to workspace |
| **Quote** | Edit mode | Sets `status = 'Quoted'` with quote fields |
| **Route to Sales** | Edit mode | Sets `status = 'Routed to Sales'`, `sales_status = 'Ongoing'` |
| **On Hold** | Edit mode, status not Rejected | Opens hold sub-form inline |
| **Reject** | Edit mode, status not Rejected | Opens rejection form; sets `status = 'Rejected'` — **TERMINAL** |
| **Save** | Edit mode | `PATCH /api/leads/[id]` without changing status |
| **Close** | Always | Dismisses drawer + releases lock |

**Reject is terminal:** Once `status = 'Rejected'` is set, the drawer reopens in read-only mode for all non-Admin users. Only Admin sees an "Admin Override" banner with the ability to change status.

### Hold Sub-form (inline in drawer footer)

Radio button grid (2 columns) — reasons matching the POC:
- Awaiting customer response
- Awaiting artwork / files
- Awaiting payment confirmation
- Pricing review needed
- Vacation / customer unavailable
- Other

Plus:
- Notes (textarea, optional)
- Hold Until (date picker, optional)
- **Confirm Hold** button → `POST /api/leads/[id]/hold`

### Rejection Form (inline in drawer footer)

- Rejection Reason (dropdown: "Not a fit", "No budget", "Competitor", "Spam/Bot", "Other")
- Notes (textarea, optional)
- **Confirm Reject** button → verify endpoint with `status: 'Rejected'`

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
