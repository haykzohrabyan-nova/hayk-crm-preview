# BazarCRM — Component Architecture

How pages, components, and data fetching are structured.

---

## Page vs Component vs Server vs Client

Next.js App Router distinguishes between **Server Components** (run on server, no hooks) and **Client Components** (run in browser, `"use client"`, can use hooks and state).

**Rule:** Default to Server Components. Add `"use client"` only when you need:
- React hooks (`useState`, `useEffect`, etc.)
- Browser APIs (`window`, `localStorage`, etc.)
- Event handlers

### Pattern for feature pages

```
app/(app)/leads/page.tsx          ← Server Component (thin — just exports the client page)
  └── components/leads-page.tsx   ← Client Component ("use client" — tabs, search, state)
        └── VerifyDrawer           ← Client Component (form state, locking)
```

All data fetching happens client-side via `fetch('/api/...')` after the page mounts. There is no server-side initial data pass on these pages.

---

## Dashboard Architecture

Three completely separate dashboard components — no role conditionals inside them:

```
components/dashboard-page.tsx    ← role router (thin — detects role, renders correct dashboard)
  components/sdr-dashboard.tsx   ← SDR: personal KPIs + quick actions
  components/sales-dashboard.tsx ← Sales: personal KPIs + quick actions
  components/admin-dashboard.tsx ← Admin: global KPIs + team grid + quick actions
```

Each dashboard is self-contained (its own KPI card components, period selector, helpers) and can be redesigned without touching the others.

---

## SDR vs Sales — Side-by-Side Architecture

```
/leads (SDR + Admin)                        /sales (Sales + Admin)
──────────────────────────────────────      ──────────────────────────────────────
app/(app)/leads/page.tsx                    app/(app)/sales/page.tsx
  └── components/leads-page.tsx               └── components/sales-page.tsx
        │                                            │
        ├── Tabs: All Leads | On Hold |              ├── Tabs: Pipeline | On Hold |
        │         Directed to Sales | Rejected       │         Rejected
        │                                            │
        ├── Inline table (per tab)                   ├── Inline table (per tab)
        │     Columns vary per tab                   │     Columns vary per tab
        │                                            │
        └── VerifyDrawer (SDR / Admin)               └── SalesDrawer (Sales / Admin)
```

---

## Role-Specific Components

| Component | File | Role |
|-----------|------|------|
| `VerifyDrawer` | `components/verify-drawer.tsx` | SDR (edit), Admin (read-only view) |
| `SalesDrawer` | `components/sales-drawer.tsx` | Sales (edit), Admin (read-only view) |
| `SdrDashboard` | `components/sdr-dashboard.tsx` | SDR only |
| `SalesDashboard` | `components/sales-dashboard.tsx` | Sales only |
| `AdminDashboard` | `components/admin-dashboard.tsx` | Admin only |

---

## Shared UI Components

| Component | File | Used in |
|-----------|------|---------|
| `StatusPill` | `components/ui/status-pill.tsx` | Tables, drawers |
| `UrgencyPill` | `components/ui/urgency-pill.tsx` | Tables, drawers |
| `PhoneInput` | `components/ui/phone-input.tsx` | Add Lead modal, verify drawer |
| `EmailInput` | `components/ui/email-input.tsx` | Add Lead modal, verify drawer |

---

## Page-by-Page Breakdown

### `/dashboard` — Role-scoped Dashboard

```
app/(app)/dashboard/page.tsx  [Server Component — thin wrapper]
  └── components/dashboard-page.tsx  [Client Component]
        ├── Detects role via Supabase (createBrowserClient)
        ├── Shows skeleton while role loads
        └── Renders one of:
              sdr-dashboard.tsx    (role === "sdr")
              sales-dashboard.tsx  (role === "sales")
              admin-dashboard.tsx  (role === "admin")
```

---

### `/leads` — SDR Lead Pipeline

```
app/(app)/leads/page.tsx  [Server Component — thin wrapper]
  └── components/leads-page.tsx  [Client Component "use client"]
        ├── Tabs: All Leads | On Hold | Directed to Sales | Rejected
        ├── Tab state: local useState (not synced to URL)
        ├── Per-tab API: GET /api/leads/workspace?status=...&scope=...
        ├── Search: client-side filter on fetched data
        ├── Sort: client-side sort by Created or Urgency (column headers on desktop,
        │         cycling pill button on mobile)
        ├── Owner filter (SDR only): All Leads / My Leads toggle
        └── VerifyDrawer (opens on Claim / View click)
```

**Tab → API mapping:**

| Tab | API params | Notes |
|-----|------------|-------|
| All Leads | no `status`, no `scope` | SDR sees unlocked + own; Admin sees all |
| On Hold | `status=On Hold&scope=mine` | SDR sees own; Admin sees all |
| Directed to Sales | `status=Routed to Sales&scope=mine` | SDR sees own; Admin sees all |
| Rejected | `status=Rejected&scope=mine` | SDR sees own (leads they rejected); Admin sees all SDR-rejected leads |

