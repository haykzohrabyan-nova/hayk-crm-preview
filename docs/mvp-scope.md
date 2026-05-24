# BazarCRM — MVP Scope

**Status: MVP COMPLETE ✓ — In testing as of 2026-05-07**

This file defines the boundary of the first production build.

---

## In Scope (Build Now)

| # | What | Notes |
|---|------|-------|
| 1 | **DB Foundation** | `roles`, `pages`, `role_permissions`, `user_profiles`, `customers`, `leads`, `activities` tables. RLS, indexes, triggers, seed data. |
| 2 | **Auth additions** | `/change-password` page for first-login temp password flow. `proxy.ts` extended: `is_active` check, `must_change_password` check, DB-driven route permission check. |
| 3 | **Minimal user management** | `/admin/users` — Admin creates SDR/Sales users with temp password. No full admin panel. No roles editor yet. |
| 4 | **SDR Leads page** | `/leads` — All Leads, On Hold, Directed to Sales, Rejected tabs. Manual Add Lead with **customer deduplication lookup**. Verify Drawer with lock + Hold / Reject / Route to Sales + "Update customer?" prompt. |
| 5 | **Sales Leads page** | `/sales` — Pipeline, On Hold, Rejected tabs. Sales Drawer with lock + Hold / Reject. "Create Quote / Order" navigates to `/quotes/new`. |
| 6 | **Dashboard (basic)** | KPI cards showing lead counts per status. No charts. Replaces current stub. |

---

## Lead Flow (MVP)

```
SDR adds lead manually
       │
       ▼
All Leads tab (status: Pending)
       │
       SDR clicks "Work" → drawer opens → lead locked
       │
       ├── Route to Sales → lead moves to "Directed to Sales" tab
       │                    Sales can now see it in their Pipeline
       │
       ├── Hold → lead moves to "On Hold" tab (SDR)
       │          Can be resumed, rejected, or routed from hold
       │
       └── Reject → TERMINAL (only Admin can undo)

                    ▼ (if Routed to Sales)

Sales sees lead in Pipeline tab
       │
       Sales clicks "Work" → drawer opens → lead locked
       │
       ├── Hold → lead moves to "On Hold" tab (Sales)
       │          Can only resume back to Ongoing
       │
       ├── Reject → TERMINAL (only Admin can undo)
       │
       └── Create Quote / Order → saves lead silently → navigates to /quotes/new?lead_id=...
```

---

## Post-MVP — Build Queue

| Feature | Status |
|---------|--------|
| Full Admin panel (Roles editor, Settings, Audit log) | ✅ Built |
| CRM contact registry + customer profiles | ✅ Built (`/crm`) |
| Contact dedup / merge | ✅ Built |
| Tickets / Quote builder / Orders | ✅ Built (Phases 4–7, 2026-05-12) |
| Statistics / Charts | Next |
| Notifications (Realtime bell) | Next |
| Email / SMS outreach | Future |
| AI/webhook lead ingestion | Future |
| PDF export | After Tickets phase |

---

## First Admin Setup (One-time)

1. Supabase Dashboard → Authentication → Users → **Add user**
2. Enter Admin's email + password
3. Copy the UUID
4. Run in Supabase SQL Editor:
```sql
insert into public.user_profiles (id, role_id, full_name, is_active, must_change_password)
select '[UUID]', r.id, 'Admin', true, false
from public.roles r where r.name = 'admin';
```
5. Admin logs in → 2FA setup → dashboard → creates SDR/Sales users from `/admin/users`

---

## Lead Form Fields (Manual Add + Verify Drawer)

### Contact Information
| Field | Required | Notes |
|-------|----------|-------|
| Phone Number | Yes | Digits-only stored |
| Email Address | No | |
| First Name | Yes | |
| Last Name | No | |
| Source | Yes | Manual, Website, Google, Walk-in, Referral, etc. |
| Authority | No | Decision Maker? Yes / No — stored on **customer** (`customers.authority`) |
| Company Name | No | |
| Industry | Yes | |
| Website / Social | No | |
| **Urgency** | No | Not Defined (stored as null) / High / Medium / Low |
| Returning Customer | No | Checkbox — flags existing client |
| Verify Lead Comment | No | SDR internal notes |
| Brand | No | (in drawer, not add modal) |
| Product Interests | No | (in drawer only, not add modal) |
| Quantities | No | (in drawer only, per checked interest) |

### SDR Workflow Fields (DB only, set by actions)
- `status` — set by SDR actions (Pending → Validated → Routed/Hold/Rejected)
- `sdr_id` — set to current user on create/verify
- `is_returning_customer` — from checkbox

### Sales Workflow Fields (DB ready, Sales drawer)
- `sales_status` — set by Sales actions
- `sales_owner_id` — set when Sales claims

### Hold Fields
- `hold_reason`, `hold_notes`, `hold_until`, `held_at`, `held_by_id`, `prev_status`, `prev_sales_status`

### Rejection Fields
- `rejection_reason`, `rejection_notes`

### Lock Fields
- `locked_by_id`, `locked_at`

### Built in Post-MVP Tickets Phase
- `quote_total`, `quote_channel`, `quote_destination` — ✅ live (new-quote-form + quote-detail)

### Future Fields (schema ready, UI not yet built)
- `assigned_sdr_id` (Admin phase)
