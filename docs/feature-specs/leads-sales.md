# Feature Spec — Sales Pipeline

Route: `/sales` (Sales + Admin only)

---

## Overview

The Sales Pipeline shows leads that have been routed from SDRs. When a Sales rep opens a lead, it is **locked** to them — other Sales reps see it in read-only mode with a "Being worked by [Name]" banner. See `docs/feature-specs/lead-locking.md` for full locking behavior.

 Sales reps work these leads: claim them, update their status, create quotes and orders, and put them on hold.

---

## Tab: Pipeline

**Data:** `GET /api/leads/workspace?status=Routed to Sales` filtered to `sales_status IN ('Ongoing', 'Quote Sent')`, AND where `sales_owner_id = current_user` OR `sales_owner_id IS NULL` (unclaimed).

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Quote Total | SDR's quoted amount (if any) |
| Sales Status | Pill: Ongoing / Quote Sent |
| Owner | Assigned sales rep name (or "Unclaimed") |
| Routed At | When the lead was routed |
| Actions | **Claim** (unclaimed) or **Open** (owned) |

### Behaviors

- **Claim** → `PATCH /api/leads/[id]` with `sales_owner_id = current_user`, `sales_status = 'Ongoing'` → row updates inline to show "Claimed"
- **Open** → opens Sales Drawer
- Admin sees all leads in pipeline across all sales reps
- **Search:** client-side filter on name, email, company

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

## Tab: Rejected (SDR View)

**Data:** workspace leads where `status = 'Rejected'` — leads rejected by SDR, visible to Sales as context.

### Table Columns

| Column | Notes |
|--------|-------|
| Name | |
| Company | |
| Rejection Reason | |
| SDR | Who rejected it |
| Rejected At | |
| Actions | **View** (read-only) |

### Behaviors

- Read-only. Sales cannot modify SDR-rejected leads.
- Useful for Sales awareness — they can see what's been turned away.

---

## Sales Drawer

A right-side drawer for a Sales rep to work a routed lead.

### Drawer Tabs

| Tab | Content |
|-----|---------|
| Lead Info | Contact details (read-only) + Sales fields |
| Order / Quote | Create or view job ticket |
| History | `HistoryTimeline` component |

### Lead Info Tab

Read-only view of contact fields (set by SDR). Editable Sales fields:

- Sales Status (dropdown: Ongoing / Quote Sent / Won / Dropped)
- Notes (free-text notes from Sales perspective)
- Quote Total (Sales can override SDR's quoted amount)
- Payment Type

### Order / Quote Tab

- Button: **Create Quote** → opens full ticket builder (Order Drawer) in `quote` mode
- Button: **Create Order** → opens full ticket builder in `order` mode
- If a ticket already exists for this lead: shows existing ticket in read-only view with **Edit** button

### Footer Actions

**All action buttons are hidden in read-only mode (lead locked by another Sales rep).**

| Action | When Available | What it does |
|--------|---------------|--------------|
| **Convert to Order** | Edit mode, `sales_status` active | Opens Order Drawer in `order` mode; on ticket creation sets `sales_status = 'Won'` |
| **On Hold** | Edit mode, status not Rejected | Opens hold sub-form; sets `sales_status = 'On Hold'` |
| **Reject** | Edit mode, status not Rejected | Opens rejection form; sets `sales_status = 'Rejected'` — **TERMINAL** |
| **Save** | Edit mode | `PATCH /api/leads/[id]` with changed fields |
| **Close** | Always | Dismisses drawer + releases lock |

**Reject is terminal:** Once `sales_status = 'Rejected'`, the drawer reopens in read-only mode for all non-Admin users. Only Admin can change this status.

### Hold Sub-form

- Hold Reason dropdown: "Waiting for client decision", "Budget not confirmed", "Seasonal / timing", "Other"
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

- Once `sales_status = 'Rejected'`, the lead appears in the **Rejected** tab
- No action buttons in the drawer for non-Admin users
- Admin can open the lead with an "Admin Override" banner and set it back to `Ongoing` or any other status

---

## Loading & Error States

Same pattern as SDR pipeline:
- Table skeleton while loading
- Optimistic removal when Sales acts on a lead
- Toast on success/error

---

## Build Status & Gaps (as of 2026-05-07)

### ✅ Built and working
| Feature | Notes |
|---------|-------|
| Pipeline / On Hold / Rejected tabs | All three tabs with counts visible before clicking |
| Claim unclaimed lead | Inline claim → row updates |
| Open drawer (with locking) | Lock acquired on open, released on close |
| Sales Status (Ongoing / Quote Sent) | Editable in drawer |
| Quote Total | Editable in drawer |
| On Hold action | Hold sub-form with reason, notes, hold-until date |
| Resume from hold | Restores to Ongoing |
| Reject (terminal) | Rejection reason + notes, read-only after |
| Save | PATCH lead with Sales Status + Quote Total |
| Close (releases lock) | Unlock API called on close |
| Read-only mode (locked by other user) | "Being worked by [Name]" banner |
| Terminal state banner | Shown for Rejected / Won / Dropped |

### ⏳ Not yet built — blocked on Tickets phase
These items are deliberately deferred. Build them during the Tickets phase.

**1. Sales Status: `Won` and `Dropped` options missing from dropdown**
- Current dropdown: `Ongoing`, `Quote Sent`
- Spec dropdown: `Ongoing`, `Quote Sent`, `Won`, `Dropped`
- These were omitted because `Won` is normally set automatically when an Order ticket is created. `Dropped` is set when the lead is lost without a formal rejection.
- **When building Tickets:** Add `Won` and `Dropped` to `SALES_STATUS_OPTIONS` in `components/sales-drawer.tsx`. When status changes to `Won` or `Dropped`, move the lead out of the Pipeline tab.

**2. Order / Quote tab is a placeholder**
- Current: shows "Coming in the Tickets phase."
- Spec: Two buttons — **Create Quote** (opens ticket builder in `quote` mode) and **Create Order** (opens ticket builder in `order` mode). If a ticket already exists for this lead, show it in read-only with an **Edit** button.
- **When building Tickets:** Replace the placeholder section in `SalesDrawer` `activeTab === "order"` with the `OrderDrawer` component.

**3. "Convert to Order" footer button missing**
- Spec: available in edit mode when lead is active; opens Order Drawer in `order` mode; on successful ticket creation, sets `sales_status = 'Won'` automatically.
- **When building Tickets:** Add this button to the footer `footerMode === "actions"` block in `components/sales-drawer.tsx`. Wire it to open `OrderDrawer` and on `onTicketCreated` callback patch `sales_status = 'Won'`.

**4. Admin Override for terminal leads**
- Spec: Admin can open a Rejected/Won/Dropped lead with an "Admin Override" banner and reset it to `Ongoing` or any other status.
- **When building Admin enhancements:** Check `roleName === 'admin'` in `SalesDrawer`; if true and `isTerminal`, show override banner and re-enable action buttons.

**5. Notes field (Sales perspective)**
- Spec: free-text notes field in the Lead Info tab editable by Sales
- Not currently in the form — `SalesForm` interface only has `sales_status` and `quote_total`
- **When building:** Add `sales_notes: string` to `SalesForm`, render a textarea in the Sales Fields section, include in the `PATCH` payload.
