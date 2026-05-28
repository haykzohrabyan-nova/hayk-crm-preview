# Feature Spec — Activity Timeline

Used inside: Verify Drawer, Sales Drawer, CRM expanded row, Quote/Order detail page (`quote-detail.tsx`)

---

## Overview

The `HistoryTimeline` component renders a chronological feed of all events related to a contact, lead, or ticket. It is always rendered inside a drawer or expanded row — never as a standalone page.

---

## Data Fetching

Two endpoints cover different scopes:

### Lead-scoped (built)
**`GET /api/leads/[id]/activities`** — all events for one lead, newest first. Joins `user_profiles` so `by_user.full_name` is always populated.

Used by:
- **Sales Drawer** History tab — fetched lazily on first open
- **Verify Drawer** History tab — fetched lazily on first open

### Ticket-scoped (built — 2026-05-12, updated 2026-05-23)
**`GET /api/activities?ticket_id=xxx`** — activities for a specific job ticket. **`ticket_id`** accepts UUID or reference code (`QUO-YYYY-NNN`, `ORD-YYYY-NNN`) via `resolveTicketId()`.

**`GET /api/activities?ticket_id=xxx&include_linked_lead=true`** — fetches both the ticket's activities AND its linked lead's activities, merges them chronologically (oldest first), and adds a `_source` field (`"lead"` or `"ticket"`) to each row.

Used by:
- **Quote/Order detail page** (`quote-detail.tsx`) History tab — full lifetime of the record across both lead and ticket phases. Order detail URLs like `/orders/[id]` where `id` is `ORD-2026-003` resolve correctly.

### Contact-scoped (planned)
**`GET /api/activities?contact_id=xxx`** — all activities across every lead for a customer.

Used by (planned):
- CRM expanded row History tab: queries by `contact_id` (shows everything across all leads)

---

## Event Rendering

Each activity entry is rendered as a timeline row with:
- **Icon** — based on `type` (see icon map below)
- **Title** — human-readable description of what happened
- **Actor** — user display name (from `by_user.full_name` or role label)
- **Timestamp** — relative time (e.g. "3 hours ago") with full datetime on hover
- **Payload detail** — collapsible extra info for some event types

### Icon Map

| Activity Type | Icon | Label |
|---------------|------|-------|
| `lead_verified` | `CheckCircle` | Lead Verified |
| `lead_manual_created` | `PlusCircle` | Lead Created |
| `lead_claimed` | `UserCheck` | Lead Claimed |
| `lead_edited` | `Edit2` | Lead Updated |
| `lead_status_changed` | `RefreshCw` | Status Changed |
| `lead_routed_to_sales` | `ArrowRight` | Routed to Sales |
| `lead_rejected` | `XCircle` | Rejected |
| `lead_held` | `Pause` | Put on Hold |
| `lead_resumed` | `Play` | Resumed |
| `lead_sales_claimed` | `UserPlus` | Claimed by Sales |
| `lead_reassigned` | `RefreshCw` | Lead Reassigned |
| `lead_merged` | `GitMerge` | Contacts Merged |
| `contact_edited` | `Edit2` | Contact Updated |
| `call_logged` | `Phone` | Call Logged |
| `email_opened` | `Mail` | Email Opened |
| `outreach_sent` | `Send` | Outreach Sent |
| `quote_sent` | `FileText` | Quote Sent |
| `quote_approval_requested` | `Bell` | Approval Requested |
| `quote_follow_up_completed` | `CheckSquare` | Follow-up Done |
| `quote_follow_up_reset` | `RotateCcw` | Follow-up Reset |
| `order_ticket_created` | `FileText` | **Quote created** or **Order created** (from payload `reference_code` / `ticket_kind`; activity `type` name is legacy) |
| `order_ticket_updated` | `Edit3` | Order Updated |
| `order_ticket_status_changed` | `ArrowRight` | Status Changed |
| `ticket_client_confirmed` | `ThumbsUp` | Client Confirmed |
| `ticket_sent` | `Send` | Quote Sent |
| `ticket_converted` | `ArrowRight` | Converted to Order |
| `ticket_payment_reminder_sent` | `Bell` | Payment Reminder Sent |
| `ticket_payment_evidence_submitted` | `CreditCard` | Customer Submitted Payment Proof |
| `ticket_payment_recorded` | `DollarSign` | Payment Recorded |
| `ticket_payment_confirmed_sent` | `Send` | Payment Confirmation Sent |
| `ticket_invoice_resent` | `Mail` | Invoice Link Resent |
| `ticket_order_ready_sent` | `Send` | Pickup Notification Sent |
| `ticket_order_ready_failed` | `AlertCircle` | Pickup Notification Failed |

