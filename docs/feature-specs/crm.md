# Feature Spec — CRM

Route: `/crm` (all roles)

---

## Overview

The CRM is the master customer registry. Every contact who has ever been a lead is tracked here. The CRM shows all customers, their status (New / Known / Returning), quotes & orders, and activity timeline.

**List API:** `GET /api/customers` — slim customer fields plus lightweight `lead_count` / `ticket_count` aggregates (2026-05-22). Silent refresh on `bazaar:leads-changed` without skeleton flash.

---

## Customer Status — Three Tiers

This replaces the manual "Returning Customer" checkbox on leads.

| Status | Definition | Badge colour |
|--------|-----------|--------------|
| **New Contact** | Phone/email exists in system but no leads yet (e.g. added manually) | Grey |
| **Known Customer** | Has 1+ leads but zero completed orders | Blue |
| **Returning Customer** | Has 1+ completed orders (ticket_status = 'completed' or 'approved') | Gold/Green |

### Where this status is computed

- **Dedup lookup** (`GET /api/customers/lookup`) → server counts the customer's completed orders and returns `{ customer, order_count, lead_count, customer_status: 'new' | 'known' | 'returning' }`.
- **Customer profile page** → displays the badge prominently at the top.
- **Add Lead modal** → dedup banner shows status automatically (see Enriched Dedup Banner below).
- **Verify Drawer** → shows customer status badge next to their name.

### Impact on `is_returning_customer` field on leads

Once the CRM is built:
- The field is **auto-set** when a lead is created: `is_returning_customer = (order_count > 0)`.
- The manual checkbox is removed from the Add Lead form and Verify Drawer.
- Historical leads with the checkbox manually set are left as-is.

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
- **Status badge**: New Contact / Known Customer / Returning Customer
- Heat tag badge (Hot / Warm / Cold)
- **Add Quote** button → `/quotes/new` with customer params pre-filled (same as CRM list)
- **Edit** button → opens Edit Customer modal
- **Merge Duplicate** button

### Contact grid
- Company, Phone, Email, Industry, Website
- **Decision Maker** — `customers.authority` (`yes` / `no`)
- Total Leads, Customer Since

> **Source** is quote/lead metadata — shown on each quote row in Quotes & Orders and on lead history, not in the company contact grid.

### Section: Quotes & Orders
List of all `job_tickets` for this customer. Each row shows reference, date, **source** (quote or lead), total, and status. Click → quote/order detail.

> **Lead History** was removed from the customer profile (May 2026). SDRs view routed/won lead details from the **Leads** workspace (Directed to Sales / Won tabs → read-only Verify Drawer).

### Section: Order History
Table of all `job_tickets` linked to this customer.

| Column | Notes |
|--------|-------|
| Type | Quote / Order pill |
| Status | Ticket status pill |
| Total | Formatted currency |
| Created By | |
| Created | Relative time |
| Action | **View** → opens ticket/order drawer |

### Section: Activity Timeline
`HistoryTimeline` component — queries `GET /api/activity?customer_id=[id]` which returns all activity across all linked leads and tickets for this customer.

---

## CRM List Page (`/crm`)

### Table Columns

| Column | Notes |
|--------|-------|
| Name | `first_name + last_name` |
| Company | Click company name (or **—**) → customer profile |
| Phone | `tel:` link when present |
| Email | `mailto:` link when present |
| Status | New / Known / Returning badge |
| Industry | Lookup label via `GET /api/lookups?categories=industry` (not raw value) |
| Leads | Count of qualifying leads |
| Last Activity | Relative time from most recent lead or ticket |
| Actions | **View** → customer profile · **Add Quote** → `/quotes/new` pre-filled |

**Row interaction:** The table row itself is not clickable. Use **Company**, **View**, or action buttons.

### Mobile cards
- Company link opens profile; phone/email use `tel:` / `mailto:` when present
- Industry shown as lookup label when set

### Filters & Controls

| Control | Behaviour |
|---------|---------|
| Search | Client-side filter on name, email, phone, company |
| Sort | By name, company, last activity, order count |
| Status filter | New / Known / Returning |
| Heat Tag filter | Hot / Warm / Cold |

### Great Heat Definition

A customer is marked **Great Heat** if `heat_tag = 'hot'` OR if any of their leads has `status IN ('Validated', 'Quoted', 'Routed to Sales')`.

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

**When it appears:** "Merge" button on the customer profile page (`/crm/customers/[id]`).

**Auth:** `POST /api/customers/[id]/merge` — **Admin and Sales only** (`403` for SDR, Accountant, etc.). Destructive: deletes the source customer after reassigning leads and activities.

**Flow:**
1. Search input to find the duplicate customer
2. Side-by-side preview of both customers' fields
3. User selects which values to keep per field
4. **Confirm Merge** → server reassigns all leads + tickets from duplicate to surviving customer → deletes duplicate
5. Logs `lead_merged` activity on all affected leads

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
