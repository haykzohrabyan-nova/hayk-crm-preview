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
| `QuotesPage` | `components/quotes-page.tsx` | All roles |
| `OrdersPage` | `components/orders-page.tsx` | All roles |
| `NewQuoteForm` | `components/new-quote-form.tsx` | Sales + SDR (create), Admin |
| `QuoteDetail` | `components/quote-detail.tsx` | All roles (reps locked from editing orders) |

---

## Shared UI Components

| Component | File | Used in |
|-----------|------|---------|
| `StatusPill` | `components/ui/status-pill.tsx` | Tables, drawers |
| `UrgencyPill` | `components/ui/urgency-pill.tsx` | Tables, drawers |
| `PhoneInput` | `components/ui/phone-input.tsx` | Add Lead modal, Verify Drawer, Customer Profile, Admin Company Info, New Quote / Quote Detail (SMS & WhatsApp destination) |
| `EmailInput` | `components/ui/email-input.tsx` | Add Lead modal, Verify Drawer, Customer Profile, Login page, Admin Invite User form, Admin Company Info, New Quote / Quote Detail (Email destination) |
| `LinkedLeadCard` | `components/ui/linked-lead-card.tsx` | New Quote form (left sidebar when `?lead_id` present), Quote Detail (left sidebar) |
| `DatePicker` | `components/ui/date-picker.tsx` | New Quote form (Due Date field), Quote Detail (Due Date edit), Quote tab (First Reminder date) |

> **Rule:** Every phone or email input in the app **must** use `PhoneInput` or `EmailInput`. Never add a raw `<input type="tel">` or `<input type="email">` in a component.

---

## PDF Generation

PDF rendering uses `@react-pdf/renderer` (server-side only — never imported in Client Components).

| File | Purpose |
|------|---------|
| `lib/pdf/invoice-pdf.tsx` | `InvoicePDF` React component — renders a `<Document>` + `<Page>` with all invoice sections. Accepts typed props (company, ticket, customer, skus, pricing). Used exclusively by the `/api/tickets/[id]/pdf` route handler. |

**How it works:**
1. `GET /api/tickets/[id]/pdf` fetches ticket + company_settings from Supabase (admin client).
2. `renderToBuffer(<InvoicePDF .../>)` produces a PDF binary server-side.
3. Response: `Content-Type: application/pdf` + `Content-Disposition: attachment`.
4. In `quote-detail.tsx`, the "Save PDF" button is `<a href="/api/tickets/[id]/pdf" download>` — one click downloads the file with no new tab.

**Pattern for adding new PDF types:**
- Create a new component in `lib/pdf/` (e.g. `lib/pdf/packing-slip.tsx`)
- Create a new route handler (e.g. `app/api/tickets/[id]/packing-slip/route.ts`)
- Add a download link pointing to the new route — no frontend state needed

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

### `/quotes` — Quoted Requests list

```
app/(app)/quotes/page.tsx  [Server Component — thin wrapper]
  └── components/quotes-page.tsx  [Client Component "use client"]
        ├── Tabs: All | Draft | Sent | Won | Routed to Sales* (count badge on all)
        │         * "Routed to Sales" only visible to Sales + Admin roles
        ├── Counts: GET /api/tickets/counts
        ├── Data: GET /api/tickets?kind=quote
        │         Routed tickets enriched with created_by_name
        ├── Supabase Realtime: direct postgres_changes channel "quotes-page-tickets"
        │         (independent of sidebar — cross-session updates work instantly)
        ├── Window events: bazaar:tickets-changed + bazaar:refresh-counts
        ├── Search: client-side filter
        ├── Claim action (Routed tab): PATCH /api/tickets/[id] { claim_ownership: true }
        └── Row click → /quotes/[id]
```

---

### `/orders` — Orders list

```
app/(app)/orders/page.tsx  [Server Component — thin wrapper]
  └── components/orders-page.tsx  [Client Component "use client"]
        ├── Tabs: All | Active | Cancelled (count badge on all)
        ├── Only shows ticket_status = 'order' tickets (draft/sent/approved/routed excluded)
        ├── Counts: GET /api/tickets/counts
        ├── Data: GET /api/tickets?kind=quote (filtered to 'order' status client-side)
        ├── No "New Order" button — orders created only through Quotes flow
        ├── Search: client-side filter
        └── Row click → /quotes/[id]  (same ticket record)
```

---

### `/quotes/new` — New Quote form

```
app/(app)/quotes/new/page.tsx  [Server Component — thin wrapper]
  └── components/new-quote-form.tsx  [Client Component "use client"]
        │
        ├── Entry modes (detected from URL params):
        │    ?lead_id=uuid     → LeadCard left sidebar, skip Customer tab, start on Info
        │    ?first_name=...   → CustomerInfoCard left sidebar, skip Customer tab, start on Info
        │    (none)            → No left sidebar, show Customer tab as step 1
        │
        ├── Tabs: [Customer] | Info | Line Items | Quote
        │         Customer tab hidden when lead_id or CRM params present
        │
        ├── Validation per tab before advancing:
        │    Customer: first_name required
        │    Info: title required
        │    Line Items: ≥1 fully-filled item
        │
        ├── High-Value Threshold modal (SDR only):
        │    Fires when advancing to Quote tab with total > HVT
        │    Non-dismissible, 30s countdown → saves as 'routed' → redirect to /quotes
        │
        ├── Data: GET /api/lookups, GET /api/lookups/products, GET /api/admin/company
        ├── Save Draft: POST /api/tickets { status: 'draft' } — available from Line Items onwards
        ├── Save & Send: POST /api/tickets { status: 'sent' } → redirect to /quotes
        └── Customer upsert: POST /api/customers on save if no customer_id yet
```

---

### `/quotes/[id]` — Quote / Order detail

```
app/(app)/quotes/[id]/page.tsx  [Server Component — thin wrapper]
  └── components/quote-detail.tsx  [Client Component "use client"]
        │
        ├── Left sidebar:
        │    LinkedLeadCard   — if ticket has linked_lead_id
        │    CustomerInfoCard — if ticket has customer but no lead
        │    (nothing)        — if neither
        │
        ├── 4-tab view: Info | Line Items | Quote | History
        ├── View mode default; Edit button toggles edit mode
        │
        ├── High-Value Threshold modal (SDR only):
        │    Fires when SDR saves a draft quote with total > HVT
        │    Non-dismissible, 30s countdown → PATCH { status: 'routed' } → redirect to /quotes
        │
        ├── Status actions (read-only mode): Send Quote / Mark Won / Cancel Ticket
        ├── History: GET /api/activities?ticket_id=xxx&include_linked_lead=true
        └── Realtime: direct Supabase channel + bazaar:tickets-changed + bazaar:leads-changed
```

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
| Realtime DB change | `sidebar.tsx` subscription | `window.dispatchEvent(new Event("bazaar:leads-changed"))` |

**No global state library.** Data lives in local `useState` / `useReducer` in Client Components.

---

## Realtime Listeners

Components that listen to `bazaar:leads-changed` (dispatched by `sidebar.tsx` on any leads table change):

| Component | Behavior |
|-----------|---------|
| `leads-page.tsx` | Silent re-fetch of current tab's leads; skips if drawer is open |
| `sales-page.tsx` | Silent re-fetch of routed leads + tab counts; defers if drawer is open |
| `admin-dashboard.tsx` | Silent re-fetch of all KPIs (no skeleton flash) |

See `docs/realtime-live-updates.md` for full architecture and implementation guide.

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
