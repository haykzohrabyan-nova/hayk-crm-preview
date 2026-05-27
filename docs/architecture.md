# BazaarPrinting CRM — Architecture & Setup

> Internal CRM for BazaarPrinting. Built on Next.js 16 + Supabase (Auth + Postgres) with a proof-of-concept in `sdr-crm-system` as the feature blueprint. See `docs/security.md`, `docs/schema.md`, `docs/api-contract.md`, `docs/rbac.md`, `docs/navigation.md`, and `docs/feature-specs/` for the full production specification.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.x — App Router |
| Language | TypeScript 5.x — `strict: true` |
| Runtime | React 19.x |
| Styling | Tailwind CSS v4 + `@tailwindcss/postcss` |
| UI primitives | shadcn CLI (`style: base-nova`) + `@base-ui/react` |
| Icons | `lucide-react` |
| Font | Inter (Google Fonts via `next/font/google`) |
| Auth | Supabase Auth — email/password + TOTP MFA (AAL2) |
| Database | Supabase Postgres |
| Browser client | `@supabase/ssr` — `createBrowserClient` |
| Server client | `@supabase/supabase-js` — service role (Route Handlers only) |
| Hosting | Vercel (Production + Preview) |
| Session gate | `proxy.ts` (Next.js 16 Proxy — **not** `middleware.ts`) |

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + Server | Supabase anon/public key |
| `SUPABASE_SECRET_KEY` | Server only | Supabase service-role key — used for `admin.createUser`, `admin.updateUserById` in Route Handlers — never expose to browser |
| `NEXT_PUBLIC_APP_URL` | Browser + Server | Canonical origin (`https://bazar-crm-eta.vercel.app` in prod, `http://localhost:3000` locally) |
| `OUTREACH_EMAIL_PROVIDER` | Server only | `'console'` in dev; set to provider name (e.g. `'resend'`) in prod |
| `OUTREACH_SMS_PROVIDER` | Server only | `'console'` in dev; set to provider name (e.g. `'twilio'`) in prod |
| `RESEND_API_KEY` | Server only | Email provider key (when `OUTREACH_EMAIL_PROVIDER=resend`) |
| `TWILIO_ACCOUNT_SID` | Server only | Twilio SID (when `OUTREACH_SMS_PROVIDER=twilio`) |
| `TWILIO_AUTH_TOKEN` | Server only | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Server only | Twilio sender number |

Copy `.env.local.example` → `.env.local` and fill in values from **Supabase → Project Settings → API**. Email/SMS keys are optional until Phase 10.

---

## Auth Flow

```
/login
  ↓ signInWithPassword()
  ↓ proxy.ts checks AAL level
  ├── No MFA enrolled  (aal1 → aal1)  →  /setup-2fa
  └── MFA enrolled, not verified (aal1 → aal2)  →  /verify-2fa
        ↓ mfa.challenge() + mfa.verify()
        ↓ refreshSession()  ← must happen before navigation
        ↓ window.location.assign()  ← full page nav so AAL2 cookies are set
        → /dashboard
```

### Key rules
- `proxy.ts` enforces AAL2 on all **app pages**. It does **not** run auth on `/api/*` — Route Handlers call `requireSession()` / `requireAdmin()` instead.
- **`requireSession()`** enforces MFA on API routes (matches page gate). Trusted-device cookie (`bazaar_mfa_trust`) skips verify when valid.
- **Public paths** (`/q/*`, `/policy`, `/api/public/*`): no staff auth; logged-in staff visiting `/q/{token}` skip RBAC/MFA redirects for portal preview.
- After `mfa.verify()`, always call `refreshSession()` then use `window.location.assign()` (not `router.push`) so the new cookies are sent before `proxy.ts` runs on the next request.
- All redirects go through `lib/auth/safe-return-path.ts` to prevent open redirect attacks.
- Default post-login destination via `lib/auth/resolve-default-home.ts`: SDR → `/leads`, Sales → `/sales`, Accountant → `/payments`, Admin → `/dashboard`
- Full security reference: **`docs/security.md`**

