# Feature Spec — Notifications (V1)

Component: Sidebar badge counts | Backend: Supabase Realtime on `leads` table + `activities` table

---

## Overview

BazaarPrinting CRM V1 uses sidebar nav badge counts as the notification system. When any lead changes, the badge next to "Leads" or "Sales Pipeline" updates instantly — no manual refresh needed. Admins have a dedicated Activity Log showing all system events.

---

## Sidebar Badges

- **Leads badge** (SDR + Admin): count of leads with `status IN ('Pending', 'Validated')` waiting to be worked
- **Sales badge** (Sales + Admin): unclaimed routed leads + active in-progress deals
- Updates in real-time via Supabase Realtime — no polling, no 60-second delays
- Single Supabase channel in `sidebar.tsx` serves all badge + page refresh needs

---

## Live Table Refresh

When a lead changes, all pages auto-update silently:

- **Sales Pipeline** — table re-fetches in background; if a drawer is open, refresh defers until drawer closes
- **Leads Workspace** — table re-fetches silently; skipped if drawer is open

No loading skeleton appears during Realtime-triggered refreshes — data swaps in place.

---

## Admin Activity Log

Location: `/admin/settings/notifications` (accessible to Admin role only)

Shows all system activity from the existing `activities` table:

| Column | What it shows |
|--------|---------------|
| Who | User name + role badge |
| Action | Human-readable label (e.g. "Routed lead to Sales") |
| Lead / Customer | Contact name if present |
| When | Relative time (hover for absolute) |

Paginated, 50 events per page. No delete — read-only history.

**API:** `GET /api/admin/activity-log?limit=50&offset=0`

---

## Notification Types (Activity Log Labels)

| `activities.type` | Displayed as |
|---|---|
| `lead_routed_to_sales` | Routed lead to Sales |
| `lead_sales_claimed` | Claimed lead |
| `lead_rejected` | Rejected lead |
| `lead_held` | Put lead on hold |
| `lead_resumed` | Resumed lead |
| `lead_reassigned` | Reassigned lead |
| `lead_edited` | Edited lead |
| `lead_manual_created` | Created lead manually |
| `lead_status_changed` | Changed lead status |
| `customer_merged` | Merged customer records |

---

## What is V2 / Future

- Bell icon in sidebar with unread count badge
- Per-user notification feed (popover + `/notifications` history page)
- Admin broadcast notifications
- `lead_assigned` type (Admin assigns inbox lead directly to SDR)
- `follow_up_due` lazy check
- `lead_held_reminder` lazy check

The `notifications` table already exists in the DB — fully ready for V2 without any schema changes.

---

## Technical notes

- Realtime requires the `leads` table to have `REPLICA IDENTITY FULL` and be added to the `supabase_realtime` publication — handled by migration `035_enable_leads_realtime.sql`
- Also enable Realtime toggle in Supabase dashboard for the `leads` table
- All activity is inserted via the admin Supabase client from Route Handlers — never from client components
- See `docs/realtime-live-updates.md` for the full pattern guide and checklist for adding Realtime to future entities
