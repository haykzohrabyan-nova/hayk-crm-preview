# Feature Spec — Tickets (Quotes & Orders)

Route: `/tickets` (all roles)
Tabs: **Quoted Requests** | **Orders**

---

## Overview

The Tickets module manages all job tickets: quotes sent to clients and production orders. Both quote and order use the same `job_tickets` table, distinguished by `ticket_kind`.

---

## Tab: Quoted Requests

**Data:** Two sets of items combined in one list:
1. Tickets where `ticket_kind = 'quote'` (from `GET /api/tickets?kind=quote`)
2. Leads where `status = 'Quoted'` but no ticket yet exists (from workspace leads)

The second set ensures that leads quoted by SMS/WhatsApp (without a formal ticket) appear here too.

### Table Columns

| Column | Type | Notes |
|--------|------|-------|
| Contact | Name + company | |
| Type | "Ticket" or "Lead Quote" pill | |
| Channel | SMS / WhatsApp / Email / In-person | |
| Quote Total | Formatted currency | |
| Status | Ticket status pill or lead status pill | |
| Follow-up | Date or "—" | |
| Created At | Relative time | |
| Actions | **View** button |

### Behaviors

- **View** → opens Order Drawer in view mode (or lead drawer for Lead Quote items)
- **Search:** filter on contact name, company, email
- **Period filter:** shared with Statistics — `created_at` within selected range
- **Sort:** by date, amount, status

---

## Tab: Orders

**Data:** `GET /api/tickets?kind=order`

### Table Columns

| Column | Notes |
|--------|-------|
| Order # | Ticket `id` (short — last 8 chars of uuid displayed) |
| Contact | Name + company |
| Total | Formatted currency |
| Status | `ticket_status` pill |
| Rush | Rush badge if `rush = true` |
| Created By | User name |
| Created At | Relative time |
| Actions | **View**, **Print PDF** buttons |

### Behaviors

- **View** → opens Order Drawer in view mode
- **Print PDF** → generates and downloads the order ticket PDF via `lib/utils/order-ticket-pdf.ts` (using `jspdf`)
- **Search:** filter on contact name, order #, company
- **Period filter:** shared with Statistics

---

## Order Drawer (Ticket Builder)

Used in two modes:
- **Create mode** — new quote or order
- **View/Edit mode** — opened from Quoted Requests or Orders tab

### Drawer Header

- Title: "New Quote" / "New Order" / "Quote #..." / "Order #..."
- Status pill (view mode)
- Rush badge (if applicable)

### Drawer Tabs

| Tab | Content |
|-----|---------|
| Details | Contact, product lines, pricing |
| Follow-up | Follow-up scheduling |
| History | `HistoryTimeline` for this ticket |

### Details Tab — Contact Section

- Contact email (text input with lookup)
- Contact name
- Contact company
- If opened from a lead or CRM row: pre-filled, locked

### Details Tab — Product Lines (Order mode)

Dynamic list of line items. Each line:

| Field | Notes |
|-------|-------|
| Description | What is being printed |
| Quantity | Number |
| Size | e.g. "4x6 inches" |
| Material | Dropdown (from Admin-managed product catalog) |
| Finish | Dropdown (e.g. Matte, Glossy, Uncoated) |
| Unit Price | Currency |
| Line Total | Auto-computed (qty × unit price) |

- **+ Add Line** button
- **Remove** button per line

### Details Tab — Quote SKUs (Quote mode)

Same structure as product lines but uses SKU field instead of size/material/finish.

### Details Tab — Pricing Summary

| Field | Notes |
|-------|-------|
| Subtotal | Sum of all line totals |
| Discount % | Optional — auto-computes discount amount |
| Discount Amount | Optional — direct entry overrides % |
| Total | `subtotal - discount_amount` |
| Payment Type | Cash / Check / Card / Transfer |
| Prepay Amount | Deposit collected |
| Rush | Toggle switch |
| Notes | Internal notes textarea |

### Follow-up Tab

- Follow-up Date picker
- Follow-up Completed toggle
- Quote Approval Last Requested button (sends a "nudge" — logs activity + sets `quote_approval_last_requested_at`)
- Client Confirmed toggle (converting quote to confirmed/order state)

### Footer Actions

**Create mode:**
| Action | Notes |
|--------|-------|
| **Save Draft** | `POST /api/tickets` with `ticket_status = 'draft'` |
| **Save & Send** | `POST /api/tickets` with `ticket_status = 'sent'` + logs `quote_sent` activity |
| **Cancel** | Dismiss |

**View/Edit mode:**
| Action | Notes |
|--------|-------|
| **Edit** | Enables editing |
| **Save Changes** | `PATCH /api/tickets/[id]` |
| **Print PDF** | Download order PDF |
| **Mark Won** | `ticket_status = 'approved'`, `client_confirmed = true` |
| **Cancel Ticket** | `ticket_status = 'cancelled'` |
| **Close** | Dismiss |

---

## PDF Export (`lib/utils/order-ticket-pdf.ts`)

Generates a one-page PDF for an order ticket using `jspdf`.

**PDF includes:**
- Company header: BAZAARPRINTING
- Order # and date
- Contact name, company, email, phone
- Line items table (description, qty, size, material, finish, unit price, line total)
- Pricing summary (subtotal, discount, total, payment type, prepay)
- Rush flag (if applicable)
- Notes

**Trigger:** "Print PDF" button in Orders tab or Order Drawer footer. Generates client-side, opens in new tab / triggers download.

---

## Period Filter (Shared with Statistics)

A global period selector component (`components/period-filter.tsx`) persists its state in a React context (`PeriodFilterContext`). Both the Tickets page and the Statistics page subscribe to this context so the date range stays in sync.

Periods: Today | This Week | This Month | This Quarter | All Time | Custom Range