### Supabase settings required
| Setting | Value |
|---|---|
| Email provider | Enabled |
| Enable email signup | **Off** (users created manually only) |
| Confirm email | **Off** |
| TOTP MFA | **Enabled** |
| Site URL | `https://bazar-crm-eta.vercel.app` |
| Redirect URLs | `https://bazar-crm-eta.vercel.app/**`, `http://localhost:3000/**` |

### Creating users
Users are invited by an Admin via `/admin/users` → "Invite User". This triggers `inviteUserByEmail` in Supabase Auth and immediately creates a `user_profiles` row with the assigned role. No self-registration.

---

## File Structure

```
BazarCRM/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx                    ✓ Centered card wrapper for auth pages
│   │   ├── login/page.tsx                ✓ Email + password sign-in
│   │   ├── setup-2fa/page.tsx            ✓ TOTP enrollment — QR code + manual key
│   │   ├── verify-2fa/page.tsx           ✓ TOTP challenge — 6-box OTP, auto-submits on 6th digit
│   │   └── change-password/page.tsx      ✓ Forced on first login with temp password
│   ├── (app)/
│   │   ├── layout.tsx                    ✓ App shell — sidebar + mobile nav + ErrorBoundary wrapper
│   │   ├── error.tsx                     ✓ Next.js global client error page for the app route group
│   │   ├── dashboard/
│   │   │   ├── page.tsx                  ✓ Role router → sdr/sales/admin dashboard
│   │   │   └── loading.tsx               ✓ Route-level skeleton (TableDivSkeleton)
│   │   ├── leads/
│   │   │   ├── page.tsx                  ✓ SDR + Admin lead pipeline (4 tabs)
│   │   │   └── loading.tsx               ✓ Route-level skeleton
│   │   ├── sales/
│   │   │   ├── page.tsx                  ✓ Sales pipeline (3 tabs)
│   │   │   └── loading.tsx               ✓ Route-level skeleton
│   │   ├── crm/
│   │   │   ├── page.tsx                  ✓ Customer registry + profile expand
│   │   │   ├── loading.tsx               ✓ Route-level skeleton
│   │   │   └── customers/[id]/page.tsx   ✓ Full customer profile page
│   │   ├── quotes/
│   │   │   ├── page.tsx                  ✓ Quoted Requests list (4 tabs)
│   │   │   ├── loading.tsx               ✓ Route-level skeleton
│   │   │   ├── new/page.tsx              ✓ New Quote / Order form
│   │   │   └── [id]/page.tsx             ✓ Quote detail (Overview + History)
│   │   ├── orders/
│   │   │   ├── page.tsx                  ✓ Active orders list
│   │   │   ├── loading.tsx               ✓ Route-level skeleton
│   │   │   └── [id]/page.tsx             ✓ Order detail
│   │   ├── payments/
│   │   │   ├── page.tsx                  ✓ Accountant payment evidence queue
│   │   │   ├── loading.tsx               ✓ Route-level skeleton
│   │   │   └── [id]/page.tsx             ✓ Payment review detail
│   │   ├── production/
│   │   │   ├── page.tsx                  ✓ In-production queue
│   │   │   └── [id]/page.tsx             ✓ Production detail + Mark Completed
│   │   ├── completed/
│   │   │   ├── page.tsx                  ✓ Completed orders list
│   │   │   ├── loading.tsx               ✓ Route-level skeleton
│   │   │   └── [id]/page.tsx             ✓ Completed order detail
│   │   ├── activity-log/
│   │   │   ├── page.tsx                  ✓ Activity Log (Order / Lead + User Activity tabs)
│   │   │   └── loading.tsx               ✓ Route-level skeleton
│   │   ├── notifications/page.tsx        ✓ Redirect → /activity-log (legacy; route reserved for future bell)
│   │   ├── reports/
│   │   │   ├── page.tsx                  ✓ Reports page (admin only)
│   │   │   └── loading.tsx               ✓ Route-level skeleton
│   │   ├── admin/
│   │   │   ├── page.tsx                  ✓ Overview card grid
│   │   │   ├── loading.tsx               ✓ Route-level skeleton
│   │   │   └── settings/[tab]/page.tsx   ✓ users | roles | dropdowns | products | company | notifications | integrations
│   │   ├── settings/page.tsx             ✓ Personal profile settings
│   │   └── profile/page.tsx              ✓ Personal profile settings (alias)
│   ├── api/
│   │   ├── auth/change-password/         ✓ POST — password update
│   │   ├── leads/
│   │   │   ├── manual/route.ts           ✓ POST — manual lead creation with dedup
│   │   │   ├── workspace/route.ts        ✓ GET — slim lead list for table UIs
│   │   │   ├── workspace/page-data/route.ts ✓ GET — leads list + tab counts (one auth pass)
│   │   │   ├── workspace/counts/route.ts ✓ GET — SDR tab badge counts (SQL head counts; realtime refresh)
│   │   │   ├── sales/page-data/route.ts  ✓ GET — sales pipeline list + tab counts
│   │   │   ├── sales-counts/route.ts     ✓ GET — sales tab badge counts (SQL head counts)
│   │   │   └── [id]/
│   │   │       ├── route.ts              ✓ GET full lead (drawers) / PATCH field update
│   │   │       ├── lock/route.ts         ✓ POST — acquire lock + set sdr_id
│   │   │       ├── unlock/route.ts       ✓ POST — release lock
│   │   │       ├── hold/route.ts         ✓ POST — put lead on hold
│   │   │       ├── resume/route.ts       ✓ POST — resume from hold
│   │   │       ├── claim/route.ts        ✓ POST — Sales claim a routed lead
│   │   │       ├── activities/route.ts   ✓ GET — lead activity timeline
│   │   │       └── reassign/route.ts     ✓ POST — Admin reassign/unassign lead
│   │   ├── customers/
│   │   │   ├── route.ts                  ✓ GET — slim customer list + lightweight aggregates
│   │   │   ├── lookup/route.ts           ✓ GET — phone/email dedup lookup
│   │   │   ├── companies/route.ts        ✓ GET — company name autocomplete
│   │   │   ├── [id]/route.ts             ✓ GET/PATCH — customer profile
│   │   │   └── [id]/merge/route.ts       ✓ POST — merge duplicate customers
│   │   ├── tickets/
│   │   │   ├── route.ts                  ✓ GET list (slim quote payload when kind=quote) / POST create
│   │   │   ├── counts/route.ts           ✓ GET — tab badge counts (SQL head counts)
│   │   │   ├── quotes/page-data/route.ts ✓ GET — quote list + quote-stage counts
│   │   │   └── [id]/route.ts             ✓ GET single / PATCH update (supports claim_ownership)
│   │   ├── orders/
│   │   │   ├── orders/route.ts           ✓ GET — slim orders list (order/cancelled, no quote_skus)
│   │   │   ├── page-data/route.ts        ✓ GET — orders list + tab counts
│   │   │   └── counts/route.ts           ✓ GET — orders tab badge counts only
│   │   ├── payments/
│   │   │   ├── pending/route.ts          ✓ GET — payment evidence queue
│   │   │   ├── page-data/route.ts        ✓ GET — pending list (single-tab page)
│   │   │   └── counts/route.ts           ✓ GET — payments tab badge counts
│   │   ├── production/
│   │   │   ├── orders/route.ts           ✓ GET — in_production list
│   │   │   ├── page-data/route.ts        ✓ GET — production list + tab counts
│   │   │   └── counts/route.ts           ✓ GET — production tab badge counts
│   │   ├── completed/
│   │   │   ├── orders/route.ts           ✓ GET — completed list
│   │   │   ├── page-data/route.ts        ✓ GET — completed list + counts
│   │   │   └── counts/route.ts           ✓ GET — completed tab badge counts
│   │   ├── activities/route.ts           ✓ GET — unified activity feed (ticket + lead)
│   │   ├── activity/route.ts             ✓ GET/POST — per-contact activity log
│   │   ├── dashboard/kpis/route.ts       ✓ GET — role-scoped KPI data
│   │   ├── lookups/
│   │   │   ├── route.ts                  ✓ GET — active dropdown options by category
│   │   │   └── products/route.ts         ✓ GET — product catalog (types + materials)
│   │   ├── sidebar-counts/route.ts       ✓ GET — sidebar badge counts (`?routes=` for role-scoped subset)
│   │   └── admin/
│   │       ├── users/route.ts            ✓ GET all users
│   │       ├── users/create/route.ts     ✓ POST create user
│   │       ├── users/[id]/route.ts       ✓ PATCH update/deactivate user
│   │       ├── team/route.ts             ✓ GET team overview for admin dashboard
│   │       ├── roles/route.ts            ✓ GET/POST roles
│   │       ├── roles/[id]/route.ts       ✓ PATCH/DELETE role
│   │       ├── roles/[id]/permissions/   ✓ POST/DELETE role page permissions
│   │       ├── pages/route.ts            ✓ GET navigable pages list
│   │       ├── lookups/route.ts          ✓ GET all lookup values (incl. inactive)
│   │       ├── lookups/[id]/route.ts     ✓ POST create / PATCH update / DELETE lookup value
│   │       ├── company/route.ts          ✓ GET/PATCH company_settings (admin read; write admin-only)
│   │       ├── product-types/route.ts    ✓ GET/POST product types
│   │       ├── product-types/[id]/route.ts          ✓ PATCH/DELETE product type
│   │       ├── product-types/[id]/materials/[matId]/ ✓ POST link / DELETE unlink material
│   │       ├── materials/route.ts        ✓ GET/POST materials
│   │       └── materials/[id]/route.ts   ✓ PATCH/DELETE material
│   ├── globals.css                       ✓ Tailwind v4 + BazaarPrinting CSS tokens
│   ├── layout.tsx                        ✓ Root layout — Inter font, ThemeProvider, GlobalLoadingProvider
│   └── page.tsx                          ✓ Redirects → /dashboard
├── components/                           ✓ Feature-based folders — no loose files at root
│   ├── admin/
│   │   ├── admin-sub-nav.tsx             ✓ Overview / Settings strip
│   │   ├── admin-dashboard.tsx           ✓ Admin-specific dashboard (self-contained)
│   │   ├── dashboard-page.tsx            ✓ Role router (detects role → renders dashboard)
│   │   ├── settings-tab-nav.tsx          ✓ Settings tab pills (users/roles/dropdowns/…)
│   │   ├── users-section.tsx             ✓ User management table + Add/Edit User modals
│   │   ├── roles-section.tsx             ✓ Role list + permission matrix
│   │   ├── dropdowns-section.tsx         ✓ Lookup value manager (all categories)
│   │   ├── products-section.tsx          ✓ Product types + materials + link manager
│   │   ├── company-section.tsx           ✓ Company info with validation
│   │   ├── payment-section.tsx           ✓ Payment remittance info (Wire/ACH/Zelle)
│   │   ├── integrations-section.tsx      ✓ Twilio SMS + Instantly AI live (Stripe/Zelle out of scope)
│   │   ├── activity-log-section.tsx      ✓ Paginated system activity feed
│   │   └── user-activity-section.tsx     ✓ Per-user session KPI cards + history table
│   ├── auth/
│   │   └── otp-input.tsx                 ✓ 6-box OTP input (used in setup-2fa + verify-2fa)
│   ├── crm/
│   │   ├── crm-page.tsx                  ✓ Customer registry with search/sort/filter
│   │   └── customer-profile.tsx          ✓ Full customer profile with history
│   ├── layout/
│   │   ├── sidebar.tsx                   ✓ Collapsible left sidebar (role-aware nav)
│   │   ├── mobile-nav.tsx                ✓ Mobile bottom nav drawer
│   │   ├── theme-provider.tsx            ✓ Light/dark theme + useTheme hook
│   │   ├── global-loading-provider.tsx   ✓ App-wide loading overlay + useGlobalLoading hook
│   │   ├── idle-timer.tsx                ✓ Idle detection → warning modal → auto sign-out
│   │   ├── error-boundary.tsx            ✓ React ErrorBoundary — wraps page content in app layout; "Try again" button
│   │   └── global-event-handlers.tsx     ✓ App-wide window event wiring
│   ├── leads/
│   │   ├── leads-page.tsx                ✓ SDR/Admin lead pipeline (All/Hold/Routed/Rejected/Won) — VerifyDrawer + AddLeadModal loaded via next/dynamic
│   │   ├── verify-drawer.tsx             ✓ SDR lead work drawer (edit + read-only modes)
│   │   └── hold-sub-form.tsx             ✓ Hold reason sub-form (used inside VerifyDrawer)
│   ├── orders/
│   │   ├── orders-page.tsx               ✓ Orders list (All / Pending Payment / In Production / Cancelled)
│   │   ├── payments-page.tsx             ✓ Accountant payment evidence queue
│   │   ├── production-page.tsx           ✓ Legacy — redirects to /orders?tab=in_production
│   │   └── completed-page.tsx            ✓ Completed orders list
│   ├── quotes/
│   │   ├── new-quote-form.tsx            ✓ 4-tab New Quote form (Customer optional); direct quote source on ticket
│   │   ├── quote-detail.tsx              ✓ Quote/Order detail + edit (used at /quotes/[id] + /orders/[id])
│   │   ├── quote-payment-config.tsx      ✓ Payment config panel (strategy, deposit, channels)
│   │   ├── quotes-page.tsx               ✓ Quoted Requests list (All/Draft/Sent/Won/Routed tabs)
│   │   ├── quote-detail/                 ← sub-components split from quote-detail
│   │   │   ├── customer-info-card.tsx    ✓ Left sidebar customer card (lookup labels)
│   │   │   ├── detail-quick-actions.tsx  ✓ Sidebar actions (send, convert, mark complete, …)
│   │   │   ├── detail-layout-primitives.tsx ✓ Stat cards, section titles, spec pills
│   │   │   ├── ticket-stats-row.tsx      ✓ Top stats row on overview layout
│   │   │   ├── history-section.tsx       ✓ Activity timeline tab
│   │   │   └── ticket-skeleton.tsx       ✓ Detail page loading skeleton (quote/order/payment/production/completed)
│   │   └── shared/                       ← shared between new-quote-form + quote-detail
│   │       ├── types.ts                  ✓ ProductType, LookupOption, SkuLookups
│   │       ├── utils.ts                  ✓ emptySkuRow, renderLookupOptions, priorityStyle, quickDate
│   │       ├── info-form.tsx             ✓ Title / Priority / Due Date / Rush section
│   │       ├── sku-row.tsx               ✓ Single SKU line item row
│   │       ├── line-items-form.tsx       ✓ SKU list + Add/Remove controls
│   │       └── quote-form.tsx            ✓ Pricing summary + adjustments + payment config
│   ├── reports/
│   │   ├── reports-page.tsx              ✓ Cash collected, rep scorecards, payment ledger, awaiting collection
│   │   ├── reports-filters-modal.tsx     ✓ Period + custom date range filters
│   │   ├── rep-scorecard-table.tsx       ✓ Sales/SDR scorecard rows
│   │   ├── payment-ledger-section.tsx    ✓ Payment line items in period
│   │   └── awaiting-collection-section.tsx ✓ Live balance-due snapshot
│   ├── sales/
│   │   ├── sales-page.tsx                ✓ Sales pipeline (Pipeline/Hold/Rejected tabs) — SalesDrawer loaded via next/dynamic
│   │   ├── sales-drawer.tsx              ✓ Sales lead work drawer
│   │   ├── sales-dashboard.tsx           ✓ Sales-specific dashboard (self-contained)
│   │   └── sdr-dashboard.tsx             ✓ SDR-specific dashboard (self-contained)
│   ├── print/                            ✓ Print-specific layout components
│   └── ui/
│       ├── status-pill.tsx               ✓ Lead/sales status pill
│       ├── urgency-pill.tsx              ✓ High/Medium/Low/Not Defined pill
│       ├── table-skeleton.tsx            ✓ Shared table shimmer — TableRowsSkeleton (<tr>-based) + TableDivSkeleton (div-based)
│       ├── phone-input.tsx               ✓ Validated phone field with call-action icon
│       ├── email-input.tsx               ✓ Validated email field with mailto-action icon
│       ├── back-button.tsx               ✓ Reusable back navigation button
│       ├── spec-preview.tsx              ✓ Coming-soon placeholder page
│       └── [shadcn primitives]           ✓ button, input, select, dialog, tooltip, etc.
├── lib/
│   ├── supabase/
│   │   ├── client.ts                     ✓ createBrowserClient (PUBLISHABLE_KEY)
│   │   └── admin.ts                      ✓ Service-role client — Route Handlers only. `import "server-only"` prevents accidental client import.
│   ├── auth/
│   │   ├── safe-return-path.ts           ✓ Redirect safety
│   │   ├── resolve-default-home.ts       ✓ Post-login destination
│   │   ├── require-session.ts            ✓ Route Handler auth + MFA (AAL2 / trust cookie)
│   │   ├── session-cache.ts              ✓ 3 s in-process memoization for requireSession()
│   │   ├── require-admin.ts              ✓ Admin role gate (builds on requireSession)
│   │   ├── mfa-required.ts               ✓ Per-user MFA requirement flag
│   │   ├── mfa-trust.ts                  ✓ Trusted-device cookie (server) + sessionStorage bridge (client)
│   │   └── remember-mfa-client.ts        ✓ "Remember this device" flag (sessionStorage only)
│   ├── types/index.ts                    ✓ Shared TypeScript types (Lead, Customer, Activity,
│   │                                       JobTicket, QuoteSku, LookupValue, etc.)
│   └── utils/
│       ├── phone.ts                      ✓ Phone formatting + validation
│       ├── ticket-math.ts               ✓ QuoteSku interface + pricing computation helpers
│       ├── compute-checkout.ts          ✓ Checkout state machine — deposit due, balance, payment status
│       ├── maybe-convert-quote-to-order.ts ✓ Quote → order conversion gate
│       ├── maybe-auto-release-production.ts ✓ Production release when gates pass
│       ├── invoice-payment-summary.ts   ✓ Paid-in-full + evidence-pending helpers
│       ├── order-list-status.ts         ✓ Orders list status_label / status_tone
│       ├── quote-list-status.ts         ✓ Quotes list status badges
│       ├── quote-list-due-now.ts        ✓ Due Now column for quote list
│       ├── manual-convert-meta.ts       ✓ Admin convert banner labels
│       ├── admin-convert-preview.ts     ✓ Admin convert confirmation modal
│       ├── mark-lead-won-on-production.ts ✓ Won credit on production release
│       ├── fetch-production-data.ts     ✓ Shared production list + counts queries
│       ├── fetch-orders-data.ts         ✓ Shared orders list + counts queries
│       ├── fetch-quotes-data.ts         ✓ Shared quotes list + counts queries
│       ├── fetch-payments-data.ts       ✓ Shared payments pending query
│       ├── fetch-completed-data.ts      ✓ Shared completed list + counts queries
│       ├── leads-workspace-query.ts     ✓ Shared leads/sales workspace list + counts
│       ├── sidebar-counts-query.ts      ✓ Role-scoped sidebar badge queries
│       ├── website.ts                   ✓ validateWebsite / normalizeWebsite (scheme optional)
│       ├── scroll-field-into-view.ts    ✓ Scroll invalid form fields into view on validation
│       ├── copy-to-clipboard.ts         ✓ Clipboard helper (Customer Link copy button)
│       ├── db-counts.ts                 ✓ countExact(), scopeJobTicketsQuery(), payment filter constants
│       ├── ticket-list-select.ts        ✓ Slim quote/orders list column definitions
│       ├── lead-list-select.ts          ✓ Slim lead workspace column definitions (reference)
│       ├── fetch-lead.ts                ✓ Client helper — full lead fetch for drawers
│       ├── lead-access.ts               ✓ canReadLead() — GET /api/leads/[id] authorization
│       ├── ticket-access.ts             ✓ canAccessTicket() / canMutateTicket() — ticket GET/PDF/print/PATCH
│       └── email.ts                     ✓ Email utility helpers
├── hooks/
│   └── use-coalesced-refresh.ts          ✓ Debounced mount + realtime refetch for list pages
├── supabase/
│   ├── schema.sql                        ✓ Consolidated DDL + seeds (single file — run on fresh projects)
│   ├── migrations/                       ✓ Incremental deltas (001–080)
│   └── README.md                         ✓ Setup notes
├── docs/                                 ✓ Feature specs + architecture + security.md
├── proxy.ts                              ✓ AAL2 + RBAC session enforcement (returns 503 when SUPABASE_URL missing)
├── next.config.ts                        ✓ compress: true, WebP/AVIF images, HTTP security headers (CSP, X-Frame-Options, etc.)
├── components.json                       ✓ shadcn config — style: base-nova
├── vercel.json                           ✓
├── README.md                             ✓ Local setup, env vars, migrations, dev server
└── .env.local.example                    ✓ Key names template (Stripe vars commented — future)
```

