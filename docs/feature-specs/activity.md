# Feature Spec — Activity Timeline

Used inside: Verify Drawer, Sales Drawer, CRM expanded row, Order Drawer

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

### Contact-scoped (planned)
**`GET /api/activity`** with query params:
- `contact_id` — all activities across every lead for a customer
- `ticket_id` — activities for a specific job ticket
- `phone` / `email` — resolves customer by phone/email, returns all their lead activities

Used by (planned):
- CRM expanded row History tab: queries by `contact_id` (shows everything across all leads)
- Order Drawer History tab: queries by `ticket_id`

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
| `order_ticket_created` | `ShoppingCart` | Order Created |
| `order_ticket_updated` | `Edit3` | Order Updated |
| `ticket_client_confirmed` | `ThumbsUp` | Client Confirmed |

### Payload Details (collapsible)

| Type | Payload shown |
|------|--------------|
| `lead_status_changed` | "From [prev] → [new]" (`payload.from`, `payload.to`) |
| `lead_rejected` | `payload.from` (previous status — `"Routed to Sales"` for sales-pipeline rejections, other values for SDR rejections) + rejection reason + notes |
| `lead_held` | Hold reason + "Until: [date]" |
| `lead_edited` | List of changed field names (`payload.fields`) |
| `lead_reassigned` | "From [name] → [name]" or "Unassigned from [name]" |
| `contact_edited` | List of changed fields |
| `order_ticket_updated` | List of changed field names (`payload.fields`) |
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
| `PATCH /api/tickets/[id]` | `quote_approval_requested` / `quote_follow_up_completed` / `quote_follow_up_reset` / `ticket_client_confirmed` / `order_ticket_updated` |
| `POST /api/outreach/send` | `outreach_sent` |
