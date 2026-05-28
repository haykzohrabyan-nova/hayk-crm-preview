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
  └── components/leads/leads-page.tsx      ← Client Component ("use client" — tabs, search, state)
        └── components/leads/verify-drawer.tsx  ← Client Component (form state, locking)
              └── components/leads/hold-sub-form.tsx
```

All data fetching happens client-side via `fetch('/api/...')` after the page mounts. There is no server-side initial data pass on these pages.

---

## Dashboard Architecture

Three completely separate dashboard components plus an accountant variant — no role conditionals inside the role-specific dashboards:

```
components/admin/dashboard-page.tsx        ← role router (SDR / Sales / Admin / Accountant)
  components/sales/sdr-dashboard.tsx
  components/sales/sales-dashboard.tsx
  components/admin/admin-dashboard.tsx
  components/admin/accountant-dashboard.tsx
```

Each dashboard is self-contained (its own KPI card components, period selector, helpers) and can be redesigned without touching the others.

---

## Folder layout & DRY (canonical)

See `.cursor/rules/folder-structure.mdc` for the full rule. Summary:

| Layer | Location | Rule |
|-------|----------|------|
| Routes | `app/(app)/{feature}/` | Thin Server Components only; paired with `loading.tsx` for route-level skeletons |
| List pages | `components/{feature}/{feature}-page.tsx` | One client page per route |
| Ticket detail | `components/quotes/quote-detail.tsx` | Single component; `context` prop for quote/order/payment/production/completed |
| Detail sections | `components/quotes/quote-detail/*`, `components/orders/*-detail-overview.tsx` | Extract shared blocks here |
| Shared form blocks | `components/quotes/shared/` | Used by new-quote-form + quote-detail edit mode; includes `shipping-fulfillment-section.tsx`, `quote-form.tsx` |
| Pure helpers | `lib/utils/format.ts`, `ticket-math.ts`, etc. | **Never copy** `relativeTime` / date formatters into components |
| Layout shell | `components/layout/` | sidebar, mobile-nav, idle-timer, theme-provider, global-loading-provider, **error-boundary** |
| Public customer UI | `components/public/` | `/q/[token]` only |

**Anti-patterns to avoid:**
- ❌ New `components/foo-page.tsx` at repo root (use `components/foo/foo-page.tsx`)
- ❌ Separate detail page component per lifecycle stage (use `QuoteDetail` + `context`)
- ❌ Duplicating format/date helpers in list pages
- ❌ Business logic in client components that belongs in `lib/utils/` + Route Handlers
- ❌ Inline `TableSkeleton` / `DesktopTableSkeleton` functions in list pages — use `TableRowsSkeleton` or `TableDivSkeleton` from `components/ui/table-skeleton.tsx`
- ❌ Heavy modals/drawers imported statically — use `next/dynamic` with `{ ssr: false }` so their bundles are deferred

---

## SDR vs Sales — Side-by-Side Architecture

```
/leads (SDR + Admin)                        /sales (Sales + Admin)
──────────────────────────────────────      ──────────────────────────────────────
app/(app)/leads/page.tsx                         app/(app)/sales/page.tsx
  └── components/leads/leads-page.tsx               └── components/sales/sales-page.tsx
        │                                                  │
        ├── Tabs: All Leads | On Hold |                    ├── Tabs: Pipeline | On Hold |
        │         Directed to Sales | Rejected | Won       │         Rejected
        │                                                  │
        ├── Inline table (per tab)                         ├── Inline table (per tab)
        │     Columns vary per tab                         │     Columns vary per tab
        │                                                  │
        └── VerifyDrawer (next/dynamic — deferred)          └── SalesDrawer (next/dynamic — deferred)
              └── components/leads/hold-sub-form.tsx
```

---

## Role-Specific Components

| Component | File | Role |
|-----------|------|------|
| `VerifyDrawer` | `components/leads/verify-drawer.tsx` | SDR (edit), Admin (full edit with amber override banner on rejected leads) |
| `AddLeadModal` | `components/leads/add-lead-modal.tsx` | SDR + Admin — `/leads` header and CRM profile **Add Lead**; dedup lookup, field validation, scroll-to-error |
| `HoldSubForm` | `components/leads/hold-sub-form.tsx` | Used inside VerifyDrawer |
| `SalesDrawer` | `components/sales/sales-drawer.tsx` | Sales (edit), Admin (full edit with amber override banner on Won/Dropped/Rejected leads) |
| `SdrDashboard` | `components/sales/sdr-dashboard.tsx` | SDR only |
| `SalesDashboard` | `components/sales/sales-dashboard.tsx` | Sales only |
| `AdminDashboard` | `components/admin/admin-dashboard.tsx` | Admin only |
| `DashboardPage` | `components/admin/dashboard-page.tsx` | Role router — all roles |
| `QuotesPage` | `components/quotes/quotes-page.tsx` | All roles |
| `OrdersPage` | `components/orders/orders-page.tsx` | All roles |
| `PaymentsPage` | `components/orders/payments-page.tsx` | Accountant + Admin — Pending approval / Approved tabs |
| `SmsTemplatesSection` | `components/admin/sms-templates-section.tsx` | Admin — SMS/WhatsApp template editor |
| `ProductionPage` | `components/orders/production-page.tsx` | Legacy — UI redirects to `/orders?tab=in_production` |
| `CompletedPage` | `components/orders/completed-page.tsx` | SDR (own created only), Accountant + Admin (all) |
| `AccountantDashboard` | `components/admin/accountant-dashboard.tsx` | Accountant only |
| `NewQuoteForm` | `components/quotes/new-quote-form.tsx` | Sales + SDR (create), Admin |
| `QuoteDetail` | `components/quotes/quote-detail.tsx` | All roles; `context` prop selects overview card (quote/order/payment/production/completed) |
| `QuotePaymentConfig` | `components/quotes/quote-payment-config.tsx` | All roles (payment strategy + deposit + channels) |
| `OtpInput` | `components/auth/otp-input.tsx` | Auth pages (setup-2fa, verify-2fa) |

---

## Shared UI Components

| Component | File | Used in |
|-----------|------|---------|
| `StatusPill` | `components/ui/status-pill.tsx` | Tables, drawers |
| `UrgencyPill` | `components/ui/urgency-pill.tsx` | Tables, drawers |
| `TableRowsSkeleton` | `components/ui/table-skeleton.tsx` | Inside `<tbody>` on leads-page, sales-page, payments-page — renders `<tr>` rows. Props: `rows` (default 5), `cols`. |
| `TableDivSkeleton` | `components/ui/table-skeleton.tsx` | Standalone div-based table shimmer on orders-page, production-page, completed-page, quotes-page, all `loading.tsx` files. Props: `rows` (default 5), `cols`. |
| `ErrorBoundary` | `components/layout/error-boundary.tsx` | Wraps `{children}` in `app/(app)/layout.tsx`. Catches unhandled runtime errors and shows a "Try again" button instead of a blank page. |
| `LeadHistoryTable` | `components/leads/lead-history-table.tsx` | Leads **Won** tab only (not customer profile) |
| `DashboardDateRangeFilter` | `components/ui/dashboard-date-range-filter.tsx` | SDR/Sales/Admin dashboards, Orders, Quotes, Completed list pages |
| `DashboardValuesPrivacyToggle` / `DashboardHiddenValue` | `components/dashboard/dashboard-privacy.tsx` | SDR, Sales, Accountant dashboards — Hide / Show KPI values |
| `PhoneInput` | `components/ui/phone-input.tsx` | Add Lead modal, Verify Drawer, Customer Profile, Admin Company Info, New Quote / Quote Detail |
| `EmailInput` | `components/ui/email-input.tsx` | Add Lead modal, Verify Drawer, Customer Profile, Login page, Admin Invite User form, Admin Company Info, New Quote / Quote Detail |
| `LinkedLeadCard` | `components/ui/linked-lead-card.tsx` | New Quote form (left sidebar when `?lead_id` present), Quote Detail (left sidebar) |

### Form validation utilities

| Helper | File | Purpose |
|--------|------|---------|
| `validateWebsite()` / `normalizeWebsite()` | `lib/utils/website.ts` | Optional website/social URL; scheme not required in UI |
| `scrollToFormField()` | `lib/utils/scroll-field-into-view.ts` | Scroll `[data-field-anchor]` into view + focus on validation failure |
| `scrollToFirstFormField()` | `lib/utils/scroll-field-into-view.ts` | First error in priority order (New Quote tabs) |
| `ticketKindForReference()` / `ticketIsQuoteStage()` | `lib/utils/reference-codes.ts` | Align `ticket_kind` with `QUO-*` / `ORD-*`; quote vs order UI labels |
| `buildTicketLifecycleTimeline()` | `lib/utils/ticket-lifecycle-timeline.ts` | Quote/order detail milestone row (creation from activity payload) |

> **Rule:** Validatable fields in scrollable modals/drawers use `data-field-anchor="…"` on a wrapper `div` and call `scrollToFormField(containerRef, anchor)` when setting an error — so off-screen fields (e.g. Source) are visible after failed submit.
| `MobileListCard` / `TicketListToolbar` | `components/ui/mobile-list-card.tsx` | Quotes, Orders, In Production, Completed, Payments list pages (mobile card fallback at `< lg`) |
| `DetailCollapsibleSection` | `components/quotes/quote-detail/detail-layout-primitives.tsx` | Collapsible section header (chevron toggle; default closed) — Timeline, Pricing, Payment settings on detail pages |
| `DetailQuickActions` | `components/quotes/quote-detail/detail-quick-actions.tsx` | Quote/order detail sidebar — quote lifecycle (Cancel, Send/Resend, Convert), **Customer Link** + **Copy Link**, Mark Completed, Resend invoice |
| `ResendAfterSaveModal` | `components/quotes/quote-detail/resend-after-save-modal.tsx` | After **Save Changes** on sent/unconfirmed quote (SDR/Sales) or sent/order/in_production (Admin) — optional resend with revision email |
| `LineItemVariants` | `components/quotes/shared/line-item-variants.tsx` | Additional SKUs per catalog line (name, qty, attach); `AdditionalSkusOverviewList` on detail Overview |
| `DatePicker` | `components/ui/date-picker.tsx` | New Quote form (Due Date field), Quote Detail (Due Date edit), Quote tab (First Reminder date) |

> **Rule:** Every phone or email input in the app **must** use `PhoneInput` or `EmailInput`. Never add a raw `<input type="tel">` or `<input type="email">` in a component.

---

## PDF Generation

PDF rendering uses `@react-pdf/renderer` (server-side only — never imported in Client Components).

| File | Purpose |
|------|---------|
| `lib/pdf/invoice-pdf.tsx` | `InvoicePDF` React component — renders a `<Document>` + `<Page>` with all invoice sections. Accepts typed props (company, ticket, customer, skus, pricing). Used exclusively by the `/api/tickets/[id]/pdf` route handler. |

**How it works:**
1. `GET /api/tickets/[id]/pdf` — `requireSession()` (MFA) + `canAccessTicket()` (same scope as ticket detail).
2. Route fetches ticket + company_settings from Supabase (admin client).
3. `renderToBuffer(<InvoicePDF .../>)` produces a PDF binary server-side — wrapped in `try/catch`; failures return a clean 500 instead of an unhandled exception.
4. Response: `Content-Type: application/pdf` + `Content-Disposition: attachment`.
5. In `quote-detail.tsx`, the "Save PDF" button is `<a href="/api/tickets/[id]/pdf" download>` — one click downloads the file with no new tab.

`GET /api/tickets/[id]/print` uses the same auth checks; returns HTML for browser print. See **`docs/security.md`**.

**Pattern for adding new PDF types:**
- Create a new component in `lib/pdf/` (e.g. `lib/pdf/packing-slip.tsx`)
- Create a new route handler (e.g. `app/api/tickets/[id]/packing-slip/route.ts`)
- Add a download link pointing to the new route — no frontend state needed

---

## Page-by-Page Breakdown

### `/dashboard` — Role-scoped Dashboard

```
app/(app)/dashboard/page.tsx  [Server Component — thin wrapper]
  └── components/admin/dashboard-page.tsx  [Client Component]
        ├── Detects role via Supabase (createBrowserClient)
        ├── Shows skeleton while role loads
        └── Renders one of:
              components/sales/sdr-dashboard.tsx   (role === "sdr")
              components/sales/sales-dashboard.tsx (role === "sales")
              components/admin/admin-dashboard.tsx (role === "admin")
              components/admin/accountant-dashboard.tsx (role === "accountant")
        SDR / Sales / Admin dashboards:
              ├── components/ui/dashboard-date-range-filter.tsx — Today / Yesterday / Last 7 Days / Last 30 Days / Custom; default **Last 30 Days** (`last_month`)
              ├── components/dashboard/dashboard-privacy.tsx — Hide / Show values toggle + confirm modal; `useDashboardPrivacy`, `DashboardHiddenValue` (masked KPI placeholders)
              ├── SDR KPI grid (9 cards): Orders ($ + convert count in subtext), Received, Balance, Lead Claimed, Lead Created, Inbox, Rejected, On Hold, Routed to Sales — no **Sales Win** or routed-lead revenue — `components/sales/sdr-dashboard.tsx`
              ├── Sales KPI grid (7 cards): Orders ($ + convert count), Received, Balance, Lead Claimed, Inbox, Rejected, On Hold — no **Lead Created** (SDRs only) — `components/sales/sales-dashboard.tsx`
              ├── Admin: company KPI cards + Team section (privacy toggle on Admin UI pending)
              └── GET /api/dashboard/kpis?sdr_preset=… | sales_preset=… | admin_preset=… (API defaults `last_month`; early return when `dashboard_values_hidden`)
        Accountant dashboard:
              ├── components/dashboard/dashboard-privacy.tsx — same Hide / Show toggle
              └── GET /api/payments/counts (not KPIs route; returns `values_hidden` + counts or null)
```

---

### `/leads` — SDR Lead Pipeline

```
app/(app)/leads/page.tsx  [Server Component — thin wrapper]
  └── components/leads/leads-page.tsx  [Client Component "use client"]
        ├── Tabs: All Leads | On Hold | Directed to Sales | Rejected | Won
        ├── Tab state: local useState (not synced to URL)
        ├── Mount: GET /api/leads/workspace/page-data?… → { leads, counts, pagination, routedSubCounts? }
        ├── Lookups / product-types / SDR users: lazy on Add Lead or Reassign open
        ├── Drawer open: GET /api/leads/[id] via fetchLeadById() (full record)
        ├── Refetch: useCoalescedRefresh + bazaar:refresh-counts (counts-only or full page-data)
        ├── Search: server-side (debounced 300 ms) via `?search=`
        ├── Sort: server-side — `?sort=created|urgency&sort_dir=`
        ├── Owner filter (SDR only): All Leads / My Leads → `?owner_scope=all|mine` (all = unclaimed pool; mine = claimed by me)
        ├── Claim/View: `useGlobalLoading` overlay + row spinner while lock + `fetchLeadById` run
        ├── Routed tab sub-filters: server-side → `?routed_filter=`; badges from `routedSubCounts`
        ├── ListPagination: Showing 1–25 of N, prev/next, rows-per-page (25/50/100)
        ├── components/leads/product-interest-rows.tsx — shared Product Interests rows (Add Lead + Verify drawer)
        └── components/leads/verify-drawer.tsx (opens on Claim / View click)
              └── components/leads/hold-sub-form.tsx (hold reason sub-form)
```

**Tab → API mapping:**

| Tab | API params | Notes |
|-----|------------|-------|
| All Leads | `statuses=Pending,Validated&owner_scope=all\|mine` | SDR **All** toggle → unclaimed only; **My** → claimed by me; Admin sees all |
| On Hold | `status=On Hold&scope=mine` | SDR sees own; Admin sees all |
| Directed to Sales | `status=Routed to Sales&scope=mine` | SDR sees own; Admin sees all |
| Rejected | `status=Rejected&scope=mine` | SDR sees own (leads they rejected); Admin sees all SDR-rejected leads |
| Won | `won=true` | Shared `LeadHistoryTable`; **SDR row click → read-only Verify Drawer**; Admin → read-only Verify Drawer |

**All Leads table columns:** Name, Company, Source, **Product Interests**, Phone, Urgency, Status, **Owner**, Created, Action

**Product Interests column:** formatted as `ProductName[quantity]` (e.g. `Booklets[1111]`) from `interests` + `quantities` via `lib/utils/format-lead-product-interests.ts`. Same column on **On Hold**, **Directed to Sales**, and **Rejected** tabs (desktop + mobile).

**Owner column:** shows SDR name / "You" for owned leads, "Unclaimed" badge for unowned — visible to all roles.

**Action button (SDR):**
- `locked_by_id === null` → **Claim** button (navy fill) — acquires lock + permanent ownership
- `locked_by_id === userId` → **View** button (outlined) — re-opens owned lead
- Admin → **View** button (no lock acquired) + optional **Reassign** button

---

### `/sales` — Sales Pipeline

```
app/(app)/sales/page.tsx  [Server Component — thin wrapper]
  └── components/sales/sales-page.tsx  [Client Component "use client"]
        ├── Tabs: Pipeline | On Hold | Rejected
        ├── Tab state: local useState
        ├── Mount: GET /api/leads/sales/page-data?tab=… → { leads, counts }
        ├── Tab switch / lazy tabs: GET /api/leads/workspace?status=... (slim list)
        ├── Lookups / sales users: lazy on drawer/modal open
        ├── Drawer open: GET /api/leads/[id] via fetchLeadById() (full record)
        ├── Refetch: useCoalescedRefresh + bazaar:refresh-counts
        └── components/sales/sales-drawer.tsx (opens on Claim / Open / View click)
```

**Tab → API mapping:**

| Tab | API params | Notes |
|-----|------------|-------|
| Pipeline | `status=Routed to Sales` | Sales sees unclaimed + own; Admin sees all; client-filtered by `sales_status` |
| On Hold | `status=Routed to Sales` | Client-filtered by `sales_status = On Hold` |
| Rejected | `status=Rejected&prev_status=Routed+to+Sales` | Only leads rejected *from* the sales pipeline; lazy-fetched on first tab open |

**Count badge:** From page-data `counts` on mount; `GET /api/leads/sales-counts` still used for counts-only refresh. `rejected` count uses same `prev_status = 'Routed to Sales'` filter so badge matches list.

**Pipeline / On Hold / Rejected table columns:** Name, Company, **Product Interests** (`ProductName[quantity]`), then tab-specific columns (Phone, Sales Status, Hold Reason, etc.).

**Sales Drawer tabs:** Lead Info | Order / Quote | **History** (fetches `GET /api/leads/[id]/activities` lazily on first open — vertical timeline of all events)

**Sales Drawer — Lead Info tab — Sales Fields section:** includes a `sales_notes` textarea (saved via `PATCH /api/leads/[id]`, logged as `lead_edited` activity). Notes are internal — visible to Sales and Admin only.

**Verify Drawer tabs:** Lead Info | Quote | **History** (same lazy-fetch pattern as Sales Drawer — fetches `GET /api/leads/[id]/activities` on first open, renders vertical timeline with colored dots, actor name, relative timestamps)

---

### `/quotes` — Quoted Requests list

```
app/(app)/quotes/page.tsx  [Server Component — thin wrapper]
  └── components/quotes/quotes-page.tsx  [Client Component "use client"]
        ├── Date filter: DashboardDateRangeFilter → server `date_from` / `date_to` on page-data
        ├── Tabs: All | Draft | Sent | Won | Routed to Sales* (count badge on all)
        │         * "Routed to Sales" only visible to Sales + Admin roles
        ├── Mount: GET /api/quotes/page-data → { tickets, counts, pagination }
        ├── Realtime: useCoalescedRefresh on bazaar:tickets-changed | refresh-counts | activities-changed
        │    Sidebar: job_tickets + activities INSERT (claim) → tickets-changed
        │    Page (Sales/Admin/SDR with Routed tab): channel quotes-page-routed-sync on job_tickets + activities INSERT → silent page-data refetch
        │    Requires supabase migration 086_job_tickets_routed_realtime_rls.sql (sales_read_routed_tickets RLS)
        ├── Slim list — no line_items on table rows
        ├── Columns: Contact, Title, Channel, Total, Due Now, Status pill, Follow-up, Created
        ├── Search: server-side (debounced) via `?search=`
        ├── ListPagination (25 default)
        ├── Mobile (< lg): `MobileListCard` per row + `TicketListToolbar`; desktop: table
        ├── Claim action (Routed tab): PATCH /api/tickets/[id] { claim_ownership: true }
        └── Row click → /quotes/[id]
```

---

### `/orders` — Orders list

```
app/(app)/orders/page.tsx  [Server Component — thin wrapper]
  └── components/orders/orders-page.tsx  [Client Component "use client"]
        ├── Date filter: DashboardDateRangeFilter → server `date_from` / `date_to`
        ├── Tabs: All | Pending Payment | In Production | Cancelled (count badge on all; default tab = All; URL `?tab=`)
        ├── Mount: GET /api/orders/page-data → { orders, counts, pagination }
        ├── Slim list from page-data — status_label / status_tone from API
        ├── Column sort: server-side `?sort=` (Created by, Balance Due, Due Date, Status, Payment)
        ├── Realtime: useCoalescedRefresh on bazaar:tickets-changed
        ├── Columns: Order #, Contact, Title (⚡ Rush), Total, Status pill (from status_label), Payment status pill, Priority, Due Date, Created
        ├── No "New Order" button — orders created only through Quotes flow
        ├── Search: server-side (debounced) via `?search=`
        ├── ListPagination (25 default)
        ├── Mobile (< lg): `MobileListCard` per row + `TicketListToolbar`; desktop: table
        └── Row click → /orders/[id]

app/(app)/orders/[id]/page.tsx  [Server Component — thin wrapper]
  └── components/quotes/quote-detail.tsx  [Client Component — same component as /quotes/[id]]
        ├── components/quotes/quote-detail/customer-info-card.tsx  ← left sidebar
        ├── components/quotes/quote-detail/history-section.tsx     ← History tab
        └── components/quotes/quote-detail/ticket-skeleton.tsx     ← loading state
        └── Deposit status bar shown when order has partial prepayment set
```

---

### `/completed` — Completed orders

```
app/(app)/completed/page.tsx  [Server Component — thin wrapper]
  └── components/orders/completed-page.tsx  [Client Component "use client"]
        ├── Mount: GET /api/completed/page-data → { orders, counts, pagination }
        ├── Realtime: useCoalescedRefresh on bazaar:tickets-changed + bazaar:refresh-counts
        ├── Search + date filter: server-side on page-data
        ├── ListPagination (25 default)
        ├── Mobile (< lg): MobileListCard per row; desktop: table
        ├── Row click → /completed/[id]
        └── Role scope (API layer — `scopeJobTicketsQuery` / `scopeCompletedTicketsQuery`):
              SDR — Quotes / Orders / Completed: `created_by_id = session user`
                    (after Sales claims HVT quote, row leaves SDR lists; detail via `routed_by_id` until completed)
              Sales — Orders/Completed: `created_by_id`; Quotes + routed claim queue
              Accountant / Admin — all completed tickets

app/(app)/completed/[id]/page.tsx  [Server Component — thin wrapper]
  └── components/quotes/quote-detail.tsx  [context="completed"]
        ├── Resend invoice link (Admin + Accountant only)
        └── SDR read-only when they created the ticket; 403 on routed-to-Sales completed orders
```

---

### `/quotes/new` — New Quote form

```
app/(app)/quotes/new/page.tsx  [Server Component — thin wrapper]
  └── components/quotes/new-quote-form.tsx  [Client Component "use client"]
        │   Uses shared sub-components:
        │     components/quotes/shared/info-form.tsx
        │     components/quotes/shared/line-items-form.tsx
        │     components/quotes/shared/sku-row.tsx
        │     components/quotes/shared/quote-form.tsx → components/quotes/quote-payment-config.tsx
        │     components/quotes/shared/shipping-fulfillment-section.tsx
        │
        ├── Entry modes (detected from URL params):
        │    ?lead_id=uuid        → LinkedLeadCard sidebar, skip Customer tab, start on Info; source from lead
        │    ?customer_id=...     → Customer card sidebar, skip Customer tab, start on Info; Quote source on Info tab
        │    (none)               → No sidebar, Customer tab as step 1; quote_source on ticket at save
        │
        ├── Tabs: [Customer] | Info | Line Items | Quote
        │         Customer tab hidden when lead_id or CRM params present
        │
        ├── Customer Tab — phone-first search (standalone only):
        │    Phone | Email → First Name | Last Name → Company → Source * → Industry * | Website
        │    600ms debounce → GET /api/customers/lookup?phone=...
        │    0 matches: all fields editable
        │    1+ matches: picker modal → select or create new
        │    Selected: identity fields lock; Source/Industry/Website stay editable
        │    Pre-fill: customer fields (incl. authority on customer row) + latest_source from lookup
        │    Save: from_quote_page + quote_source on ticket (no auto-lead); customer_id when known
        │    Decision Maker NOT on quote — lives on customers.authority (lead/CRM only)
        │
        ├── Info Tab — 50/50 grid layout (after optional Quote source card for CRM):
        │    Row 1: Title (required *) | Priority segmented control (required *)
        │      Priority options: Low / Normal / High — each button uses per-priority colors
        │      (same segmented style as Discount type control, no pill buttons)
        │    Row 2: Due Date (required *) | Rush Order compact toggle
        │      Due Date quick picks: Today / Tomorrow / +3d (no +1w)
        │      Active quick pick highlights navy when date matches calendar selection
        │      Rush toggle: compact inline row (label above, "Rush On/Off" + switch)
        │
        ├── Line Items Tab:
        │    Line Total override per SKU row (overrides qty × unit price)
        │    Line Item Comment on its own row above Line Total
        │    Add Line Item auto-scrolls to new row
        │    SkuSelect helper: appearance-none + ChevronDown on all selects
        │
        ├── Quote Tab:
        │    Fulfillment: `components/quotes/shared/shipping-fulfillment-section.tsx`
        │      Pickup | Ship to customer; Shipping ($) required when Ship; optional address + past-address picker
        │    Adjustments: Tax Rate + Discount + Tax Exempt on one row (`quote-form.tsx`)
        │    Payment Methods: independent toggle buttons (flex gap, not connected bar)
        │      Card Payment + Zelle: multi-select allowed simultaneously
        │      Offline: mutually exclusive — clears others when selected
        │      Hint: "Select all that apply · Offline is exclusive"
        │    Tax Exempt: when enabled, Sales Permit # becomes required (*)
        │    Prepayment/Deposit: Full Payment | Partial Payment toggle
        │      → Partial: % / $ type + amount + Total / Due Now / Balance summary pill
        │    StyledSelect on Send Via and Follow-Up Frequency
        │    First Reminder: custom DatePicker (not native input)
        │    Quote destination auto-fills from locked customer when channel changes
        │
        ├── Tab navigation guard:
        │    Future tabs: dimmed (opacity 0.5), cursor not-allowed
        │      Clicking triggers current-tab validation — blocks advance if errors
        │      Sequential only — cannot skip tabs
        │    Past tabs: green step badge, freely clickable (go back, clear errors)
        │    Current tab: gold underline, normal opacity
        │
        ├── Validation per tab before advancing:
        │    Customer: name + phone or email + source + industry required
        │    Info: title + due date required (priority always has a value)
        │    Line Items: ≥1 fully-filled item (product + qty + unit price)
        │    Quote: destination required; Sales Permit # required if Tax Exempt;
        │      Shipping ($) required if Ship to customer selected; ZIP format if address ZIP entered
        │
        ├── High-Value Threshold modal (SDR only):
        │    Fires when advancing to Quote tab with total > HVT
        │    Non-dismissible, 30s countdown → saves as 'routed' → redirect to /quotes
        │
        ├── Data: GET /api/lookups, GET /api/lookups/products, GET /api/admin/company
        ├── Save Draft: POST /api/tickets { status: 'draft' } — available from Line Items onwards
        ├── Save & Send: POST /api/tickets { status: 'sent', from_quote_page?, quote_source? } → triggers delivery
        │    Shows global loading overlay ("Sending quote…") via `useGlobalLoading()`
        └── Customer upsert: handled inside POST /api/tickets (match/create customer; quote_source on ticket when from Quotes page)
```

---

### `/quotes/[id]` — Quote / Order detail

```
app/(app)/quotes/[id]/page.tsx  [Server Component — thin wrapper]
  └── components/quotes/quote-detail.tsx  [Client Component "use client"]
        │   Uses shared sub-components:
        │     components/quotes/shared/info-form.tsx
        │     components/quotes/shared/line-items-form.tsx
        │     components/quotes/shared/sku-row.tsx
        │     components/quotes/shared/line-item-variants.tsx
        │     components/quotes/quote-detail/resend-after-save-modal.tsx
        │     components/quotes/shared/quote-form.tsx → components/quotes/quote-payment-config.tsx
        │     components/quotes/shared/shipping-fulfillment-section.tsx
        │     components/quotes/quote-detail/customer-info-card.tsx
        │     components/quotes/quote-detail/history-section.tsx
        │     components/quotes/quote-detail/ticket-skeleton.tsx
        │     components/quotes/quote-detail/ticket-detail-overview.tsx
        │     components/quotes/quote-detail/ticket-overview-sections.tsx
        │     components/quotes/quote-detail/detail-layout-primitives.tsx  ← DetailCollapsibleSection, stat cards
        │     components/quotes/quote-detail/ticket-lifecycle-timeline.tsx
        │     components/quotes/quote-detail/ticket-stats-row.tsx
        │     components/quotes/quote-detail/detail-quick-actions.tsx
        │     components/orders/payment-detail-overview.tsx
        │     components/orders/production-detail-overview.tsx
        │
        ├── Overview layout (`isOverviewLayout` — sent quote, order, payment, production, completed):
        │    Top: `TicketStatsRow` (5 stat cards; mobile: 100% total + 2×2 grid)
        │    Below stats: `TicketLifecycleTimeline` — collapsible, default collapsed
        │    Grid: left sidebar (always) + right Overview/History panel
        │    Overview tab: Line Items always visible; **Fulfillment** always visible (method, charge, ship-to);
        │      **Pricing** + **Payment & order settings** collapsible (default collapsed)
        │    Desktop xl+: fixed viewport height; only right panel scrolls
        │    Mobile/tablet: single page scroll (no nested scroll on Overview panel)
        │
        ├── Context prop routes overview card:
        │    context="quote" | "order" | "payment" | "production" | "completed"
        │    Payment context → PaymentDetailOverview (evidence review + Confirm, or read-only when reviewed)
        │    Production context → ProductionDetailOverview (contextual notices)
        │    Quote sent stage → quote link actions in DetailQuickActions (not separate bar)
        │
        ├── Left sidebar (always rendered in overview layout):
        │    LinkedLeadCard   — if ticket has linked_lead_id
        │    CustomerInfoCard — if customer/contact exists (lookup labels for industry + quote_source)
        │    DetailQuickActions — all lifecycle actions stacked below card:
        │      Quote: Cancel, Send/Resend Quote, Convert to Order (admin)
        │      Order+: row 1 Mark Completed | Resend Link; row 2 Customer Link | Copy Link (public `/q/{token}`)
        │
        ├── 2-tab view: Overview | History  (draft edit mode may show full form instead)
        │    Overview tab: context-specific snapshot + read-only line items / pricing / payment config
        │    History tab: full activity trail (ticket + linked lead when include_linked_lead=true)
        ├── View mode default; Edit button toggles edit mode (quote stage only when unlocked)
        │    Edit lock: customer-approved tickets (status: order/in_production/completed) are read-only
        │    for non-admins. "Record Locked" banner shown. Admin can still edit/cancel.
        │
        ├── Long-running saves: global loading overlay (`useGlobalLoading`) on send, convert, complete, etc.
        │
        ├── Header badges:
        │    Confirmed by Customer (green) — if client_confirmed = true
        │    Converted to Order (blue) — if manually converted (order but not client_confirmed)
        │    Payment status badge (Unpaid/Partial/Paid) — orders only
        │
        ├── Edit mode Info section (matches new-quote-form layout):
        │    Row 1: Title (required *) | Priority segmented control (required *)
        │    Row 2: Due Date (required *) | Rush Order compact toggle
        │    Same quick picks (Today / Tomorrow / +3d), same active highlight behavior
        │    Title and Due Date validated on save — blocks with inline errors
        │
        ├── Pricing Summary (read-only view):
        │    Discount row: derived as subtotal + shipping − pre_tax_total (not hardcoded 0)
        │    Discount field: shows `10%` or `$700` format
        │    Partial prepayment section below Total: Due Now (green) + Balance Due Later (amber)
        │
        ├── Payment Methods (edit):
        │    Independent toggle buttons (not connected segmented bar)
        │    Card Payment + Zelle: multi-select
        │    Offline: mutually exclusive
        │    Read-only field: shows all selected methods joined by ", "
        │
        ├── Prepayment (read-only):
        │    "Prepayment" field: `Partial — 25%` / `Partial — $500` / `Full Payment` / hidden
        │
        ├── Status actions: see `DetailQuickActions` in left sidebar (no bottom action bar on overview layout)
        ├── In-production on /orders/[id]: header badge In Production; Mark Completed in DetailQuickActions
        ├── Payment review (order context): PricingPaymentSummary read-only for sales/SDR; evidence hidden
        ├── TicketLifecycleTimeline: GET /api/activities?ticket_id=… (same id resolution); buildTicketLifecycleTimeline() — creation label from activity payload (QUO-*), not post-convert ORD-*
        ├── History: GET /api/activities?ticket_id=xxx&include_linked_lead=true (ticket_id = UUID or ORD-* / QUO-*)
        ├── Realtime: direct Supabase channel + bazaar:tickets-changed + bazaar:leads-changed
        └── Rendered at:
             /quotes/[id]  (context="quote")
             /orders/[id]  (context="order" — includes in_production)
             /payments/[id] (context="payment")
             /completed/[id] (context="completed")
             (/production/[id] redirects to /orders/[id])
```

---

### `/q/[token]` — Public Quote / Order / Payment portal

```
app/(public)/q/[token]/page.tsx  [Client Component "use client"]
      │
      ├── Data: GET /api/public/quotes/[token] (no auth; staff logged in can also view)
      │
      ├── Portal phases (`computePortalState`):
      │    needs_confirm → needs_payment → evidence_pending → balance_due → fully_paid → order_ready
      │
      ├── Checklist Step 1 (price confirmation):
      │    Title: Confirm quote price (pending) | Quote price confirmed | Quote price confirmation (not required)
      │    "Confirm & Accept Quote" → POST /api/public/quotes/[token]/confirm (sets client_confirmed only)
      │
      ├── Payment stepper (after price gate open):
      │    Channel panels: Wire / ACH / Zelle / Check / Card / Cash
      │    POST /api/public/quotes/[token]/submit-payment (multipart; balance while in_production)
      │    evidence_pending → amber "under review" (balance copy when already in production)
      │    Pay remaining balance CTA under Step 3 when in_production + partial
      │
      ├── Completed state:
      │    Green "Ready for pickup" banner with shop address + phone
      │
      ├── Sub-components: LoadingSkeleton | NotFound | PublicQuoteDocument
      └── Save PDF: GET /api/public/quotes/[token]/pdf (no auth; hides paid rows while evidence pending)
```

---

### Quote Email (`lib/integrations/quote-email-template.ts`)

- **`QuoteEmailData`** — accepts `prepaymentType` and `prepaymentValue` (optional)
- When partial prepayment is set, a **Payment Schedule** section is injected between the pricing total and the payment methods:
  - Amber-highlighted row: "Deposit Due Now" + amount
  - Plain row: "Balance Remaining" + amount + italic note
- Subject / CTA label differ by `isOrder`: "Your Quote is Ready" vs "Your Order — Payment Details"

---

### `/reports` — Reports (admin only)

```
app/(app)/reports/page.tsx  [Server Component — thin wrapper]
  └── components/reports/reports-page.tsx  [Client Component "use client"]
        ├── reports-filters-modal.tsx      ← Week / Month / Quarter + custom date range
        ├── rep-scorecard-table.tsx        ← Sales + SDR scorecards (display-only)
        ├── payment-ledger-section.tsx     ← Payment line items; lifecycle links + ?from=/reports
        ├── awaiting-collection-section.tsx ← Live balance-due; lifecycle links + ?from=/reports
        └── GET /api/reports/summary?period=…&date_from=…&date_to=…&user_id=…
```

**Access:** Admin only (`requireAdmin`). Grant `/reports` via Admin → Roles & Permissions (seeded in `schema.sql` `pages` table).

**Metrics:** Cash collected (offline payments), released order value, win rate, funnel, rep attribution for bonus tracking. See `docs/feature-specs/reports.md`.

---

### `/crm` — Customer Registry

```
app/(app)/crm/page.tsx  [Server Component — thin wrapper]
  └── components/crm/crm-page.tsx  [Client Component "use client"]
        ├── Mount: GET /api/crm/page-data → { customers, pagination }
        ├── Header: Add Customer + search/status/heat filters (no manual Refresh — Realtime)
        ├── Search/status/heat: server-side; debounced search (300 ms)
        ├── ListPagination (25 default; 25/50/100)
        ├── AddCustomerModal → POST /api/customers
        ├── useCoalescedRefresh: bazaar:customers-changed, leads-changed, tickets-changed
        ├── Industry column (lookup labels); company → profile; tel:/mailto: links
        └── View / Add Quote actions (row not clickable)

        GET /api/customers — merge search + Add Customer callers only (not list page)

app/(app)/crm/customers/[id]/page.tsx  [Server Component — thin wrapper]
  └── components/crm/customer-profile.tsx  [Client Component]
        ├── GET /api/customers/[id] — customer + lead_count + customer_status
        ├── GET /api/tickets?customer_id=… — Quotes & Orders list
        └── Quotes & Orders section (click → quote/order detail). **Lead History removed (May 2026).**
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
| SDR opens their own lead (All Leads / On Hold) | Edit mode |
| SDR opens lead on **Directed to Sales** or **Won** tab | Read-only Verify Drawer + routed/won banner (no customer redirect) |
| SDR opens lead locked by someone else (race condition on stale page) | Read-only + "currently working" banner |
| Admin opens any lead via View | Read-only (no lock acquired) on scoped tabs; editable on All Leads with override banner when terminal |

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
| Page load | Client Component (useEffect) | `fetch('/api/...')` Route Handler — scoped list endpoints (see `docs/architecture.md`) |
| Tab switch | Client Component | `fetch('/api/...')` Route Handler |
| Drawer open | Client Component | `fetch('/api/leads/[id]')` for full lead record (`lib/utils/fetch-lead.ts`) |
| After mutation | Client Component | Optimistic update or re-fetch |
| Count refresh | Client Component | `window.dispatchEvent(new Event("bazaar:refresh-counts"))` |
| Realtime DB change | `sidebar.tsx` subscription | `bazaar:leads-changed`, `bazaar:tickets-changed`, `bazaar:customers-changed`, `bazaar:activities-changed` |

**No global state library.** Data lives in local `useState` / `useReducer` in Client Components.

---

## Realtime Listeners

Browser events dispatched by `components/layout/sidebar.tsx` on Supabase Realtime changes (`bazaar:leads-changed`, `bazaar:tickets-changed`, `bazaar:customers-changed`, `bazaar:activities-changed`):

| Component | Behavior |
|-----------|---------|
| `components/leads/leads-page.tsx` | Silent re-fetch; `enabled: !drawerLead \|\| drawerReadOnly` (read-only drawer does not pause refresh); editable drawer close resumes silently |
| `components/sales/sales-page.tsx` | Silent re-fetch of routed leads + tab counts; defers if drawer is open; full lead on drawer open |
| `components/crm/crm-page.tsx` | Coalesced refetch on `bazaar:customers-changed`, `bazaar:leads-changed`, `bazaar:tickets-changed` |
| `components/admin/admin-dashboard.tsx` | Silent re-fetch of all KPIs (no skeleton flash) |
| `components/orders/production-page.tsx` | Coalesced refetch on mount + `bazaar:tickets-changed` |

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
- **Terminal lead override**: Admin opening a terminal lead (Won/Dropped/Rejected) sees an amber "Admin override" banner instead of the red lock banner. The drawer is fully editable. Won leads include a caution note about the linked order.
- **Order lifecycle buttons**: Admin sees "Mark In Production" / "Mark Completed" buttons on order detail pages. Non-admins see no lifecycle controls.
- **Dashboard session KPIs**: Admin dashboard shows "Active Users" and "Idle Sign-outs (7d)" KPI cards sourced from `GET /api/admin/sessions`.

---

## Idle Timer

`components/layout/idle-timer.tsx` — mounted once in `app/(app)/layout.tsx`, runs on every app page for all roles.

```
app/(app)/layout.tsx
  ├── components/layout/sidebar.tsx        ← collapsible nav + realtime subscriptions
  ├── components/layout/mobile-nav.tsx     ← mobile bottom drawer
  └── components/layout/idle-timer.tsx     ← single instance, client component
```

On mount:
1. Fetches `session_idle_timeout_minutes` from `GET /api/admin/company`
2. Reads the current user's ID from Supabase (`getUser()`)
3. Registers activity listeners: `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, `click`
4. Polls every 10 seconds — if idle ≥ (timeout − 2 min): shows `IdleWarningModal` with countdown
5. If user does nothing: `POST /api/auth/session { action: "end", reason: "auto", user_id }` → `supabase.auth.signOut()` → `/login`

`IdleWarningModal` is a blocking overlay (cannot dismiss by clicking outside). Contains a live countdown and a "Stay Signed In" button that resets the idle clock.

---

## Notifications Page — Activity Log

`app/(app)/activity-log/page.tsx` — client component with tab state.

```
/activity-log
  ├── Tab 1: Order / Lead Activity  → <ActivityLogSection />   (columns: Who | Action | Lead/Customer | Quote/Order | When)
  └── Tab 2: User Activity          → <UserActivitySection />  (session KPIs per user)
```

`ActivityLogSection` uses `GET /api/admin/activity-log` — each row includes `ticket_ref` (`QUO-*`, `ORD-*`, ticket UUID suffix, or lead UUID suffix).

`components/admin/user-activity-section.tsx`:
- Fetches `GET /api/admin/sessions?from=&limit=&offset=&user_id=`
- Per-user KPI cards: avatar, name, role pill, green "active now" dot, sessions count, active time, amber "⚠ N idle sign-outs" badge
- Filterable session history table: Today / Last 7 days / Last 30 days range selector + per-user filter dropdown
- Mobile card layout below `sm` breakpoint