**All Leads table columns:** Name, Company, Source, Phone, Urgency, Status, **Owner**, Created, Action

**Owner column:** shows SDR name / "You" for owned leads, "Unclaimed" badge for unowned — visible to all roles.

**Action button (SDR):**
- `locked_by_id === null` → **Claim** button (navy fill) — acquires lock + permanent ownership
- `locked_by_id === userId` → **View** button (outlined) — re-opens owned lead
- Admin → **View** button (no lock acquired) + optional **Reassign** button

---

### `/sales` — Sales Pipeline

```
app/(app)/sales/page.tsx  [Server Component — thin wrapper]
  └── components/sales-page.tsx  [Client Component "use client"]
        ├── Tabs: Pipeline | On Hold | Rejected
        ├── Tab state: local useState
        ├── Per-tab API: GET /api/leads/workspace?status=...
        └── SalesDrawer (opens on Claim / Open / View click)
```

**Tab → API mapping:**

| Tab | API params | Notes |
|-----|------------|-------|
| Pipeline | `status=Routed to Sales` | Sales sees unclaimed + own; Admin sees all; client-filtered by `sales_status` |
| On Hold | `status=Routed to Sales` | Client-filtered by `sales_status = On Hold` |
| Rejected | `status=Rejected&prev_status=Routed+to+Sales` | Only leads rejected *from* the sales pipeline; lazy-fetched on first tab open |

**Count badge:** `GET /api/leads/sales-counts` — `rejected` count uses same `prev_status = 'Routed to Sales'` filter so badge matches list.

**Sales Drawer tabs:** Lead Info | Order / Quote | **History** (fetches `GET /api/leads/[id]/activities` lazily on first open — vertical timeline of all events)

**Sales Drawer — Lead Info tab — Sales Fields section:** includes a `sales_notes` textarea (saved via `PATCH /api/leads/[id]`, logged as `lead_edited` activity). Notes are internal — visible to Sales and Admin only.

**Verify Drawer tabs:** Lead Info | Quote | **History** (same lazy-fetch pattern as Sales Drawer — fetches `GET /api/leads/[id]/activities` on first open, renders vertical timeline with colored dots, actor name, relative timestamps)

---

### `/crm` — Customer Registry

```
app/(app)/crm/page.tsx  [Server Component — thin wrapper]
  └── components/crm-page.tsx  [Client Component]
        ├── Search, sort, filter
        └── Customer profile expand → CustomerProfile component
```

---

## Lead Ownership & Drawer Model

### Permanent Ownership (Soft Lock)

When an SDR clicks **Claim**, `POST /api/leads/[id]/lock` is called:
- Sets `locked_by_id = userId` and `sdr_id = userId` on the lead
- Lead disappears from other SDRs' All Leads queue (filtered by API)
- Ownership persists beyond drawer close — it is **not** released when SDR closes the drawer or saves

### Drawer open — edit vs read-only

| Scenario | Drawer mode |
|----------|-------------|
| SDR opens their own lead | Edit mode |
| SDR opens lead locked by someone else (race condition on stale page) | Read-only + "currently working" banner |
| Admin opens any lead via View | Read-only (no lock acquired) |

### Releasing ownership

Ownership is only released by a terminal action:
- SDR routes lead to Sales → `POST /api/leads/[id]/unlock` called after route
- SDR rejects lead → `POST /api/leads/[id]/unlock` called after reject
- Admin reassigns → `POST /api/leads/[id]/reassign` sets `locked_by_id` + `sdr_id` to new user
- Admin unassigns → same endpoint with `user_id: null`

**Ownership does NOT release** on: drawer close, Save, Validate, Hold, Resume.

---

## Data Fetching Strategy

| Layer | Where | How |
|-------|-------|-----|
| Page load | Client Component (useEffect) | `fetch('/api/...')` Route Handler |
| Tab switch | Client Component | `fetch('/api/...')` Route Handler |
| Drawer open | Client Component | `fetch('/api/...')` Route Handler |
| After mutation | Client Component | Optimistic update or re-fetch |
| Count refresh | Client Component | `window.dispatchEvent(new Event("bazaar:refresh-counts"))` |

**No global state library.** Data lives in local `useState` / `useReducer` in Client Components.

---

## Count Refresh Event

Any action that changes lead counts (claim, hold, resume, route, reject, reassign) dispatches:

```typescript
window.dispatchEvent(new Event("bazaar:refresh-counts"));
```

Tab badges, sidebar counts, and any component listening to this event refresh automatically.

---

## Admin Differences

Admin accessing `/leads` or `/sales` sees the same pages but:
- Action button is **View** (read-only, no lock acquired) instead of Claim/Verify
- On `/leads` All Leads: **Reassign** button appears next to View for owned leads
- On `/leads` All Leads: **Owner** column shows which SDR owns each lead
- Scoped tabs (On Hold, Directed to Sales, Rejected) show **all** leads, not just admin's own
- Tab counts also reflect all leads for admin
