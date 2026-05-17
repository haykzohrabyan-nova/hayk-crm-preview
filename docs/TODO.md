# BazarCRM — Open TODO Items

Items that still need to be built. Each entry describes the problem, the intended fix, and which files to touch.

Payment-related work (Stripe card, Zelle matching) is tracked separately in `docs/feature-specs/invoice-payment.md`.

---

## [TODO-001] Admin Override for Terminal Leads

**Status:** Pending — ready to build (Tickets phase is complete, dependency cleared)
**Priority:** Medium
**Files to touch:** `components/sales-drawer.tsx`, `components/verify-drawer.tsx`

### The Problem

When a lead reaches a **terminal state**, the drawer becomes fully read-only for **everyone** — including admins. There is no role check in the UI. Terminal states are:

| State | Set by |
|-------|--------|
| `status = "Rejected"` | SDR or Sales |
| `sales_status = "Won"` | Auto-set when linked ticket becomes an order |
| `sales_status = "Dropped"` | Sales rep |

The `isReadOnly` flag disables all inputs and hides all action buttons. An SDR who accidentally rejected a lead cannot be helped without direct DB access.

### The Fix

The API already allows admin edits (`app/api/leads/[id]/route.ts` already has the `roleName !== "admin"` guard). Only the client UI needs updating.

**`sales-drawer.tsx` + `verify-drawer.tsx`:**
```typescript
// isAdmin comes from userRole prop (already available)
const isTerminal = lead.status === "Rejected" || lead.sales_status === "Won" || lead.sales_status === "Dropped";
const isReadOnly = readOnly || (isTerminal && !isAdmin);
```

**UI behaviour for admin on terminal leads:**

- **Rejected lead** — show amber "Admin Override" banner; re-enable all action buttons (Save, Route, Hold, etc.)
- **Won lead** — show amber banner with warning: "This lead has a linked order. Resetting Won status will NOT cancel the order — handle that manually in Tickets." Re-enable editing.
- **Dropped lead** — show amber banner; re-enable editing; clear `sales_drop_reason` on save.

For non-admins, keep the existing red read-only banner.

### Testing checklist
- [ ] Admin opens a Rejected lead in Sales Drawer — sees amber banner, action buttons visible
- [ ] Admin opens a Rejected lead in Verify Drawer — same
- [ ] Non-admin opens a Rejected lead — sees red terminal banner, no actions
- [ ] Admin saves changes on a Rejected lead — PATCH succeeds (API already allows it)
- [ ] Admin re-routes a Rejected lead → appears in Sales Pipeline
- [ ] Activity log shows `lead_status_changed` from Rejected → Routed to Sales
- [ ] Won lead shows amber warning about linked order; admin can edit but order is not auto-cancelled

---

## [TODO-004] Dashboard Revenue — Pull from Actual Orders, Not Lead Snapshots

**Status:** Pending — quick win
**Priority:** High
**Files to touch:** `app/api/dashboard/kpis/route.ts`

### The Problem

The Admin and Sales dashboards show "Won Value" / "Total Revenue" by summing `leads.quote_total`. This is a snapshot field set when a quote is first linked to a lead and is **never updated** when the rep edits the final price in the quote builder. Real totals live in `job_tickets.quote_final_total`.

As a result, dashboard revenue figures can be wrong — sometimes significantly — any time a quote was revised after creation.

### The Fix

Replace the `leads.quote_total` sum with a join/subquery against `job_tickets`:

```typescript
// Instead of:
.select("id, quote_total").eq("sales_status", "Won")

// Do:
.select("id, job_tickets(quote_final_total)")
.eq("sales_status", "Won")
// then sum job_tickets.quote_final_total, fallback to 0 if null
```

Or issue a separate query directly against `job_tickets`:
```typescript
const { data: wonOrders } = await admin
  .from("job_tickets")
  .select("quote_final_total, created_at")
  .in("ticket_status", ["order", "in_production", "completed"])
  .gte("created_at", periodStart);

const revenue = wonOrders?.reduce((s, t) => s + (t.quote_final_total ?? 0), 0) ?? 0;
```

Apply to all three dashboard variants (SDR quote value, Sales won value, Admin total revenue).

### What NOT to do
- Do not remove `leads.quote_total` — it is still used for HVT routing threshold comparisons.

---

## [TODO-005] Order Lifecycle — In Production & Completed Status Transitions

**Status:** Pending — no UI exists at all
**Priority:** Medium
**Files to touch:** `components/quote-detail.tsx`, `app/api/tickets/[id]/route.ts`

### The Problem

The DB and types define a full order lifecycle:

```
order → in_production → completed
```

But there are **no buttons, no UI, and no API calls** to advance an order past `order` status. Every order stays in `order` status forever, even after the job ships. This means:
- The orders list has no way to filter "in production" vs "done"
- Dashboard "completed" revenue will always be zero
- There is no way to close out a job in the CRM without direct DB access

### The Fix

Add two action buttons to the order detail page (`quote-detail.tsx`), visible to admins only (or based on a permission), inside the action bar in read-only mode:

| Current status | Button shown | Action |
|----------------|--------------|--------|
| `order` | **Mark In Production** | PATCH `ticket_status = 'in_production'`; log `ticket_status_changed` activity |
| `in_production` | **Mark Completed** | PATCH `ticket_status = 'completed'`; log `ticket_status_changed` activity |
| `completed` | _(no button — show "Completed" pill only)_ | — |

The API (`PATCH /api/tickets/[id]`) already accepts arbitrary `ticket_status` values from admin users — no API change needed, only the UI.

Also update the Orders page (`components/orders-page.tsx`) to surface an "In Production" count in the tab badges.

---

## [TODO-006] Follow-Up Reminders — Sending Logic Not Built

**Status:** Pending — data collected, no sending
**Priority:** Low (deferred)
**Files to touch:** New cron/scheduled route + `lib/integrations/send-quote.ts`

### The Problem

The quote form collects follow-up scheduling fields that are saved to `job_tickets`:

| Field | What it holds |
|-------|--------------|
| `follow_up_frequency` | e.g. `"3days"`, `"weekly"` |
| `follow_up_at` | date of first reminder |
| `follow_up_cycles` | how many times to repeat |
| `follow_up_completed` | boolean — stops the loop |

But there is **no background job** that reads these fields and sends the reminder. The data sits unused.

### The Fix

Options (pick one based on hosting):

1. **Vercel Cron** — add `vercel.json` with a cron schedule pointing to `GET /api/cron/follow-ups`. The route queries tickets where `follow_up_at <= today AND follow_up_completed = false`, sends the reminder via Instantly AI or Twilio, then advances `follow_up_at` by the `follow_up_frequency` interval and decrements `follow_up_cycles`. When cycles reach 0, set `follow_up_completed = true`.

2. **Supabase pg_cron** — a Postgres cron job calls a database function that marks tickets as needing a reminder; a webhook then triggers the Next.js send route.

**Suggested route:** `app/api/cron/follow-ups/route.ts`

This is low priority until the business is actively using follow-up reminders at scale.

---