---

## Performance — Scoped List APIs + Page-Data (2026-05-22 / 2026-05-26)

List pages fetch **scoped, slim payloads** — no `quote_skus` JSONB on table views. Full records load only on detail routes or drawer open.

**Initial load (May 2026):** Tabbed list pages prefer **`GET /api/{feature}/page-data`** — one `requireSession()` pass, then parallel list + counts queries. See `docs/api-contract.md`.

| Page | Mount endpoint | Legacy split (realtime refresh) |
|------|----------------|----------------------------------|
| `/quotes` | `GET /api/quotes/page-data` | `GET /api/tickets?kind=quote` + `/api/quotes/counts` |
| `/orders` | `GET /api/orders/page-data` | `GET /api/orders/orders` + `/api/orders/counts` |
| `/payments` | `GET /api/payments/page-data` | `GET /api/payments/pending` |
| `/production` | `GET /api/production/page-data` | `GET /api/production/orders` + `/api/production/counts` |
| `/completed` | `GET /api/completed/page-data` | `GET /api/completed/orders` + `/api/completed/counts` |
| `/leads`, `/sales` | `GET /api/leads/workspace/page-data` or `/api/leads/sales/page-data` | workspace list + counts routes |
| `/crm` | `GET /api/customers` | Slim customer + lead/ticket aggregates |

