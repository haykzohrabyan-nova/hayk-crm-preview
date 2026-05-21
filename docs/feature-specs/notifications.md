# Feature Spec — Notifications & Activity Log

Component: Activity Log page + Sidebar badge counts | Backend: Supabase Realtime on `leads` + `activities` tables

---

## Build Status

| Feature | Status |
|---------|--------|
| Sidebar lead/sales badge counts | ✅ Built |
| Supabase Realtime live table refresh | ✅ Built |
| `/notifications` — Activity Log page | ✅ Built |
| `GET /api/admin/activity-log` | ✅ Built |
| Admin: Broadcast Notifications | ❌ Removed from scope — not needed |
| Per-user notification bell (V2) | ⏳ Not built — future |

---

## Sidebar Badges ✅ Built

- **Leads badge** (SDR + Admin): count of leads with `status IN ('Pending', 'Validated')` waiting to be worked
- **Sales badge** (Sales + Admin): unclaimed routed leads + active in-progress deals
- Updates in real-time via Supabase Realtime — no polling, no 60-second delays
- Single Supabase channel in `sidebar.tsx` serves all badge + page refresh needs

---

## Live Table Refresh ✅ Built

When a lead changes, all pages auto-update silently:

- **Sales Pipeline** — table re-fetches in background; if a drawer is open, refresh defers until drawer closes
- **Leads Workspace** — table re-fetches silently; skipped if drawer is open
- **Quotes page** — Supabase Realtime channel (independent of sidebar) handles cross-session updates (SDR routes → Sales sees it instantly; Sales claims → others see it disappear)

No loading skeleton appears during Realtime-triggered refreshes — data swaps in place.

---

## Activity Log — `/notifications` ✅ Built

**Component:** `components/admin/activity-log-section.tsx`
**Page:** `app/(app)/notifications/page.tsx`
**API:** `GET /api/admin/activity-log?limit=50&offset=0`

Shows all system activity from the `activities` table, newest first.

### Columns

| Column | What it shows |
|--------|---------------|
| Who | User full name + role badge (SDR / Sales / Admin color-coded) |
| Action | Human-readable label (e.g. "Routed lead to Sales") |
| Lead / Customer | Contact name if present |
| When | Relative time (hover tooltip shows absolute datetime) |

### Features

- Paginated 50 events per page with "Load more" button
- Total event count shown in header badge
- Desktop: table layout. Mobile: card layout (`sm:hidden`)
- Skeleton loader on first load (8-row shimmer)
- Live-refreshes when `bazaar:activities-changed` custom event fires
- Empty state handled gracefully

### Activity Type Labels

| `activities.type` | Displayed as |
|---|---|
| `lead_routed_to_sales` | Routed lead to Sales |
| `lead_sales_claimed` | Claimed lead |
| `lead_claimed` | Claimed lead |
| `lead_rejected` | Rejected lead |
| `lead_held` | Put lead on hold |
| `lead_resumed` | Resumed lead |
| `lead_reassigned` | Reassigned lead |
| `lead_edited` | Edited lead |
| `lead_manual_created` | Created lead manually |
| `lead_status_changed` | Changed lead status |
| `customer_merged` | Merged customer records |
| `order_ticket_created` | Created quote/order |
| `order_ticket_updated` | Updated ticket |
| `order_ticket_status_changed` | Status changed (routed, claimed, etc.) |
| `ticket_sent` | Sent quote to customer. Payload: `{ channel, destination, resend?: true }` |
| `ticket_client_confirmed` | Customer confirmed quote via public page |
| `ticket_converted` | Rep converted quote to order. Payload: `{ from, to: 'order', reference_code }` |
| `ticket_payment_reminder_sent` | Payment reminder sent. Payload: `{ channel, destination }` |
| `ticket_payment_evidence_submitted` | Customer submitted payment proof. Payload: `{ method, amount, … }` |
| `ticket_payment_recorded` | Staff/accountant recorded payment. Payload: `{ payment_mode, payment_method, payment_amount }` |
| `ticket_payment_confirmed_sent` | Payment confirmation email/SMS sent after accountant confirm |
| `ticket_invoice_resent` | Customer portal link resent. Payload: `{ channel, destination }` |
| `ticket_order_ready_sent` | Pickup-ready notification sent when order marked completed |
| `ticket_order_ready_failed` | Pickup notification send failed |

---

## Per-User Notification Bell — V2 (Not Built)

- Bell icon in sidebar with unread count badge (red pill, max `99+`)
- Click → popover with notification feed (last 20, paginated)
- Full history at `/notifications` (already built, currently shows admin activity log)
- Supabase Realtime subscription keeps count live without polling
- `lead_assigned` type (Admin assigns inbox lead directly to SDR)
- `follow_up_due` lazy check
- `lead_held_reminder` lazy check

The `notifications` table already exists in the DB — fully ready for V2 without any schema changes.

---

## Technical Notes

- Realtime requires `leads` table to have `REPLICA IDENTITY FULL` and be in the `supabase_realtime` publication — handled by migration `035_enable_leads_realtime.sql`
- All activity is inserted via the admin Supabase client from Route Handlers — never from client components
- See `docs/realtime-live-updates.md` for the full Realtime pattern guide and debugging checklist
