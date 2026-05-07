# Feature Spec — CRM

Route: `/crm` (all roles)

---

## Overview

The CRM is the master customer registry. Every contact who has ever been a lead is tracked here. The CRM shows all customers, their status (New / Known / Returning), their full lead history, order history, and activity timeline.

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

### API change needed
`GET /api/customers/lookup` response expands to:
```json
{
  "customers": [
    {
      ...Customer,
      "order_count": 3,
      "lead_count": 5,
      "last_order_at": "2025-03-12T...",
      "customer_status": "returning"
    }
  ],
  "count": 1
}
```

---

## Customer Profile Page (`/crm/customers/[id]`)

A dedicated full page for a single customer. Accessible from:
- Clicking a customer row in the CRM list
- Clicking customer name in the Verify Drawer or Sales Drawer
- Clicking customer name in the dedup banner

### Header
- Customer name (large), company, phone, email
- **Status badge**: New Contact / Known Customer / Returning Customer
- Heat tag badge (Hot / Warm / Cold)
- Edit button → opens Edit Customer modal
- Created date

### Section: Lead History
Table of all leads ever created for this customer.

| Column | Notes |
|--------|-------|
| Status | `StatusPill` |
| Source | |
| SDR | Who created/worked it |
| Created | Relative time |
| Action | **View** → opens Verify Drawer in read-only mode |

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
| Company | |
| Phone | Formatted |
| Email | |
| Status | New / Known / Returning badge |
| Heat Tag | `heat_tag` badge |
| Leads | Count of all leads |
| Orders | Count of completed tickets |
| Last Activity | Relative time from most recent lead or ticket |
| Actions | **View** → customer profile page |

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
- Industry
- Website
- Heat Tag (Hot / Warm / Cold / None)

**Save** → `PATCH /api/customers/[id]` + logs `contact_edited` activity.

---

## Merge Duplicate Customers

**When it appears:** "Merge" button on the customer profile page (SDR and Admin only).

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

## Add Order from CRM

Available to SDR and Sales via **+ Add Order** button on the customer profile page.

**Flow:**
1. Opens the Order/Quote Drawer pre-filled with the customer's info
2. `ticket_kind` defaults to `'order'`
3. `customer_id` pre-set from the current customer
4. No `linked_lead_id` (standalone order, not tied to a specific lead)

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