**Tab/sidebar counts** use parallel SQL `{ count: "exact", head: true }` via `lib/utils/db-counts.ts` and shared `fetch-*-data.ts` helpers.

**Session cache:** `lib/auth/session-cache.ts` memoizes `requireSession()` for ~3 s during burst loads.

**Coalesced refetch:** `hooks/use-coalesced-refresh.ts` on all tabbed list pages — debounces mount + `bazaar:*-changed` so Strict Mode does not double-fetch. **Important:** pass a stable refresh callback (or use the hook's ref pattern); inline callbacks in effect deps caused a leads-page infinite reload loop (fixed May 2026).

**Realtime:** Single sidebar subscription per table → `bazaar:*-changed` window events. Sidebar badge refetch debounced ~300 ms; optional `?routes=` limits count queries to visible nav items.

**Lazy bootstrap (Leads/Sales):** Lookups, product types, and admin user lists load when Add Lead / Reassign / drawer opens — not on page mount.

**Dynamic imports:** Heavy modals and drawers (`VerifyDrawer`, `AddLeadModal`, `SalesDrawer`) are loaded via `next/dynamic` — deferred from the initial page bundle until first interaction.

**Indexes:** `073_performance_indexes.sql` — partial indexes on orders, production, leads.

**Completed:** [performance-optimization.md](./FuturePlan/Performance/performance-optimization.md) (Phase 1–3 core)

**Optional remainder:** [performance-anydoer-roadmap.md](./FuturePlan/Performance/performance-anydoer-roadmap.md) (SWR, pagination, CRM server search)

---

## Customer attribute ownership

Where key customer-facing fields are stored (May 2026):

| Attribute | Stored on | Set from | Notes |
|-----------|-----------|----------|-------|
| **Decision Maker** | `customers.authority` | Add Lead, Verify Drawer, CRM Edit | `'yes'` / `'no'`. Not on quote form. Legacy `leads.authority` deprecated. |
| **Industry** | `customers.industry` | Add Lead, Verify, New Quote upsert, CRM Edit | Admin lookup value; UI shows label |
| **Source (lead)** | `leads.source` | Add Lead, Verify | Per inquiry |
| **Source (direct quote)** | `job_tickets.quote_source` | New Quote Customer tab or CRM Info tab | Requires `from_quote_page: true`; no auto-lead |
| **Website** | `customers.website` | Lead/quote/CRM customer flows | Validated via `lib/utils/website.ts`; optional; user may omit `http(s)://`; stored normalized with `https://` prefix |

**Form validation UX (May 2026):** Add Lead, Verify drawer, Edit Customer, and New Quote scroll invalid fields into view (`lib/utils/scroll-field-into-view.ts`) and show per-field inline errors instead of generic form-level messages.

**Migrations:** `077_quote_source.sql`, `078_customer_authority.sql`, `077_drop_initial_interest.sql`, `078_backfill_staff_cash_payment_recorded.sql` (Reports cash backfill)

---

## Design System

Two official themes — **Light: Navy & Gold** / **Dark: Charcoal & Orange**.

All colors are CSS custom properties defined in `app/globals.css`. **Never hardcode hex values in components** — always use `var(--color-*)`.

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#F8F7F4` | `#18181B` |
| `--color-surface` | `#FFFFFF` | `#27272A` |
| `--color-topbar` | `#1B2B4B` (navy) | `#27272A` |
| `--color-accent` | `#E8C97A` (gold) | `#F97316` (orange) |
| `--color-text-primary` | `#333333` | `#F4F4F5` |
| `--color-text-muted` | `#888888` | `#71717A` |
| `--color-border` | `#E5E7EB` | `#3F3F46` |

See `.cursor/rules/ui-design-system.mdc` for the full token table and component rules.

### Navigation layout
- **Desktop (≥ lg):** Collapsible left sidebar. Expanded `224px`, collapsed `56px`. State saved to `localStorage` key `bazaar-sidebar-collapsed`.
- **Mobile (< lg):** Top bar with hamburger → full-height slide-in drawer.
- Active nav item: `background: var(--color-accent)`, `color: var(--color-btn-primary-text)`.

---

## Vercel Deployment

- **Project:** `bazar-crm-eta.vercel.app`
- **Repo:** `main` branch → auto-deploy on push
- **Framework preset:** Next.js (enforced via `vercel.json`)
- **Node.js:** `>=18.18.0` (set in `package.json` engines)
- **Build command:** `npm run build` (default)
- After adding/changing env vars in Vercel → always **Redeploy** manually

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:3000

# Production build check
npm run build

# DEV ONLY — wipe tickets, payment evidence, and reset Won/Quoted leads for clean testing
# Requires .env.local with SUPABASE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL
npm run reset-test-data
```

## Related documentation

| Doc | Contents |
|-----|----------|
| **`docs/security.md`** | Auth model, browser storage, API vs RLS, Supabase dashboard |
| `docs/rbac.md` | Role × endpoint matrix |
| `docs/api-contract.md` | Full Route Handler reference |
| `docs/schema.md` | Tables, RLS policies, `supabase/schema.sql` |

**Dev note:** If `NEXT_PUBLIC_SUPABASE_URL` is missing in `.env.local`, `proxy.ts` returns a **503** response (fail closed). Previously it skipped auth entirely — that behavior has been removed. Set the variable before running the dev server.

---
