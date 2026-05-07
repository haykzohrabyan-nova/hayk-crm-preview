# BazarCRM — Component Architecture

How pages, components, and data fetching are structured. Read this before building any feature page.

---

## Page vs Component vs Server vs Client

Next.js App Router distinguishes between **Server Components** (run on server, no hooks) and **Client Components** (run in browser, `"use client"`, can use hooks and state).

**Rule:** Default to Server Components. Add `"use client"` only when you need:
- React hooks (`useState`, `useEffect`, etc.)
- Browser APIs (`window`, `localStorage`, etc.)
- Event handlers

### Pattern for feature pages

```
app/(app)/leads/page.tsx          ← Server Component (fetches initial data)
  └── components/leads-page.tsx   ← Client Component ("use client" — handles tabs, search, state)
        ├── LeadTable              ← Client Component (row actions, optimistic updates)
        │     └── LeadRow          ← Client Component (per-row buttons)
        └── VerifyDrawer           ← Client Component (form state, locking)
              └── HistoryTimeline  ← Client Component (fetches on open)
```

The Server Component fetches the **initial** data (first tab's leads) and passes it down as props. Tab switching and subsequent data loads are client-side fetches.

---

## SDR vs Sales — Side-by-Side Architecture

```
/leads (SDR)                                /sales (Sales)
─────────────────────────────────────       ──────────────────────────────────
app/(app)/leads/page.tsx                    app/(app)/sales/page.tsx
  └── LeadsPage client component              └── SalesPage client component
        │                                           │
        ├── Tabs: inbox|on-hold|                   ├── Tabs: pipeline|on-hold|
        │         directed|rejected                │         rejected
        │                                           │
        ├── LeadTable (shared)                     ├── LeadTable (shared)
        │     props:                               │     props:
        │       columns={SDR_COLUMNS}              │       columns={SALES_COLUMNS}
        │       onRowAction={handleSDRAction}       │       onRowAction={handleSalesAction}
        │                                           │
        └── VerifyDrawer (SDR-specific)            └── SalesDrawer (Sales-specific)
```

`LeadTable` is a **shared, configurable component**. The columns shown and the per-row action button are passed as props — so SDR rows show a "Verify" button and Sales rows show a "Claim / Open" button.

---

## Shared Components

These are used by both SDR and Sales pages (and CRM):

| Component | File | Used in |
|-----------|------|---------|
| `LeadTable` | `components/lead-table.tsx` | `/leads`, `/sales`, `/admin` |
| `LeadRow` | internal to `LeadTable` | — |
| `StatusPill` | `components/ui/status-pill.tsx` | Tables, drawers |
| `HistoryTimeline` | `components/history-timeline.tsx` | Verify drawer, Sales drawer, CRM expand, Order drawer |
| `HoldSubForm` | `components/hold-sub-form.tsx` | Verify drawer, Sales drawer |
| `OrderDrawer` | `components/order-drawer.tsx` | Sales drawer, CRM, Tickets page |
| `PeriodFilter` | `components/period-filter.tsx` | Statistics, CRM, Tickets |
| `NotificationBell` | `components/notification-bell.tsx` | Sidebar |
| `SkeletonRow` | `components/ui/skeleton-row.tsx` | All tables |

---

## Role-Specific Components

| Component | File | Role |
|-----------|------|------|
| `VerifyDrawer` | `components/verify-drawer.tsx` | SDR only |
| `SalesDrawer` | `components/sales-drawer.tsx` | Sales only |
| `ContactCRM` | `components/contact-crm.tsx` | All roles (but toolbar changes) |

---

## Page-by-Page Breakdown

### `/leads` — SDR Lead Pipeline

```
app/(app)/leads/page.tsx  [Server Component]
  - reads searchParams.tab (default: 'inbox')
  - fetches initial leads for default tab via Supabase server client
  - passes initialLeads + initialTab to LeadsPage

components/leads-page.tsx  [Client Component "use client"]
  - manages active tab state (synced to URL ?tab=)
  - manages search, sort state
  - on tab change: fetches leads via /api/leads/inbox or /api/leads/workspace
  - renders LeadTable with correct props per tab
  - renders VerifyDrawer (conditional, when selectedLead is set)
```

**Tab → API mapping:**

| Tab (`?tab=`) | API call | Filter |
|---------------|----------|--------|
| `inbox` (default) | `GET /api/leads/inbox` | `is_inbox=true` |
| `on-hold` | `GET /api/leads/workspace` | `status=On Hold` |
| `directed` | `GET /api/leads/workspace` | `status=Routed to Sales` |
| `rejected` | `GET /api/leads/workspace` | `status=Rejected` |

---

### `/sales` — Sales Pipeline

```
app/(app)/sales/page.tsx  [Server Component]
  - reads searchParams.tab (default: 'pipeline')
  - fetches initial leads for default tab
  - passes to SalesPage

components/sales-page.tsx  [Client Component "use client"]
  - manages active tab state (synced to URL ?tab=)
  - renders LeadTable with SALES_COLUMNS
  - renders SalesDrawer when a lead is selected
```

**Tab → API mapping:**

| Tab (`?tab=`) | API call | Filter |
|---------------|----------|--------|
| `pipeline` (default) | `GET /api/leads/workspace` | `status=Routed to Sales`, `sales_status in (Ongoing, Quote Sent)` |
| `on-hold` | `GET /api/leads/workspace` | `sales_status=On Hold` |
| `rejected` | `GET /api/leads/workspace` | `status=Rejected` (SDR-rejected, visible to Sales) |

---

### `/crm` — Contact Registry

```
app/(app)/crm/page.tsx  [Server Component]
  - fetches first page of contacts
  - passes to CRMPage

components/crm-page.tsx  [Client Component]
  - manages search, sort, period filter, heat filter
  - expand row state
  - fetches tickets + activity for expanded contact
```

---

### `/tickets` — Quotes & Orders

```
app/(app)/tickets/page.tsx  [Server Component]
  - reads searchParams.tab (default: 'quoted')
  - fetches initial tickets for tab

components/tickets-page.tsx  [Client Component]
  - tab state (synced to URL ?tab=)
  - renders QuotedRequestsTab or OrdersTab
  - renders OrderDrawer when selected
```

**Tab → API mapping:**

| Tab | API call |
|-----|----------|
| `quoted` (default) | `GET /api/tickets?kind=quote` + quoted workspace leads |
| `orders` | `GET /api/tickets?kind=order` |

---

### `/statistics` — Analytics

```
app/(app)/statistics/page.tsx  [Server Component]
  - fetches initial KPI data for default period (month)

components/statistics-page.tsx  [Client Component]
  - period filter (synced to PeriodFilterContext)
  - re-fetches KPIs + chart data on period change
  - renders role-appropriate KPI cards and charts
```

---

### Drawers (Verify, Sales, Order)

All drawers are `"use client"` components. They:
1. Acquire a lock when mounted (`POST /api/leads/[id]/lock`)
2. Release the lock when unmounted (cleanup in `useEffect`)
3. Show the lead in edit mode or read-only mode based on lock result
4. Make API calls for form submissions
5. Trigger toast notifications on success/error

**Drawer anatomy:**

```
[DrawerOverlay] ← closes drawer on click outside
  [DrawerPanel]  ← slides in from right, max-width 520px
    [DrawerHeader]
      Title + Status pill + Close button
    [LockBanner]   ← only shown when locked by another user
    [DrawerTabs]   ← Lead Info | Quote | History
    [TabContent]
      [FormFields or ReadOnlyFields]
    [DrawerFooter]
      [ActionButtons]  ← hidden if locked by another user
```

---

## URL State Convention

All tab states use `?tab=` query param. Page components read `searchParams` (Server Components) or `useSearchParams()` (Client Components).

**Never use `router.push` for tab changes — use `router.replace`** to avoid polluting the browser history stack with tab switches.

```typescript
// Tab switch — replace not push
router.replace(`/leads?tab=${newTab}`, { scroll: false })
```

---

## Data Fetching Strategy

| Layer | Where | How |
|-------|-------|-----|
| Initial page load | Server Component | Supabase server client (with RLS) |
| Tab switch | Client Component | `fetch('/api/...')` Route Handler |
| Drawer open | Client Component | `fetch('/api/...')` Route Handler |
| After a mutation | Client Component | Re-fetch affected data or optimistic update |
| Notifications | Client Component | Supabase Realtime subscription |

**No global state library** (no Redux, no Zustand). Data lives in:
- Server props (passed down from Server Component)
- Local `useState` / `useReducer` in Client Components
- `PeriodFilterContext` for the shared period filter (the only global context)

---

## `LeadTable` Props Interface

The shared `LeadTable` component accepts:

```typescript
interface LeadTableProps {
  leads: Lead[]
  columns: ColumnDef[]       // which columns to show + order
  onRowAction: (lead: Lead, action: LeadAction) => void
  actionLabel: string        // e.g. "Verify" (SDR) or "Open" (Sales)
  isLoading: boolean
  emptyMessage?: string
}

type LeadAction = 'open' | 'verify' | 'claim' | 'resume' | 'view'
```

**SDR column config:** Name, Company, Source, Phone, Email, Interests, Created, [Verify button]
**Sales column config:** Name, Company, Quote Total, Sales Status, Owner, Routed At, [Claim/Open button]

---

## Admin Differences

Admin accessing `/leads` or `/sales` sees the same pages but:
- The `VerifyDrawer` and `SalesDrawer` show an **"Admin View"** badge in the header
- If a lead is rejected (terminal), Admin sees an **"Admin Override"** banner with status-change controls
- If a lead is locked by another user, Admin's lock call always succeeds
- Locked-by-admin banner is shown to the original holder on their next save attempt: "Lead was unlocked by Admin"
- Admin can see all users' leads (no `sdr_id` or `sales_owner_id` filter on the server queries)
