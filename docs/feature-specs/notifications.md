# Feature Spec — Notifications

Component: `NotificationBell` in sidebar | Backend: `notifications` table + Supabase Realtime

---

## Overview

In-app notifications alert users to important events: a lead routed to them, a follow-up due, a quote approval requested. Notifications appear in a bell icon in the sidebar with an unread count badge. Clicking the bell opens a dropdown feed.

---

## Notification Bell (Sidebar)

- Position: Bottom cluster of sidebar, above Settings and Sign Out
- **Unread badge:** Red pill with count (capped at "99+")
- **Click:** Opens popover/dropdown anchored to the bell icon
- **Realtime:** The unread count updates live via a Supabase Realtime subscription to `notifications` filtered by `user_id = current_user` — no polling needed

---

## Notification Feed (Popover)

### Header

"Notifications" title + **Mark all read** button (visible only if unread notifications exist)

### Notification Row

Each row shows:
- **Icon** — based on `notification.type`
- **Title** — `notification.title`
- **Body** — `notification.body` (truncated at 2 lines)
- **Time** — relative (e.g. "5 minutes ago")
- **Unread indicator** — subtle colored left border on unread rows

### Interaction

- Clicking a notification row:
  1. Marks it as read (`PATCH /api/notifications/[id]/read`)
  2. Navigates to the relevant page/entity (using `notification.payload.href` if present)
- **Mark all read** → `POST /api/notifications/read-all`
- Notifications are never deleted from the feed — just marked read

### Load More

Initial load: 20 most recent. A "Load more" button fetches the next 20 (offset pagination).

---

## Notification Types

### `lead_routed`

**Trigger:** `POST /api/leads/verify` when `status = 'Routed to Sales'`
**Recipients:** All users with `role = 'sales'` who are `is_active = true`
**Title:** "New lead routed to Sales"
**Body:** "[First Last] from [Company] — [Quote Channel], $[quote_total]"
**Payload:** `{ leadId, contactId, href: '/sales' }`

---

### `follow_up_due`

**Trigger:** A scheduled job checks `job_tickets.follow_up_at <= now()` for tickets where `follow_up_completed = false`
**Recipients:** `job_tickets.created_by_id`
**Title:** "Follow-up due"
**Body:** "[Contact name] — Quote #[id]"
**Payload:** `{ ticketId, contactId, href: '/tickets' }`

**Note:** This requires a cron job or Supabase scheduled function. In v1, implement as a simple check: when any user loads the page, the backend checks for overdue follow-ups and creates notifications lazily. Proper scheduled job is a v2 concern.

---

### `quote_approval_requested`

**Trigger:** `PATCH /api/tickets/[id]` when `quote_approval_last_requested_at` is set
**Recipients:** `job_tickets.created_by_id` (remind the creator to follow up)
**Title:** "Quote approval follow-up sent"
**Body:** "[Contact name] has been sent an approval request"
**Payload:** `{ ticketId, href: '/tickets' }`

---

### `lead_assigned` (Future — v2)

**Trigger:** Admin assigns a lead to an SDR
**Recipients:** The assigned SDR
**Title:** "Lead assigned to you"
**Body:** "[First Last] from [Company]"
**Payload:** `{ leadId, href: '/leads' }`

---

### `lead_held_reminder`

**Trigger:** `leads.hold_until <= now()` and lead is still `status = 'On Hold'`
**Recipients:** `leads.sdr_id` or `leads.sales_owner_id`
**Title:** "Hold period ended"
**Body:** "[Contact name] — hold has expired"
**Payload:** `{ leadId, href: '/leads' }` or `/sales`

**Note:** Same lazy-check pattern as `follow_up_due` in v1.

---

### `system`

**Trigger:** Admin broadcasts a message via `/admin/settings`
**Recipients:** All active users or targeted role
**Title:** Admin-defined
**Body:** Admin-defined
**Payload:** Optional `href`

---

## Server-side Creation

Notifications are inserted via the **admin Supabase client** (service role) from Route Handlers. Never inserted from client components.

```typescript
// lib/services/notifications.ts
export async function createNotification(params: {
  user_id: string
  type: NotificationType
  title: string
  body?: string
  payload?: Record<string, unknown>
}): Promise<void>
```

---

## Supabase Realtime Setup

In `app/(app)/layout.tsx` (or a dedicated client component), subscribe to the `notifications` table filtered to the current user:

```typescript
supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
  }, (payload) => {
    // Increment unread count in local state
    incrementUnreadCount()
  })
  .subscribe()
```

This requires Supabase Realtime to be enabled on the `notifications` table in the Supabase dashboard.