### Payload Details (collapsible)

| Type | Payload shown |
|------|--------------|
| `lead_status_changed` | "From [prev] → [new]" (`payload.from`, `payload.to`) |
| `lead_rejected` | `payload.from` (previous status — `"Routed to Sales"` for sales-pipeline rejections, other values for SDR rejections) + rejection reason + notes |
| `lead_held` | Hold reason + "Until: [date]" |
| `lead_edited` | List of changed field names (`payload.fields`) |
| `lead_reassigned` | "From [name] → [name]" or "Unassigned from [name]" |
| `contact_edited` | List of changed fields |
| `order_ticket_created` | `reference_code` (`QUO-*` / `ORD-*`) and/or `title` |
| `order_ticket_updated` | List of changed field names (`payload.fields`) |
| `ticket_payment_evidence_submitted` | Method, amount claimed, channel (`payload.method`, `payload.amount`) — **does not** count in Reports/dashboard cash until accountant confirms |
| `ticket_payment_recorded` | Mode, method, amount (`payload.payment_mode`, `payload.payment_method`, `payload.payment_amount`) — **counts** in Reports/dashboard **Cash Collected** |
| `ticket_payment_confirmed_sent` | Channel + destination |
| `ticket_invoice_resent` | Channel + destination |
| `ticket_order_ready_sent` / `ticket_order_ready_failed` | Channel; failure includes error message |
| `outreach_sent` | Channel + recipient (masked phone/email) |

---

## Manual Logging (Client-side)

From within the Verify Drawer or Sales Drawer, the user can manually log an event:

- **Log Call** button → inline mini-form:
  - Channel: Call / SMS / WhatsApp / Email / In-person
  - Notes (optional)
  - Submit → `POST /api/activity` with `type: 'call_logged'`

---

## Empty State

When there are no activities: "No activity yet for this contact."

---

## Loading State

Skeleton timeline rows (3 placeholder rows with shimmer).

---

## Server-side Auto-logging

The following Route Handlers automatically insert activity rows when they run:

| Handler | Activities logged |
|---------|------------------|
| `POST /api/leads/manual` | `lead_manual_created` |
| `POST /api/leads/[id]/lock` | `lead_claimed` (only on new claim, not self-refresh) |
| `POST /api/leads/[id]/claim` | `lead_sales_claimed` |
| `POST /api/leads/[id]/reassign` | `lead_reassigned` |
| `POST /api/leads/[id]/hold` | `lead_held` |
| `POST /api/leads/[id]/resume` | `lead_resumed` |
| `PATCH /api/leads/[id]` | `lead_edited` (tracked field changes without status change) + `lead_status_changed` (if `status` or `sales_status` changes) + `lead_rejected` with `{ from, reason, notes }` when `status` → `Rejected` + `lead_routed_to_sales` when `status` → `Routed to Sales` |
| `GET /api/leads/[id]/activities` | Read-only — returns timeline; no writes |
| `PATCH /api/customers/[id]/merge` | `lead_merged` (on all affected leads) |
| `PATCH /api/customers/[id]` | `contact_edited` |
| `POST /api/tickets` | `order_ticket_created` |
| `PATCH /api/tickets/[id]` | `quote_approval_requested` / `quote_follow_up_completed` / `quote_follow_up_reset` / `ticket_client_confirmed` / `ticket_sent` / `ticket_converted` / `ticket_payment_reminder_sent` / `ticket_payment_recorded` / `ticket_payment_confirmed_sent` / `ticket_invoice_resent` / `ticket_order_ready_sent` / `ticket_order_ready_failed` / `order_ticket_updated` / `order_ticket_status_changed` (claim, production release, mark completed) |
| `POST /api/public/quotes/[token]/confirm` | `ticket_client_confirmed` only (customer, `by_user_id = null`); `ticket_converted` / production activities when gates pass on same request |
| `POST /api/public/quotes/[token]/submit-payment` | `ticket_payment_evidence_submitted` / status transitions / production release |
| `POST /api/outreach/send` | `outreach_sent` |

### Payment activity types (Reports cash)

| Type | When logged | Counts in cash collected? |
|------|-------------|---------------------------|
| `ticket_payment_recorded` | Accountant `record_payment`; staff cash auto-record (`maybe-auto-record-cash-payment.ts`); immediate public cash | **Yes** |
| `ticket_payment_evidence_submitted` | Customer uploaded proof (wire/ACH/Zelle/check/card) awaiting review | **No** — until confirm creates `ticket_payment_recorded` |

Shared helper for confirmed payments: `lib/utils/log-ticket-payment-recorded.ts`.
