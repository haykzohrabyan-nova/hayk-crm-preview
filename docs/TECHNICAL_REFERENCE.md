# BazaarPrinting CRM — Technical Reference

> **Purpose:** A complete, standalone technical reference for the BazaarPrinting CRM. Detailed enough for an AI agent or engineer to understand the full system — its data model, business logic, API surface, and UI architecture — and potentially recreate it from scratch.

---

## Table of Contents

1. [Application Overview & Purpose](#1-application-overview--purpose)
2. [Tech Stack](#2-tech-stack)
3. [Folder Structure](#3-folder-structure)
4. [Authentication & Session Management](#4-authentication--session-management)
5. [Role & Permission System (RBAC)](#5-role--permission-system-rbac)
6. [Database Schema](#6-database-schema)
7. [Lead Management — SDR Workspace](#7-lead-management--sdr-workspace)
8. [Sales Pipeline](#8-sales-pipeline)
9. [Dashboards & KPI Metrics](#9-dashboards--kpi-metrics)
10. [Quote & Order Lifecycle](#10-quote--order-lifecycle)
11. [Line Items, Pricing & Attachments](#11-line-items-pricing--attachments)
12. [Quote Creation](#12-quote-creation)
13. [Payment System](#13-payment-system)
14. [Production Workflow](#14-production-workflow)
15. [Completed Orders](#15-completed-orders)
16. [Quote Delivery — Email & SMS](#16-quote-delivery--email--sms)
17. [CRM — Customer Management](#17-crm--customer-management)
18. [Admin Settings](#18-admin-settings)
19. [Public Customer Quote Portal](#19-public-customer-quote-portal)
20. [File Management](#20-file-management)
21. [Real-time Updates](#21-real-time-updates)
22. [Activity Log](#22-activity-log)
23. [PDF Generation](#23-pdf-generation)
24. [UI Design System](#24-ui-design-system)
25. [Sidebar, Navigation & Counts](#25-sidebar-navigation--counts)
26. [Environment Variables](#26-environment-variables)
27. [Key File Index](#27-key-file-index)

---

## 1. Application Overview & Purpose

BazaarPrinting CRM is an internal business operations platform for a large-format printing company. It manages the full lifecycle from initial customer inquiry to completed, paid, shipped order. It is **not** a public e-commerce store — it is a staff-facing CRM with a single public-facing customer portal for reviewing and paying quotes.

### Business roles and what they do

| Role | Primary responsibility |
|------|----------------------|
| **SDR** (Sales Development Rep) | Receives inbound leads, qualifies them, creates quotes, routes to Sales |
| **Sales** | Claims routed leads, manages the sales pipeline, converts quotes to orders |
| **Accountant** | Reviews payment evidence, records payments, manages refunds |
| **Admin** | Full system access, user management, configuration, reports |

### Core operational flow (end-to-end)

```
Inbound lead
    │
    ▼
SDR Workspace (/leads)
  ├── Qualify: verify customer info, interests, urgency
  ├── Create Quote → /quotes/new
  ├── Route → Sales pipeline
  ├── Hold / Follow-up / Reject
    │
    ▼
Sales Pipeline (/sales)
  ├── Claim lead
  ├── Send quote to customer (email / SMS / both)
  ├── Follow up, hold, manage pipeline
    │
    ▼
Customer → Public Portal (/q/[token])
  ├── Review line items and totals
  ├── Confirm price
  ├── Pay (Stripe card / wire / ACH / cash / Zelle / check)
    │
    ▼
Accountant → Payments (/payments)
  ├── Review offline payment evidence (wire, ACH, Zelle, check)
  ├── Confirm received amount → may trigger quote→order + production release
  ├── Review tax-exempt sales permit (separate tab; approve or deny totals)
  (Stripe card payments auto-approve on webhook — no accountant step)
    │
    ▼
Production (/orders?tab=in_production)
  ├── Print job in progress
    │
    ▼
Completed (/completed)
  ├── Mark complete → notify customer (pickup / shipping)
```

---

## 2. Tech Stack

### Framework & runtime

| Technology | Version | Role |
|-----------|---------|------|
| Next.js | `^16.2.4` | App Router, Route Handlers, Proxy (auth gate) |
| React | `^19.2.5` | UI library |
| TypeScript | `~5.9.3` | `strict: true` throughout |
| Node.js | `>=18.18.0` | Runtime |

### Database & auth

| Technology | Version | Role |
|-----------|---------|------|
| Supabase | `@supabase/supabase-js ^2.105.3` | PostgreSQL DB, auth, realtime, storage |
| `@supabase/ssr` | `^0.10.2` | Cookie-based auth for SSR/App Router |

**Three Supabase client variants:**

```ts
// Browser (client components, RLS applies)
lib/supabase/client.ts → createBrowserClient()  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

// Server (Route Handlers, cookie read/write)
lib/supabase/server.ts → createServerSupabase()

// Admin (service role, bypasses RLS — Route Handlers only)
lib/supabase/admin.ts  → createAdminClient()    SUPABASE_SECRET_KEY
```

### UI & styling

| Technology | Purpose |
|-----------|---------|
| Tailwind CSS v4 + `@tailwindcss/postcss` | Utility styling; no `tailwind.config.ts` |
| shadcn (`components.json`, style `base-nova`) | UI primitive components |
| `@base-ui/react` | Low-level accessible primitives |
| `lucide-react` | All icons (only icon library used) |
| Inter (`next/font/google`) | Only font |
| CSS variables (`app/globals.css`) | All color tokens (never hardcoded hex in components) |

### Business integrations

| Service | Library | Purpose |
|---------|---------|---------|
| Stripe | `stripe ^22.2.0` | Card payments, checkout sessions, webhooks, refunds |
| Twilio | `twilio ^6.0.2` | SMS and WhatsApp delivery |
| Instantly.ai | HTTP REST | Transactional email delivery |
| `@react-pdf/renderer` | PDF generation | Server-rendered quote/invoice PDFs |

### Deployment

- **Vercel** — production hosting; every push to `main` triggers a build+deploy
- **Cron:** `vercel.json` configures `GET /api/cron/follow-ups` daily at 14:00 UTC

---

## 3. Folder Structure

```
BazarCRM/
├── app/
│   ├── (app)/                    # Authenticated app shell
│   │   ├── layout.tsx            # Sidebar + MobileNav + IdleTimer wrapper
│   │   ├── dashboard/page.tsx
│   │   ├── leads/page.tsx
│   │   ├── sales/page.tsx
│   │   ├── quotes/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── orders/[id]/page.tsx
│   │   ├── payments/[id]/page.tsx
│   │   ├── completed/[id]/page.tsx
│   │   ├── production/[id]/page.tsx  # Redirects to /orders/[id]
│   │   ├── crm/
│   │   │   ├── page.tsx
│   │   │   └── customers/[id]/page.tsx
│   │   ├── admin/
│   │   │   ├── page.tsx
│   │   │   ├── users/page.tsx
│   │   │   └── settings/[tab]/page.tsx
│   │   ├── reports/, activity-log/, notifications/, overview/, tickets/
│   │   └── profile/, settings/
│   ├── (auth)/                   # Login flows (no sidebar)
│   │   ├── login/page.tsx
│   │   ├── setup-2fa/page.tsx
│   │   ├── verify-2fa/page.tsx
│   │   └── change-password/page.tsx
│   ├── (public)/                 # Customer portal (no auth)
│   │   └── q/[token]/page.tsx
│   └── api/                      # Route Handlers (89+ endpoints)
│       ├── leads/
│       ├── tickets/
│       ├── customers/
│       ├── quotes/, orders/, payments/, completed/, production/
│       ├── crm/, reports/
│       ├── public/quotes/[token]/
│       ├── admin/
│       ├── auth/
│       ├── dashboard/
│       ├── sidebar-counts/
│       ├── payments/stripe/webhook/
│       └── cron/follow-ups/
├── components/
│   ├── leads/                    # SDR workspace UI
│   ├── sales/                    # Sales pipeline + dashboards
│   ├── quotes/
│   │   ├── quote-detail.tsx      # THE shared detail component (quote/order/payment/completed)
│   │   ├── quote-detail/         # Sub-components (overview, quick actions, history, modals)
│   │   └── shared/               # Forms, line items, types
│   ├── orders/                   # Orders, production, completed, payments list pages
│   ├── crm/                      # CRM list + customer profile
│   ├── admin/                    # All admin settings UIs
│   ├── layout/                   # Sidebar, MobileNav, IdleTimer
│   ├── auth/                     # Login, 2FA forms
│   ├── public/                   # Public quote portal components
│   └── ui/                       # shadcn + shared: StatusPill, UrgencyPill, PhoneInput,
│                                 # list-pagination, table-skeleton, mobile-list-card, …
├── lib/
│   ├── supabase/                 # client.ts, server.ts, admin.ts
│   ├── auth/                     # Session, MFA, RBAC, access guards
│   ├── utils/                    # Pure helpers (ticket-math, format, pagination, …)
│   ├── integrations/             # Email (Instantly), SMS (Twilio), templates
│   ├── payments/ / lib/stripe/   # Stripe helpers, refund logic
│   ├── pdf/                      # @react-pdf InvoicePDF component
│   └── security/                 # CSP, rate limiting
├── hooks/
│   ├── use-coalesced-refresh.ts  # Debounced realtime list refresh
│   └── use-ticket-realtime-sync.ts # Ticket detail postgres_changes subscription
├── supabase/
│   ├── schema.sql                # Full consolidated DDL (new project baseline)
│   └── migrations/077–102        # Incremental deltas for existing DBs
├── docs/
│   ├── CHANGELOG.md
│   ├── TECHNICAL_REFERENCE.md    # ← this file
│   ├── api-contract.md
│   ├── schema.md
│   └── rbac.md
├── proxy.ts                      # Next.js 16 session gate (replaces middleware.ts)
├── next.config.ts                # Security headers, CSP
└── vercel.json                   # Cron configuration
```

### Critical architecture rule

**`proxy.ts` is the auth gate — never add `middleware.ts`.** Next.js 16 exports a `proxy` function from the project root. Adding `middleware.ts` alongside it breaks the build. All route protection, MFA enforcement, RBAC, and password-change redirects happen inside `proxy.ts`.

### Page → component pattern

Every authenticated page is a thin server component that imports a "page component" from `components/`:

```tsx
// app/(app)/quotes/page.tsx
import QuotesPage from "@/components/quotes/quotes-page";
export default function Page() { return <QuotesPage />; }
```

The page component is a `"use client"` component with all data fetching, state, and UI.

---

## 4. Authentication & Session Management

### Login flow

1. User submits email + password to `supabase.auth.signInWithPassword()`
2. Optional "Remember this device" → MFA trust cookie (see below)
3. `router.push(safeReturnPath(next) ?? "/dashboard")`
4. **Proxy** runs on every request and enforces additional gates

### Authenticator Assurance Levels (AAL)

Supabase MFA uses TOTP (Time-based One-Time Passwords).

| AAL State | Meaning | Proxy action |
|-----------|---------|-------------|
| `current=aal1`, `next=aal1` | Password only, no TOTP enrolled | Redirect → `/setup-2fa` |
| `current=aal1`, `next=aal2` | TOTP enrolled but not verified this session | Redirect → `/verify-2fa` |
| `current=aal2` | MFA verified this session | Allow access |

**`user_profiles.mfa_required`** — admin can set `false` per user to bypass MFA requirement.

### MFA Setup (`/setup-2fa`)

1. Unenroll any existing factors
2. `supabase.auth.mfa.enroll({ factorType: "totp" })` → get `otpauth://` URI + QR
3. User enters 6-digit code → `challenge` + `verify`
4. **`refreshSession()`** — mandatory to get AAL2 cookie
5. **`window.location.assign(next)`** — full page navigation (not client router) so AAL2 cookies are visible to proxy on next request

### MFA Verify (`/verify-2fa`)

Same challenge/verify/refresh/trust pattern as setup. After verify: `POST /api/auth/session { action: "start" }` logs the session, then full navigation.

### Trusted device (30-day bypass)

After AAL2 verify, if user checked "Remember this device":

- Server stores `{deviceId}.{token}` in httpOnly cookie `bazaar_mfa_trust`
- DB: `mfa_trusted_devices` row with `token_hash` (SHA-256), `expires_at`, `user_id`
- Proxy reads cookie, hashes it, checks DB → grants AAL1→AAL2 bypass for 30 days
- Constants: `MFA_TRUST_DAYS = 30`
- Revoked on sign-out (`DELETE /api/auth/mfa-trust`)

### Proxy gates (in order)

When a logged-in user makes a request, `proxy.ts` checks:

1. **Deactivated user** (`!profile.is_active`) → sign out → `/login?error=deactivated`
2. **Must change password** (`profile.must_change_password`) → `/change-password`
3. **MFA enforcement** — AAL level check (see above)
4. **`/settings` for non-admin** → redirect to `/profile`
5. **Admin-only paths** (`/admin`, `/reports`, `/activity-log`) for non-admin → default home
6. **RBAC** — non-admin, non-universal routes require matching `role_permissions` row

### Default home by role

```ts
resolveDefaultHomePath(roleName):
  "sdr"        → "/leads"
  "sales"      → "/sales"
  "accountant" → "/payments"
  else         → "/dashboard"
```

### API session guard

All Route Handlers call:

```ts
const { userId, roleName, errorResponse } = await requireSession(options?)
if (errorResponse) return errorResponse;
```

- **401** `UNAUTHENTICATED` — no session
- **403** `MFA_SETUP_REQUIRED` / `MFA_VERIFY_REQUIRED` — MFA not complete
- 3-second in-memory cache keyed by cookie hash (`session-cache.ts`)

### Idle timeout

`IdleTimer` component in app layout monitors mouse/keyboard activity. Timeout = `company_settings.session_idle_timeout_minutes` (5–480 min, default 20). On expiry: `POST /api/auth/session { action: "end", reason: "auto" }` + sign out.

---

## 5. Role & Permission System (RBAC)

### Data model

```sql
roles (id, name, display_name, is_system, created_at)
pages (id, route, display_name, icon, section, sort_order)
role_permissions (role_id → roles, page_id → pages)  -- many-to-many
user_profiles (id, role_id, ...)
```

### System roles (seeded, cannot be deleted)

| Role name | Display name | Default home |
|-----------|-------------|-------------|
| `sdr` | SDR | `/leads` |
| `sales` | Sales | `/sales` |
| `admin` | Admin | `/dashboard` |
| `accountant` | Accountant | `/payments` |

Custom roles can be created (admin UI) with any combination of permitted pages (excluding admin-only).

### Seeded page permissions

| Role | Accessible pages |
|------|-----------------|
| `sdr` | `/dashboard`, `/leads`, `/crm`, `/quotes`, `/orders`, `/completed` |
| `sales` | `/dashboard`, `/sales`, `/crm`, `/quotes`, `/orders` |
| `accountant` | `/dashboard`, `/payments`, `/orders`, `/completed` |
| `admin` | All pages |

### Admin-only routes (hard-coded, not grantable)

`/admin`, `/reports`, `/activity-log` and all subpaths. Enforced in `lib/auth/admin-only-pages.ts`, proxy, and all admin route handlers.

### Universal routes (no permission row needed)

`/dashboard`, `/profile` — accessible to all authenticated users.

### Enforcement layers

| Layer | Mechanism |
|-------|----------|
| Page navigation | `proxy.ts` RBAC check on every request |
| API routes | `requirePageAccess(userId, roleName, route)` |
| Object access | `canAccessTicket()`, `canMutateLead()`, etc. |
| DB queries | Supabase RLS policies |

### Key RBAC functions

```ts
requireSession()                 // All APIs: session + MFA
requireAdmin()                   // Admin-only handlers
requirePageAccess(userId, roleName, route)  // Feature APIs
requireTicketDetailPageAccess()  // /quotes/[id] family
requireLeadApiPageAccess()       // /leads or /sales
```

### Ticket access (`lib/utils/ticket-access.ts`)

```ts
canAccessTicket(ticket, userId, roleName)   // read
canMutateTicket(ticket, userId, roleName)   // write (owner | admin)
canPatchTicket(body, ticket, userId, roleName) // field-level
canResendTicketNotifications(ticket, userId, roleName)
isAccountantQuoteWorkflowDenied(roleName)   // accountant cannot create/send quotes
```

---

## 6. Database Schema

> Primary source: `supabase/schema.sql` (consolidated) + `supabase/migrations/077–102` (incremental). Migration 093 (`ticket_shipping_destinations`) is not yet merged into `schema.sql` — apply separately.

### RBAC & users tables

**`roles`**
```
id uuid PK
name text UNIQUE          -- slug: "sdr", "sales", "admin", "accountant"
display_name text
is_system boolean         -- system roles cannot be deleted
created_at timestamptz
```

**`pages`**
```
id uuid PK
route text UNIQUE         -- e.g. "/leads", "/quotes"
display_name text
icon text                 -- Lucide icon name string
section text              -- "main" | "admin" | "admin-sub"
sort_order int
```

**`role_permissions`**
```
role_id uuid → roles
page_id uuid → pages
PRIMARY KEY (role_id, page_id)
```

**`user_profiles`**
```
id uuid PK = auth.users.id
role_id uuid → roles
full_name text
avatar_url text
is_active boolean         -- deactivated = no login
must_change_password boolean
mfa_required boolean      -- default true; admin can set false
dashboard_values_hidden boolean  -- user can hide KPI dollar values
created_at, updated_at timestamptz
```

**`user_profiles_with_role`** (view) — profile + `role_name`, `role_display_name`, `role_is_system`

**`mfa_trusted_devices`**
```
id uuid PK
user_id uuid → auth.users
token_hash text           -- SHA-256 of cookie token
expires_at timestamptz
created_at, last_used_at timestamptz
```
RLS enabled, no client policies — service role only.

**`user_sessions`**
```
id uuid PK
user_id uuid → auth.users
signed_in_at timestamptz
signed_out_at timestamptz
sign_out_reason text      -- "manual" | "auto" | "deactivated" | "unknown"
```

### CRM tables

**`customers`**
```
id uuid PK
first_name text
last_name text
email text
phone text                -- stored digits-only via digitsOnly()
company text
industry text             -- lookup slug from lookup_values category "industry"
website text
authority text            -- "yes" | "no" | null (normalizeAuthority())
heat_tag text             -- "hot" | "warm" | "cold" | null
created_at, updated_at timestamptz
```
No unique constraint on phone/email — dedup handled at lead-link time.

**`leads`**
```
id uuid PK
customer_id uuid → customers
source text               -- lookup slug (category: "source")
brand text
status text               -- LeadStatus (see §7)
sales_status text         -- SalesStatus (see §8)
is_inbox boolean          -- true = AI inbox; false = SDR workspace

-- Assignment
sdr_id uuid → user_profiles        -- credited SDR
assigned_sdr_id uuid → user_profiles
sales_owner_id uuid → user_profiles -- claimed sales rep
held_by_id uuid → user_profiles
follow_up_by_id uuid → user_profiles
locked_by_id uuid → user_profiles   -- soft lock while in drawer

-- State timestamps
locked_at timestamptz
held_at timestamptz
follow_up_at timestamptz

-- Hold / follow-up details
hold_reason text
hold_notes text
hold_until timestamptz
follow_up_reason text
follow_up_notes text
follow_up_until timestamptz

-- Restore targets
prev_status text
prev_sales_status text

-- Lead info
urgency text              -- "High" | "Medium" | "Low" | null
interests jsonb           -- product interest map
quantities jsonb
has_design jsonb
is_returning_customer boolean
quote_total numeric
quote_channel text
quote_destination text
sdr_comment text
sales_notes text

-- Rejection
rejection_reason text
rejection_notes text

created_at, updated_at timestamptz
```

**`activities`**
```
id uuid PK
customer_id uuid → customers
lead_id uuid → leads
ticket_id uuid → job_tickets
type text                 -- ActivityType enum
channel text              -- optional outreach channel
by_user_id uuid → user_profiles
payload jsonb             -- type-specific data
created_at timestamptz
```
RLS: authenticated read/insert; append-only (no update/delete).

**`notifications`**
```
id uuid PK
user_id uuid → user_profiles
type text
title text
body text
read boolean
payload jsonb
created_at timestamptz
```
RLS: own rows only.

### Ticket (quote/order) tables

**`job_tickets`** — the central entity for all quotes and orders
```
id uuid PK
reference_code text       -- "QUO-YYYY-NNNN" | "ORD-YYYY-NNN"
public_token uuid         -- customer portal URL token
ticket_kind text          -- "quote" | "order"
ticket_status text        -- lifecycle (see §10)
title text

-- Links
customer_id uuid → customers
linked_lead_id uuid → leads
created_by_id uuid → user_profiles
routed_by_id uuid → user_profiles

-- Contact override (can differ from customer record)
contact_first_name text
contact_last_name text
contact_email text
contact_phone text

-- Pricing (denormalized totals)
quote_subtotal numeric
quote_shipping numeric     -- sum of shipping destinations
discount_type text        -- "percent" | "fixed" | null
discount_value numeric
tax_exempt boolean
sales_permit_number text
sales_permit_storage_path text   -- Supabase path in ticket-attachments bucket
sales_permit_file_name text
sales_permit_mime_type text
sales_permit_submitted_at timestamptz   -- migration 106; set on POST sales-permit
sales_permit_reviewed_at timestamptz    -- migration 104; accountant approve/deny stamp
sales_permit_reviewed_by_id uuid FK → user_profiles
sales_permit_reused_from_customer boolean NOT NULL DEFAULT false  -- migration 104
quote_pre_tax_total numeric
quote_tax_rate_percent numeric
quote_tax_amount numeric
quote_final_total numeric

-- Legacy line items JSON (prefer ticket_line_items table)
product_lines jsonb

-- Payment configuration
ticket_payment_strategy text  -- "full" | "partial" | "net"
ticket_deposit_type text      -- "percent" | "fixed"
ticket_deposit_value numeric
ticket_dep_handling text      -- "cash" | "gateway"
ticket_partial_channels text[] -- ["cash","wire","ach","zelle","check","card"]
ticket_full_channels text[]
ticket_require_client_confirm boolean default true
ticket_quote_channel text     -- "sms" | "email" | "both"
ticket_dest_email text
ticket_dest_phone text

-- Payment state
payment_status text           -- "unpaid" | "partial" | "paid"
prepayment_status text
client_confirmed boolean
payment_amount_received numeric
deposit_amount_received numeric
balance_amount_received numeric
payment_evidence_url text
payment_evidence_submitted_at timestamptz
payment_evidence_reviewed_at timestamptz
payment_evidence_receipt_id text

-- Stripe
stripe_checkout_session_id text
stripe_payment_intent_id text
stripe_amount_paid numeric
stripe_currency text

-- Refunds
refund_status text
total_refunded_amount numeric

-- Shipping (legacy single destination)
requires_shipping boolean
ship_to_name text
ship_to_address text
ship_to_city text
ship_to_state text
ship_to_zip text
ship_to_country text

-- Routing (SDR → Sales)
routed_reason text
routed_notes text
ticket_routed_reason text

-- Production
production_released_at timestamptz

-- Cancellation
cancel_reason text
cancel_reason_label text
cancel_notes text
cancelled_at timestamptz

-- Quote delivery
quote_channel text            -- legacy; prefer ticket_quote_channel
quote_destination text        -- legacy

created_at, updated_at timestamptz
```

**`ticket_line_items`**
```
id uuid PK
ticket_id uuid → job_tickets
sort_order int
product_type text
material text
lamination text
color_mode text
sides text
roll_direction text
width numeric
height numeric
quantity numeric
unit_price numeric
line_total numeric            -- overrides qty × unit_price when set
description text              -- auto: "product – material – lamination"
comment text
design_required boolean
die_cut boolean
spot_uv boolean
foil boolean
perforation boolean
created_at timestamptz
```

**`ticket_line_variants`** — "Additional SKUs" per line
```
id uuid PK
line_item_id uuid → ticket_line_items
ticket_id uuid → job_tickets  -- denormalized for RLS
sort_order int
name text                     -- required; display name for this SKU
quantity numeric              -- required > 0
created_at timestamptz
```

**`ticket_files`**
```
id uuid PK
ticket_id uuid → job_tickets
line_item_id uuid → ticket_line_items  -- nullable
variant_id uuid → ticket_line_variants -- nullable; unique (one file per variant)
storage_path text             -- path in "ticket-attachments" Supabase bucket
file_name text
mime_type text                -- image/jpeg, image/png, image/webp, application/pdf
byte_size bigint
uploaded_by_id uuid → user_profiles
created_at timestamptz
```

**`ticket_payment_refunds`** (migration 100)
```
id uuid PK
ticket_id uuid → job_tickets
amount numeric
payment_mode text             -- "deposit" | "balance" | "full"
method text                   -- payment method used
source text                   -- "stripe" | "manual"
stripe_refund_id text
reason text
notes text
evidence_path text            -- storage path in "refund-evidence" bucket
refunded_by_id uuid → user_profiles
created_at timestamptz
```

**`ticket_shipping_destinations`** (migration 093)
```
id uuid PK
ticket_id uuid → job_tickets
sort_order int
shipping_amount numeric
ship_to_name text
ship_to_address text
ship_to_city text
ship_to_state text
ship_to_zip text
ship_to_country text
created_at, updated_at timestamptz
```
RLS enabled, no client policies — API/service role only. `job_tickets.quote_shipping` = sum of all destination `shipping_amount` values.

### Catalog & configuration tables

**`lookup_values`**
```
category text             -- e.g. "source", "industry", "hold_reason", "reject_reason",
                          --      "lamination", "cancel_reason", "refund_reason", etc.
value text                -- slug (generated from label)
label text                -- display text
sort_order int
is_active boolean
PRIMARY KEY (category, value)
```

**`product_types`**
```
id text PK               -- slug e.g. "stickers", "banners"
name text
default_print_type text  -- "Roll" | "Sheet"
facility text
sort_order int
is_active boolean
notes text
```

**`material_groups`**
```
id uuid PK
name text
facility text
sort_order int
is_active boolean
```

**`materials`**
```
id uuid PK
name text
group_id uuid → material_groups
category text
facility text
sort_order int
default_unit text
```

**`product_material_links`**
```
product_type_id text → product_types
material_id uuid → materials
PRIMARY KEY (product_type_id, material_id)
```

**`company_settings`** — single row (`id=1`)
```
id int PK = 1
company_name text
company_email text
company_phone text
company_address text
logo_url text
default_tax_rate numeric    -- percent
high_value_threshold numeric
rush_surcharge_percent numeric
session_idle_timeout_minutes int  -- 5–480, default 20
bank_name text              -- shown on public quote payment panel
bank_account_number text
bank_routing_number text
zelle_phone text
zelle_email text
```

**`sms_templates`** (migration 084)
```
template_key text PK       -- e.g. "quote_sent", "payment_reminder"
body text                  -- with {firstName}, {ref}, {link}, {total} placeholders
updated_at timestamptz
```

**`order_sequence_counters`** / **`quote_sequence_counters`**
```
year int PK
last_number int            -- incremented atomically on each new ticket
```
Generates `ORD-YYYY-NNN` / `QUO-YYYY-NNNN` reference codes.

### Realtime publications

Tables with `REPLICA IDENTITY FULL` for Supabase realtime: `leads`, `activities`, `job_tickets`, `customers`.

---

## 7. Lead Management — SDR Workspace

### Lead status model

Leads have **two independent status axes**:

**`status` (LeadStatus)** — SDR/workspace lifecycle:

| Value | Meaning | Set by |
|-------|---------|--------|
| `Pending` | In workspace pool; unvalidated | Intake / manual create |
| `Validated` | Quote ticket created (no line items) | `POST /api/tickets` |
| `Quoted` | Quote ticket created with line items | `POST /api/tickets` |
| `Routed to Sales` | SDR qualified and routed | SDR PATCH |
| `On Hold` | SDR deferred | `POST /api/leads/[id]/hold` |
| `Follow Up Later` | SDR follow-up scheduled | `POST /api/leads/[id]/follow-up` |
| `Rejected` | Terminal — SDR or sales rejected | PATCH with `status: "Rejected"` |
| `Duplicate` | Dedup/merge path | Merge flow |

**`sales_status` (SalesStatus)** — sales pipeline (only meaningful after routing):

| Value | Meaning | Set by |
|-------|---------|--------|
| `Ongoing` | Actively working | `POST /api/leads/[id]/claim` |
| `Quote Sent` | Quote sent to customer | Ticket `sent` status |
| `Won` | Order in production | `markLinkedLeadWonOnProduction` |
| `Dropped` | Deal dropped | Sales drawer reject |
| `On Hold` | Sales deferred | `POST /hold` with `role: "sales"` |
| `Follow Up Later` | Sales follow-up | `POST /follow-up` with sales role |

**`prev_status` / `prev_sales_status`** — stored before hold/follow-up so `POST /resume` can restore the prior state.

**`is_inbox`** — `false` = SDR workspace; `true` = AI inbox (admin KPI only, not the SDR pool).

### SDR Workspace UI (`/leads`)

Component: `components/leads/leads-page.tsx`

**Tabs and their counts (all loaded in a single `GET /api/leads/workspace/page-data` request):**

| Tab | Filter logic | Count key |
|-----|-------------|----------|
| **All Leads** | `status` in `Pending, Validated`; excludes Won; SDR: unclaimed unless `owner_scope=mine` | `all` |
| **Follow Up Later** | `status = Follow Up Later`, scoped to current user | `follow_up` |
| **On Hold** | `status = On Hold`, scoped to current user | `hold` |
| **Directed to Sales** | Leads with `lead_routed_to_sales` activity; activity-based, not `status` field | `routed` |
| **Rejected** | `status = Rejected`, scoped to current user | `rejected` |
| **Won** | `sales_status = Won` + has `lead_routed_to_sales` activity | `won` |

**Opening a lead:**
1. `POST /api/leads/[id]/lock` → 200 = exclusive lock for this SDR → opens `VerifyDrawer`
2. 409 = another user's lock → read-only mode (shows who locked it)
3. Closing the drawer does NOT auto-unlock — deliberate (SDR keeps attention on lead)
4. Route/reject/resume actions call unlock as part of their logic

**Soft lock model:**
- Lock = `locked_by_id` + `locked_at` on the lead
- SDR lock also sets `sdr_id` (attribution)
- Only lock holder or admin can mutate
- Lock is kept on hold/follow-up (SDR still owns it), cleared on route/reject/resume

### Lead API endpoints

#### `GET /api/leads/workspace/page-data`

Auth: session + `/leads` page access

Query params: `tab`, `search`, `sort` (`created`|`urgency`), `sort_dir`, `limit`, `offset`, `owner_scope` (`all`|`mine`), `user_id` (admin filter), `routed_filter`

Response:
```json
{
  "leads": [...],
  "counts": { "all", "follow_up", "hold", "routed", "rejected", "won" },
  "routedSubCounts": { "all", "awaiting", "in_progress", "quote_sent", "on_hold", "dropped" },
  "pagination": { "total", "limit", "offset", "hasMore" }
}
```

#### `PATCH /api/leads/[id]`

Handles all lead field updates. Key behaviors:
- Strips `id`, `created_at` from body
- 403 if lead is rejected (non-admin), locked by another user, or access denied
- On `status: "Rejected"` → saves `prev_status` from current value
- Logs activities: `lead_edited`, `lead_status_changed`, `lead_routed_to_sales`, `lead_rejected`

**Reject (both SDR and Sales):** No separate reject endpoint. Send `PATCH` with `{ status: "Rejected", rejection_reason, rejection_notes }`. Sales also sends `{ sales_status: null }`.

#### `POST /api/leads/[id]/lock`

Roles: `sdr`, `sales`, `admin`

Sets `locked_by_id`, `locked_at`. SDR also sets `sdr_id`.

Response on conflict: `409 { locked: false, locked_by: { id, full_name } }`

#### `POST /api/leads/[id]/claim`

Roles: `sales`, `admin`; requires `/sales` page access

Sets `sales_owner_id`, `sales_status: "Ongoing"`. 409 if already claimed.

Activity: `lead_sales_claimed`

#### `POST /api/leads/[id]/hold`

Body: `{ hold_reason, hold_notes?, hold_until?, role: "sdr" | "sales" }`

`hold_reason` is required (from `lookup_values` category `hold_reason`).

| Role | Effect |
|------|--------|
| `sdr` | `status → On Hold`, saves `prev_status`, **keeps** `locked_by_id` |
| `sales` | `sales_status → On Hold`, saves `prev_sales_status`, **clears** `locked_by_id` |

Activity: `lead_held` with `{ reason, notes, until, role }`

**Hold reasons:** `awaiting_customer_response`, `awaiting_artwork_files`, `awaiting_payment_confirmation`, `pricing_review_needed`, `vacation_customer_unavailable`, `other`

#### `POST /api/leads/[id]/follow-up`

Body: `{ follow_up_reason, follow_up_notes?, follow_up_until?, role? }`

`role === "sales"` → updates `sales_status: "Follow Up Later"`, clears lock

SDR default → `status: "Follow Up Later"`, sets `sdr_id` attribution

**Follow-up reasons:** `callback_requested`, `awaiting_decision`, `wrong_time_to_reach`, `left_voicemail`, `other` (requires non-empty notes)

Activity: `lead_follow_up_later`

#### `POST /api/leads/[id]/resume`

Body: `{ role: "sdr" | "sales" }` (default `"sdr"`)

Clears all hold + follow-up fields. Restores `status` / `sales_status` from `prev_*` fields (or defaults: `Ongoing` for sales, `Pending` for SDR — never restores to `Validated` manually).

Activity: `lead_resumed` with `{ from: previousStatus }`

#### `POST /api/leads/[id]/reassign`

Admin only. Body: `{ user_id: string | null, role?: "sdr" | "sales" }`

SDR (default): updates `locked_by_id`, `locked_at`, `sdr_id`
Sales: updates `sales_owner_id` only

Activity: `lead_reassigned` with from/to names

#### `POST /api/leads/manual`

Roles: `sdr`, `admin`; requires `/leads` access

Creates a new lead directly (not from intake). Body: `{ phone, first_name, source, industry, ...optionalFields }`

Sets `status: "Pending"`, `is_inbox: false`, `sdr_id: userId` — no lock (open pool)

Activity: `lead_manual_created` with `{ source }`

### SDR VerifyDrawer actions

`components/leads/verify-drawer.tsx`:

| Action | API call | Effect |
|--------|----------|--------|
| Save | `PATCH /api/leads/[id]` | Field updates only |
| Route to Sales | `PATCH` + `status: "Routed to Sales"` + unlock | Moves lead to sales pipeline |
| Hold | `POST /hold` | Removes from current view, keeps in workspace |
| Follow-up | `POST /follow-up` | Schedules for later |
| Resume | `POST /resume` | Restores prior status |
| Reject | `PATCH` + `status: "Rejected"` + unlock | Terminal status |
| Create Quote | `PATCH` to save, then navigate | Opens `/quotes/new?lead_id=` |

---

## 8. Sales Pipeline

### Sales UI (`/sales`)

Component: `components/sales/sales-page.tsx`

**Tabs:**

| Tab | Filter | Count key |
|-----|--------|----------|
| **Pipeline** | `status=Routed to Sales`, `sales_status` in `Ongoing, Quote Sent, null` | `pipeline` |
| **Follow Up** | `sales_status=Follow Up Later`, `sales_owner_id = currentUser` | `follow_up` |
| **On Hold** | `sales_status=On Hold`, scoped to owner | `hold` |
| **Rejected** | `status=Rejected`, `prev_status=Routed to Sales` | `rejected` |

All counts loaded in single `GET /api/leads/sales/page-data` call.

### Sales visibility rules

Pipeline tab shows: leads where `sales_owner_id` is **null** (unclaimed) OR equals the current user (mine). This lets reps see both unowned leads and their own.

**Claim flow:**
1. `POST /api/leads/[id]/claim` → sets `sales_owner_id`, `sales_status: "Ongoing"`
2. Then open `SalesDrawer` (owned leads skip the lock step)

### Sales Drawer

`components/sales/sales-drawer.tsx` — modal for working a sales lead:
- View/edit lead + customer info
- Hold / Follow-up / Resume / Reject
- Navigate to linked quote ticket
- Unlock on close (unless read-only)
- Reject via `PATCH /api/leads/[id]` (same as SDR)

### API

`GET /api/leads/sales/page-data?tab=` → `{ leads, counts: { pipeline, follow_up, hold, rejected } }`

`GET /api/leads/sales-counts` → lightweight `{ counts }` for realtime refresh

---

## 9. Dashboards & KPI Metrics

Both dashboards call `GET /api/dashboard/kpis` with role-specific preset params.

### Date presets

- `today`, `yesterday`, `last_week`, `last_month`, `custom` (+ `date_from`/`date_to`)
- Each period also computes a **prior period** of the same length for `%` change display
- Logic in `lib/utils/sdr-dashboard-date-range.ts`

### SDR Dashboard KPIs

| UI Label | API key | Calculation |
|----------|---------|-------------|
| Closed Order Value | `order_value` | Production-released tickets in range where SDR = current user; excludes routed-to-sales & refunded |
| Paid / Balance | `order_value_breakdown` | `received` / `balance` on those same tickets |
| Qty Claimed Leads | `lead_claimed` | Distinct leads with `lead_claimed` activity by user in period |
| Manually Created | `lead_created` | Count `leads` where `sdr_id = user`, `is_inbox=false`, in range |
| Unclaimed/Pending | `inbox` | **Snapshot** (not period): `Pending|Validated`, `locked_by_id` null |
| Rejected | `rejected` | Distinct leads with `lead_rejected` activity by user |
| Pending Follow-Up | `on_hold` | Distinct leads with `lead_held` activity by user |
| Qty Routed to Sales | `routed_to_sales` | Distinct `lead_routed_to_sales` activities |

### Sales Dashboard KPIs

| UI Label | API key | Calculation |
|----------|---------|-------------|
| Orders (value) | `order_value` | Production-released tickets for this rep in period |
| Received / Balance | breakdown | On production-released tickets |
| Lead Claimed | `lead_claimed` | Distinct `lead_sales_claimed` activities by user |
| Inbox | `inbox` | Snapshot: `Routed to Sales`, `sales_owner_id` null |
| Rejected | `rejected` | Distinct `lead_rejected` by user |
| On Hold | `on_hold` | Distinct `lead_held` by user |

**Privacy:** If `user_profiles.dashboard_values_hidden = true`, dollar metric values are stripped from the response (the user's preference — helps when screen-sharing).

---

## 10. Quote & Order Lifecycle

### Ticket status values

```
draft        → Editable quote; not yet sent to customer
sent         → Quote delivered; public link active; customer can confirm/pay
routed       → SDR routed to Sales (internal); Sales rep will claim and work it
order        → Converted from quote; payment/confirm gates satisfied
in_production → production_released_at set; shop floor is working on it
completed    → Fulfillment done; customer notified
cancelled    → Admin/accountant cancelled; requires cancel_reason
approved     → Legacy/list filter (prefer "sent + client_confirmed" in new flows)
rejected     → Legacy
```

### Happy path status flow

```
draft
  └──[Send quote]──▶ sent
                         └──[Customer confirms + payment gate]──▶ order
                                                                     └──[Auto/manual release]──▶ in_production
                                                                                                     └──[Staff marks done]──▶ completed
```

### Key server-side transitions

#### `maybeConvertQuoteToOrder(ticket)` — `lib/utils/maybe-convert-quote-to-order.ts`

Converts `sent`/`approved` → `order`. Gates:
- `ticket_require_client_confirm` → `client_confirmed` must be true
- Payment gate depends on strategy:
  - `net` → no upfront payment required (auto-pass)
  - `partial` → deposit recorded
  - `full` → fully paid
- On convert: sets `ticket_status: "order"`, `ticket_kind: "order"`, generates `ORD-*` reference code

#### `maybeAutoReleaseProduction(ticket)` — `lib/utils/maybe-auto-release-production.ts`

Releases production if `computeCheckout(...).canReleaseProduction` is true. May convert `sent/approved → order` first. Sets:
- `production_released_at = now()`
- `ticket_status = "in_production"`
- `ticket_kind = "order"`
- Calls `markLinkedLeadWonOnProduction` → `sales_status: "Won"` on linked lead

#### `PATCH /api/tickets/[id]` key operations

| Body field | Behavior |
|-----------|---------|
| `ticket_status: "sent"` | Send quote to customer, schedule follow-up, log `ticket_sent` |
| `claim_ownership: true` | Claim routed quote → `draft`, `created_by_id = userId` |
| `record_payment: true` | Accountant confirms payment; may convert + auto-release production |
| `release_production: true` | Only sets `production_released_at` (no status change alone) |
| `resend_invoice: true` | `sendInvoiceLinkToCustomer` |
| `send_payment_reminder: true` | `sendPaymentReminder` |
| `ticket_status: "order"` (admin) | Manual convert; generates ORD reference |
| `ticket_status: "completed"` | Mark complete from `in_production`; sends order-ready notification |
| `ticket_status: "cancelled"` | Requires `cancel_reason` (+ notes if "other") |
| `acknowledge_outstanding_balance: true` | Admin completing with balance due |

**Locking rules in `order` status:**
- Non-admins can only PATCH payment-related fields (`PAYMENT_ALLOWED_IN_ORDER` set)
- After customer confirmation, reps cannot edit unless admin
- SDR read-only if they routed but Sales claimed

### `QuoteDetail` context prop

The same component (`components/quotes/quote-detail.tsx`) handles all detail pages via a `context` prop:

| Route | `context` | Back destination |
|-------|-----------|-----------------|
| `/quotes/[id]` | `"quote"` | `/quotes` |
| `/orders/[id]` | `"order"` | `/orders` |
| `/payments/[id]` | `"payment"` | `/payments` |
| `/completed/[id]` | `"completed"` | `/completed` |
| `/production/[id]` | Redirects → `/orders/[id]` | — |

**UI differences by context:**

| Aspect | `quote` | `order` | `payment` | `completed` |
|--------|---------|---------|-----------|-------------|
| Overview | Multi-tab edit (draft) or overview sections | Overview | Overview + PaymentDetailOverview | ProductionDetailOverview |
| Totals label | "Quote Total" | "Order Total" | "Order Total" | "Order Total" |
| Line items default | Collapsed | Expanded | Expanded | Expanded |
| Quick actions | Send, resend, admin convert | Mark complete, resend link, refund | Payment review | Read-only |

**Overview component selection** (`TicketDetailOverview`):
1. `context === "payment"` OR evidence pending → `PaymentDetailOverview`
2. `in_production` or `completed` → `ProductionDetailOverview`
3. Otherwise → `QuoteStageOverview`

---

## 11. Line Items, Pricing & Attachments

### Line item data structure

Three relational tables assembled by `fetchTicketLinesBundle` (`lib/utils/ticket-line-items.ts`):

```
job_tickets
  └── ticket_line_items  (one per product line)
        ├── ticket_line_variants  (Additional SKUs — sub-breakdown by name/qty)
        └── ticket_files          (line-level OR variant-level attachment)
```

**File placement rule:**
- **No variants**: file goes on the line item (`line_item_id`)
- **Variants exist**: file goes on each variant (`variant_id`); first variant migration is automatic
- When first variant is added → line-level file moves to that variant
- When first variant is deleted → variant file returns to line level

### Pricing calculation (`lib/utils/ticket-math.ts`)

```
skuLineTotal(sku) = line_total ?? round2(quantity × unit_price)

subtotal          = Σ skuLineTotal(all lines)
subtotalPlusShip  = subtotal + quote_shipping
discount:
  percent → subtotalPlusShip × (discount_value / 100)
  fixed   → min(discount_value, subtotalPlusShip)
pre_tax_total     = subtotalPlusShip - discount
tax_amount        = pre_tax_total × (quote_tax_rate_percent / 100)
                    (0 if tax_exempt = true)
final_total       = pre_tax_total + tax_amount
```

All computed totals are persisted on `job_tickets`: `quote_subtotal`, `quote_pre_tax_total`, `quote_tax_amount`, `quote_final_total`.

### UI components

- **`LineItemsForm`** — wraps edit (`SkuRow` per line) and read-only (`DetailLineItemCard` + `AdditionalSkusOverviewList`) modes
- **`SkuRow`** — one editable line: product type, material, dimensions, quantity, unit price, finishings, file attach
- **`DetailLineItemCard`** — read-only card: name+specs left, price right, optional thumbnail panel on far right (160px wide, fills card height)
- **`AdditionalSkusOverviewList`** — renders variant sub-rows inside the card footer; each variant shows its thumbnail on the right (100px panel)
- **`LineItemFileThumbnail`** — clickable image/PDF preview that opens `LineItemFilePreviewModal`; supports `fill` mode for full-height card panel

### File upload flow

1. User selects file in `LineItemAttachmentControl` (max 10 MB; JPEG/PNG/WebP/PDF)
2. File held in component state as `pendingFile`
3. On ticket save → `uploadPendingLineItemFiles(ticketId, pendingFiles[])` → `POST /api/tickets/[id]/files` (multipart with `variant_id` or `line_item_id`)
4. Server stores in Supabase bucket `ticket-attachments`, inserts `ticket_files` row
5. After upload, staff can view via `GET /api/tickets/[id]/files/[fileId]` (302 → 60s signed URL)

### API payload

Client helper `lineItemsToApiPayload()` converts form state to `LineItemInput[]` for PATCH/POST. `syncTicketLines` on server applies create/update/delete diff against current DB rows.

**Aggregate flags:** `aggregateLineFlags()` sets `design_required` / `die_cut` on `job_tickets` from any line having those flags.

---

## 12. Quote Creation

### New quote form (`/quotes/new`)

Component: `components/quotes/new-quote-form.tsx`

**4-tab wizard:**
1. **Customer** — phone dedup lookup; link existing customer or fill new; skipped when coming from lead or CRM
2. **Info** — title, source, urgency, rush, due date, quote channel (email/SMS/both), destinations
3. **Line Items** — add product lines with specs, pricing, attachments
4. **Quote** — delivery config (payment strategy, deposit %, channels), tax, shipping, send options

Client-side pricing via `computePricing()`. Send readiness via `canSendQuote()` / `getQuoteSendMissingFields()`.

### Shared quote pricing UI (`components/quotes/shared/quote-form.tsx`)

Used on the **Quote** tab of new-quote, on quote detail edit, and read-only inside `TicketOverviewSections`.

**Tax exempt:** When `taxExempt` is enabled, two required fields appear side by side on the Quote tab:

| Field | Storage | Notes |
|-------|---------|-------|
| Sales Permit # | `job_tickets.sales_permit_number` | Text input; saved on ticket create/PATCH |
| Permit File | `sales_permit_storage_path`, `sales_permit_file_name`, `sales_permit_mime_type` | JPEG, PNG, WebP, or PDF (same rules as line attachments); uploaded via dedicated API |

**Edit mode** (`QuoteForm` props): `salesPermitPendingFile` / `setSalesPermitPendingFile` hold the local file before upload; `salesPermitSavedName`, `salesPermitViewHref`, `onClearSavedSalesPermit` for an existing saved file; `salesPermitFileError` for validation.

**Read-only mode:** Shows permit number and a download link (`salesPermitViewHref` → `GET /api/tickets/{ref}/sales-permit`).

### Tax-exempt validation and send gates

`lib/utils/validate-quote-send.ts` — when `taxExempt` is true, `getQuoteSendMissingFields` requires:

- Non-empty **Sales Permit #**
- `hasSalesPermitFile: true` (pending local file on new quote, or saved file on detail — including not cleared)

`new-quote-form.tsx` enforces the same on tab switch, save-as-draft, route-to-sales, and send. **Send** is blocked until both are present.

### Sales permit file upload flow

The permit file is **not** sent in `POST /api/tickets` body. It is uploaded after the ticket row exists:

1. **New quote** (`new-quote-form.tsx`): After successful `POST /api/tickets` and line-item file uploads, if `salesPermitFile` is set → `POST /api/tickets/{reference_code}/sales-permit` (multipart `file`).
2. **Quote detail** (`quote-detail.tsx`): On save, **before** `PATCH /api/tickets/{id}`:
   - Pending file → `POST .../sales-permit` (replace)
   - User cleared saved file with no replacement → `DELETE .../sales-permit`
3. **Overview** (`ticket-overview-sections.tsx`): Passes `ticketRef` so read-only `QuoteForm` can link to the GET endpoint.

Migration: `supabase/migrations/103_sales_permit_file.sql`.

### Tax-exempt accountant approval (migrations 104–106)

**When review is required:** `tax_exempt = true` and `sales_permit_storage_path` is set (`requiresTaxExemptAccountantReview` in `lib/utils/tax-exempt-approval.ts`). **Pending** until `sales_permit_reviewed_at` is set (`isTaxExemptApprovalPending`).

**Legacy tickets (pre–migration 103):** `tax_exempt = true` with `sales_permit_number` but **no** `sales_permit_storage_path` (`isLegacyTaxExemptMissingPermitFile`). These appear on **Payments → Tax-exempt pending** with **File required**; **Confirm** is disabled until staff uploads via **Orders → [ref]** (Quote tab → Permit File, `POST /api/tickets/[id]/sales-permit`). `record_payment` / completion gates use `isTaxExemptApprovalPending` only (file required), so legacy rows are not blocked by `TAX_EXEMPT_APPROVAL_REQUIRED` until a file exists. Public portal does **not** show `tax_exempt_review_pending` without a file.

| Migration | Adds |
|-----------|------|
| `104_tax_exempt_approval.sql` | `sales_permit_reviewed_at`, `sales_permit_reviewed_by_id`, `sales_permit_reused_from_customer` on `job_tickets` |
| `105_customer_tax_exempt_last.sql` | `tax_exempt_last_*` + `tax_exempt_last_source_ticket_id` on `customers` (second FK to `job_tickets` — see embed note below) |
| `106_sales_permit_submitted_at.sql` | `sales_permit_submitted_at` on `job_tickets` (set on permit upload; backfilled for existing files) |

**Customer last permit (105):** On `approve_tax_exempt`, `syncCustomerTaxExemptFromApprovedTicket` copies the approved ticket’s permit metadata to `customers.tax_exempt_last_*`. New quotes can **reuse** via `POST /api/tickets/[id]/sales-permit/reuse-from-customer` (`lib/utils/customer-tax-exempt.ts`).

**Invalidation:** A normal `PATCH` that changes any field in `TAX_EXEMPT_APPROVAL_INVALIDATING_FIELDS` (totals, `tax_exempt`, `sales_permit_number`, etc.) clears `sales_permit_reviewed_at` / `sales_permit_reviewed_by_id` when a prior review existed.

**Accountant actions** (`PATCH /api/tickets/[id]`, `isPaymentStaffRole` only):

| Body flag | Effect |
|-----------|--------|
| `approve_tax_exempt: true` | Sets `sales_permit_reviewed_*`, optional adjusted totals (`quote_final_total` required), syncs customer last permit, activity `ticket_tax_exempt_approved`, `sendTaxExemptApproved` + `ticket_tax_exempt_confirmed_sent`, `notifyPublicQuoteUpdated` |
| `deny_tax_exempt: true` | Sets `tax_exempt: false`, recomputes tax via `computeTotalsIfTaxExemptDenied`, stamps `sales_permit_reviewed_*`, activity `ticket_tax_exempt_denied`, `notifyPublicQuoteUpdated` |

**Gates (blocked while tax-exempt pending):**

- `record_payment: true` → `400` `TAX_EXEMPT_APPROVAL_REQUIRED`
- `ticket_status: "completed"` → same unless admin passes `acknowledge_tax_exempt_unapproved: true` (UI modal)

**Payments UI (`/payments`):** Fourth tab **Tax-exempt pending** — same queue pattern as offline evidence (Submitted column, View file or **Upload file** link for legacy rows, inline Confirm → `ApproveTaxExemptModal`). `fetchPendingTaxExemptOrders` merges file-present rows (ordered by `sales_permit_submitted_at`) with legacy rows (ordered by `created_at`). **Approved** tab merges payment-evidence-approved rows with tax-exempt-reviewed rows (`fetchPaymentsPageData` in `lib/utils/fetch-payments-data.ts`). Detail: `TaxExemptReviewSection` on payment/order contexts (legacy warning + link to order); `context=payment` returns to `/payments` after confirm.

**Staff file access:** `GET /api/tickets/[id]/sales-permit` — **accountant/admin only** (same policy as payment evidence). Sales/SDR use read-only banners on detail; no signed URL.

**Public portal:** `GET /api/public/quotes/[token]` sets `tax_exempt_review_pending` when `tax_exempt`, `sales_permit_storage_path` is set, and `sales_permit_reviewed_at` is null. Customer can still confirm/pay; PDF uses the same rule (`taxExemptReviewPending` on public PDF route). No permit file on portal. Cancelled/refunded documents: `lib/utils/public-invoice-document.ts` (`ticketIsOrderStage`, `customerDocumentBanner`, `shouldHidePricingOnCustomerDocument`, `customerDocumentPaymentSummary`).

**CRM:** `GET /api/crm/customers/[id]/tax-exempt-history` — tickets with `tax_exempt = true` + customer `tax_exempt_last_*` for **See more** modal (`components/crm/customer-tax-exempt-modal.tsx`).

**PostgREST embed (migration 105):** Ticket list/detail queries must use `customer:customers!job_tickets_customer_id_fkey(...)` via `jobTicketCustomerEmbed()` — otherwise `PGRST201` (ambiguous FK). Nested `lead.customer` on `GET /api/tickets/[id]` uses unqualified `customers(...)` only.

**Future (not shipped):** OTP resubmit portal, staff replace on payments tab, internal denial notes — [`docs/FuturePlan/tax-exempt-resubmit-portal/`](./FuturePlan/tax-exempt-resubmit-portal/README.md).

### `POST /api/tickets`

Required: `ticket_kind`, `title`

**Validations:**
- `ticket_status === "routed"` requires `routed_reason`; if "other" requires `routed_notes`
- `due_date` must be after `created_at`
- New customer requires `source`, `industry`
- Line items validated in `syncTicketLines`

**Defaults:** `ticket_status = "draft"`

**Side effects on create:**
1. Customer upsert/match by email or phone digits
2. Lead update if `linked_lead_id` provided (status → `Validated` or `Quoted`)
3. Reference code generation (`QUO-YYYY-NNNN`)
4. `syncTicketLines(ticketId, lineItems)` — create relational line item rows
5. `syncTicketShippingDestinations` — create shipping destination rows
6. Activity `order_ticket_created`
7. If `ticket_status = "sent"`: `sendQuoteToCustomer()` async
8. `maybeAutoRecordCashPayment()`, `maybeAutoReleaseProduction()` for cash-in-person flows

---

## 13. Payment System

### Payment strategies

| Strategy | Meaning | Customer portal behavior |
|----------|---------|------------------------|
| `full` | Full payment upfront | Pay 100% of `quote_final_total` |
| `partial` | Deposit required | Pay deposit first (% or fixed), then balance |
| `net` | Net terms — no upfront | Confirm only; no payment required before production |

### Checkout gate (`lib/utils/compute-checkout.ts`)

Three sequential steps:

```
Step 1 — Quote Confirmed:
  !ticket_require_client_confirm OR client_confirmed

Step 2 — Payment Collected:
  net     → always done
  partial → deposit recorded
  full    → fully paid

Step 3 — Can Release Production:
  step1Done AND step2Done
```

Special cases:
- Cash in-person (full strategy, only `cash` channel) → auto-record payment on create
- Partial cash deposit (`dep_handling = "cash"`) → auto-record deposit on ticket sent

### Invoice payment summary (`lib/utils/invoice-payment-summary.ts`)

```ts
computeInvoicePaymentSummary(ticket) → {
  amountPaid      // recorded so far
  balanceDue      // final_total - amountPaid
  depositPaid     // deposit amount paid
  fullyPaid       // boolean
  evidencePending // submitted but not reviewed
  submittedAmount // pending evidence amount
}
```

`computePublicPaymentDueAmount(ticket)` → deposit first if not paid, then balance.

`isTicketPaidInFull(ticket)` → `payment_status === "paid"` OR `summary.fullyPaid`.

### Payment channels

`ticket_full_channels` / `ticket_partial_channels` — array of accepted payment methods:

| Method | Portal behavior |
|--------|----------------|
| `card` | Stripe Checkout button |
| `wire`, `ach`, `zelle`, `check` | Evidence upload (file + optional receipt ID) |
| `cash` | Cash receipt ID field (auto-records on confirm in some flows) |

### Stripe integration

**`POST /api/public/quotes/[token]/stripe/create-session`**

Creates Stripe Checkout session for `computePublicPaymentDueAmount`. Redirect on success/cancel back to portal with `?stripe=success|cancel`.

**`POST /api/payments/stripe/webhook`**

`checkout.session.completed` → `lib/stripe/apply-checkout-session.ts` (`applyStripeCheckoutSession`):

- Sets `payment_evidence_reviewed_at` immediately (auto-approve — no accountant step for card)
- Updates `payment_amount_received`, `payment_status`, deposit/balance timestamps
- `logTicketPaymentRecorded` activity
- `maybeConvertQuoteToOrder` → `maybeAutoReleaseProduction` (same gates as accountant confirm)
- `sendPaymentConfirmed` to customer (email/SMS, fire-and-forget)
- `notifyPublicQuoteUpdated` for portal refresh

Stripe payments therefore do **not** appear on the Payments **Pending** tab (only offline evidence awaiting review does).

**`POST /api/tickets/[id]/evidence`** — `GET` → signed URL redirect (accountant/admin view only)

### Recording payment (accountant)

`PATCH /api/tickets/[id]` with `{ record_payment: true, payment_amount_received, ... }`:
1. Validates amount
2. Updates `payment_amount_received`, deposit/balance fields
3. Sets `payment_evidence_reviewed_at`
4. Calls `maybeConvertQuoteToOrder` → may convert if gates pass
5. Calls `maybeAutoReleaseProduction` → may release production
6. `sendPaymentConfirmed` if there was pending evidence

### Payments list (`/payments`)

`GET /api/payments/page-data` — accountant/admin only (`lib/utils/fetch-payments-data.ts`)

| Tab | Response key | Filter |
|-----|----------------|--------|
| Pending approval | `orders` | Offline evidence submitted, `payment_evidence_reviewed_at` null — excludes auto-approved Stripe |
| Tax-exempt pending | `taxExemptOrders` | `tax_exempt`, `sales_permit_reviewed_at` null — **with file** (`sales_permit_storage_path` set) **or legacy** (no file, `sales_permit_number` set); merged in `fetchPendingTaxExemptOrders` |
| Approved | `approvedOrders` | Merged: evidence reviewed **or** tax-exempt reviewed (deduped by ticket id, sorted by latest review time) |
| Refunded | `refundedOrders` | `refund_status` partial or full |

`counts`: `{ pending, tax_exempt, approved, refunded }` — badge on every tab.

### Refunds

`POST /api/tickets/[id]/refund` — roles: accountant, admin

Body (multipart): `{ payment_mode: "deposit"|"balance"|"full", amount, method, reason, notes?, evidence? }`

Server:
1. `listRefundablePaymentSlots()` — determines what can be refunded
2. `processStripeRefund()` if original payment was Stripe
3. Optionally stores evidence in `refund-evidence` bucket
4. `applyTicketRefund()` — updates `refund_status`, `total_refunded_amount`, inserts `ticket_payment_refunds` row

---

## 14. Production Workflow

Production = tickets in `ticket_status: "in_production"`.

**List:** `/orders?tab=in_production` via `components/orders/orders-page.tsx`

`/production` route and `/production/[id]` both redirect to `/orders` equivalents (legacy URLs preserved).

### How production is released

Three paths:

1. **Auto-release on payment record** — accountant confirms offline evidence, or Stripe webhook auto-approve → `maybeAutoReleaseProduction` fires
2. **Auto-release on public portal** — customer confirms net-terms quote → server checks gates → releases
3. **Manual staff release** — `PATCH /api/tickets/[id]` with `release_production: true` → sets `production_released_at` only; full status change happens via auto-release logic

**On release:**
- `production_released_at = now()`
- `ticket_status = "in_production"`
- `ticket_kind = "order"` (if not already)
- ORD reference code generated if not yet assigned
- Linked lead → `sales_status: "Won"`

### Orders tabs

`components/orders/orders-page.tsx`:

| Tab | Filter |
|-----|--------|
| All | All non-cancelled orders |
| Pending | `ticket_status = "order"` (converted, not yet in production) |
| In Production | `ticket_status = "in_production"` |
| Cancelled | `ticket_status = "cancelled"` |

### Print document

`GET /api/tickets/[id]/print` — HTML printable version (not a print-shop queue). Renders line items + company info + totals. Shows as Quote for `draft`/`sent`, Invoice for `order`/`in_production`/`completed`.

---

## 15. Completed Orders

**Definition:** Staff manually sets `ticket_status: "completed"` from `in_production` via QuoteDetail quick actions.

**Business rules:**
- **Accountant** — can only complete if `isTicketPaidInFull(ticket)` is true
- **Admin** — can complete with balance due if body includes `acknowledge_outstanding_balance: true`; without it returns `BALANCE_DUE` error code
- On completion → `sendOrderReadyToCustomer()` (pickup/shipping messaging)

**List:** `components/orders/completed-page.tsx` + `GET /api/completed/page-data`

Filter: `ticket_status = "completed"`, excludes refunded tickets, search/date filters, pagination.

**Detail:** `QuoteDetail` with `context="completed"` — shows `ProductionDetailOverview`, payment summary, refund history.

---

## 16. Quote Delivery — Email & SMS

### Channel resolution

`resolveTicketOutreach(ticket, overrides?)` in `lib/integrations/send-quote.ts`:
1. Per-ticket: `ticket_quote_channel` + `ticket_dest_email` / `ticket_dest_phone`
2. Legacy fallback: `quote_channel` + `quote_destination`
3. Override (from ResendQuoteModal): `channelOverride`, `emailOverride`, `phoneOverride`

| Channel value | Transport |
|--------------|----------|
| `email` | Instantly.ai |
| `sms` | Twilio SMS |
| `whatsapp` | Twilio WhatsApp |
| `both` | Email + SMS |
| `in_person` | No send (returns `ok: true`) |

### Email delivery — Instantly.ai

```http
POST https://api.instantly.ai/api/v2/emails/test
Authorization: Bearer INSTANTLY_API_KEY
Body: {
  eaccount: INSTANTLY_SENDING_ACCOUNT,
  to_address_email_list: [{ address, name }],
  subject: "...",
  body: { html: "..." }
}
```

Note: `/emails/test` endpoint is the actual delivery path used (not `/emails/send`).

### SMS delivery — Twilio

```ts
twilio.messages.create({
  from: TWILIO_PHONE_NUMBER,    // or TWILIO_WHATSAPP_FROM for WhatsApp
  to: toE164(phone),            // E.164 format normalization
  body: renderedTemplate
})
```

SMS bodies come from DB (`sms_templates` table, keyed by `template_key`) merged with hardcoded defaults. Placeholders: `{firstName}`, `{ref}`, `{link}`, `{total}`.

### Send functions

| Function | Trigger |
|----------|---------|
| `sendQuoteToCustomer` | `ticket_status = "sent"` (create or PATCH) |
| `sendPaymentReminder` | `PATCH` with `send_payment_reminder: true` |
| `sendInvoiceLinkToCustomer` | `PATCH` with `resend_invoice: true` |
| `sendPaymentConfirmed` | After accountant confirms evidence |
| `sendOrderReadyToCustomer` | `ticket_status = "completed"` |
| `sendQuoteFollowUpReminder` | Cron job (`GET /api/cron/follow-ups`, daily 14:00 UTC) |
| `sendWelcomeEmail` | Admin creates/resets user password |

### Resend Quote Modal

`components/quotes/quote-detail/resend-quote-modal.tsx`

Two modes:
- **`quote`** — opens from "Send Quote" / "Resend Quote" buttons; calls parent `handleSave("sent", channelOverride)` → full quote send flow
- **`invoice`** — opens from "Resend Link" button; PATCH with `{ resend_invoice: true, invoice_channel, invoice_destination }`

Pre-fills current `ticket_dest_email` / `ticket_dest_phone`. Validates email format and phone format. Channel toggle: email / SMS / both.

### Email templates (HTML)

| Template | Purpose |
|---------|---------|
| `quote-email-template.ts` | Initial quote/order send |
| `quote-follow-up-template.ts` | Cron follow-up on unconfirmed quotes |
| `payment-reminder-template.ts` | After customer confirms — pay now |
| `payment-confirmed-template.ts` | Evidence confirmed by accountant |
| `invoice-link-template.ts` | Resend portal link |
| `order-ready-template.ts` | Order complete / pickup |
| `welcome-email-template.ts` | New staff user / password reset |

### SMS template keys

`quote_sent`, `order_sent`, `payment_reminder`, `invoice_link`, `invoice_link_balance`, `order_ready_pickup`, `payment_confirmed`, `payment_confirmed_balance`, `quote_follow_up`

---

## 17. CRM — Customer Management

### CRM list (`/crm`)

Component: `components/crm/crm-page.tsx` + `GET /api/crm/page-data`

Auth: session + `/crm` page permission

**Columns:** Name, Company, Phone, Email, Status, Industry, Leads, Last Activity; actions: View / Add Quote

**Filters:** debounced search (name/email/phone/company); status pills `all | new | known`; heat pills `hot | warm | cold`

**CRM visibility rule:** Only customers that have a qualifying lead (`leadQualifiesForCrm`: sales_status set OR `status = Routed to Sales`) OR any job ticket are shown. Pure unqualified leads are excluded.

**Refresh:** `useListPageData` — `bazaar:customers-changed`, `bazaar:leads-changed`, `bazaar:tickets-changed`; `ListRefreshingNotice` during background sync

### Customer status

| Status | Condition |
|--------|----------|
| `new` | No leads, no tickets |
| `known` | Has ≥1 lead OR ≥1 ticket |
| `returning` | UI badge on profile (3rd state, not in list API) |

### Phone dedup / lookup

`GET /api/customers/lookup?phone=` or `?email=` — exact digits-only match for phone; `ilike` for email.

Used by:
- Add lead modal (`components/leads/add-lead-modal.tsx`) — on phone blur, shows "existing customer" banner
- New quote form — same dedup on customer tab
- `POST /api/tickets` — resolves customer by phone if not explicitly linked

### Merge duplicates

`POST /api/customers/[id]/merge` — body: `{ target_id }`

Roles: admin or (sales + `/crm` access)

1. Moves all `leads` from source → target
2. Moves all `activities` from source → target
3. Logs merge on target (`contact_edited` with `action: "merge"`)
4. **Deletes** source customer row

### Customer profile (`/crm/customers/[id]`)

Full view: customer edit, all leads (with nested tickets), all tickets, shipping address history.

`GET /api/customers/[id]/shipping-addresses` — deduped ship-to lines from `ticket_shipping_destinations` + legacy columns on tickets the user has access to.

### Shipping addresses

**New model:** `ticket_shipping_destinations` — multiple rows per ticket (multi-location orders), ordered by `sort_order`. `job_tickets.quote_shipping` = sum of all destination `shipping_amount` values.

**Legacy model:** `job_tickets.ship_to_*` fields — still populated for backward compatibility, primary destination.

Display helper: `lib/utils/ticket-shipping-destinations.ts`

---

## 18. Admin Settings

Access: `requireAdmin()` on all admin API routes.

**Admin hub:** `app/(app)/admin/page.tsx` → card grid linking to settings tabs

### Settings tabs

| Tab | Path | Manages |
|-----|------|---------|
| Users | `/admin/settings/users` | Create, edit, deactivate staff users |
| Roles & Permissions | `/admin/settings/roles` | Custom roles, page access grants |
| Dropdown Options | `/admin/settings/dropdowns` | `lookup_values` for all form dropdowns |
| Company Info | `/admin/settings/company` | Brand, address, tax rate, session timeout |
| Products | `/admin/settings/products` | Product types, materials, groups, links |
| Integrations | `/admin/settings/integrations` | Test Twilio + Instantly sends |
| SMS Templates | `/admin/settings/sms-templates` | Edit SMS body templates |
| Payment | `/admin/settings/payment` | Bank + Zelle info shown on public portal |

### User management

`POST /api/admin/users/create` — creates Supabase auth user + profile; `must_change_password: true`

`PATCH /api/admin/users/[id]` — update role, active status, name, `mfa_required`, temp password

Guards: cannot self-demote/deactivate, cannot deactivate last admin, cannot disable own MFA

`GET /api/admin/team` — active non-admin users with claimed leads count, last sign-in, role labels

### Role management

`POST /api/admin/roles` — create custom role (name must match `^[a-z0-9_]+$`)

`DELETE /api/admin/roles/[id]` — blocked if `is_system` or users assigned

`POST /api/admin/roles/[id]/permissions` — grant page access; blocked for system roles and admin-only pages

`DELETE /api/admin/roles/[id]/permissions/[pageId]` — revoke page access

### Dropdown options

Category `CATEGORY_META` includes: `source`, `industry`, `urgency`, `hold_reason`, `follow_up_reason`, `reject_reason`, `route_reason`, `lamination`, `cancel_reason`, `refund_reason`, `payment_method`, `color_mode`, `sides`, `roll_direction`, and more.

`GET /api/admin/lookups` / `GET /api/lookups` (public for forms) — filtered by category.

### Product catalog

Product types (`id` = slug), materials (grouped), material links (many-to-many). The line item builder in new quote uses these to populate product type dropdown and filter materials by selection.

### Company settings

Editable by admin: branding, address, `default_tax_rate`, `high_value_threshold`, `rush_surcharge_percent`, `session_idle_timeout_minutes`, bank info, Zelle info.

Non-admin can read subset (tax rate, thresholds) for form calculations.

---

## 19. Public Customer Quote Portal

### Routing

URL: `{APP_URL}/q/{public_token}` — no login required

Page: `app/(public)/q/[token]/page.tsx` (client component, no sidebar)

Token: `job_tickets.public_token` (UUID on ticket creation)

### Data loading

`GET /api/public/quotes/[token]` — rate-limited. Returns:
- Safe ticket fields (no staff notes, no user IDs)
- `tax_exempt_review_pending` — `tax_exempt` + permit file on ticket + not reviewed (banner only; confirm/pay not blocked)
- **Cancelled / refunded display:** full pricing hidden when cancelled; refund-only block when `refund_status` partial/full (`shouldHidePricingOnCustomerDocument`); document label **INVOICE** for `ORD-*` even when `ticket_status = cancelled` (`ticketIsOrderStage`)
- `line_items` (display rows: name, specs, price)
- `shipping_destinations`
- `company_settings` (name, logo, address, bank/Zelle for payment panel)

### Portal phases (`computePortalState`)

The portal shows different UI based on the ticket's current state:

| Phase | Condition | Customer action |
|-------|-----------|----------------|
| `needs_confirm` | Not yet confirmed | Click "I agree to the quote" |
| `needs_payment` | Confirmed, payment due | Pay via selected method |
| `evidence_pending` | Evidence submitted, awaiting review | Wait for accountant |
| `balance_due` | Deposit paid, balance remaining | Pay remaining balance |
| `fully_paid` | All paid, awaiting production | View order status |
| `net_terms` | Net terms strategy | No payment needed, track order |
| `order_ready` | Completed status | Pickup/shipping info |

### Customer actions

**Confirm:** `POST /api/public/quotes/[token]/confirm`
- Sets `client_confirmed: true`
- May `maybeConvertQuoteToOrder` (net terms)
- May `maybeAutoReleaseProduction`
- Broadcasts `updated` event on Supabase channel

**Offline payment:** `POST /api/public/quotes/[token]/submit-payment` (multipart)
- Fields: `method`, `receipt_id` (cash), evidence file (wire/ACH/Zelle/check)
- File stored in `payment-evidence` Supabase bucket
- Sets `payment_evidence_submitted_at`, evidence URL
- Does **not** auto-approve — accountant must review

**Card payment:** `POST /api/public/quotes/[token]/stripe/create-session`
- Creates Stripe Checkout session
- On `?stripe=success` return: webhook runs `applyStripeCheckoutSession` → payment auto-approved, may convert to order and release production; portal refreshes via broadcast

**File preview:** `GET /api/public/quotes/[token]/files/[fileId]`
- Validates token owns the file's ticket
- Streams bytes via admin download (proxy for preview iframe)
- CSP + `X-Frame-Options: SAMEORIGIN`

**PDF download:** `GET /api/public/quotes/[token]/pdf`
- Same rendering as staff PDF, token auth, rate limited
- Shares `public-invoice-document.ts` rules: no tax-exempt-under-review footnote without permit file; no payment-evidence-pending on cancelled/refunded; pricing/refund display aligned with portal

### Realtime updates (public portal)

Uses **Supabase broadcast** (not `postgres_changes` — anonymous users can't access RLS-gated channels):

- **Server side:** `notifyPublicQuoteUpdated(token)` — called after staff saves, payment flows, file uploads
- **Client side:** subscribes to channel `public-quote:{token}`, event `updated` → refetch `GET /api/public/quotes/[token]` immediately (`setTimeout(0)` coalesce only)

This ensures the portal auto-updates when:
- Staff sends the quote (status → `sent`)
- Accountant confirms payment
- Staff marks order complete

---

## 20. File Management

### Storage

- **Bucket name:** `ticket-attachments` (private Supabase Storage)
- **Path patterns:**
  - Line/variant attachments: `{ticketId}/{variantId | line/{lineItemId}}/{uuid}-{sanitizedFileName}`
  - Tax-exempt sales permit: `{ticketId}/sales-permit/{uuid}-{sanitizedFileName}` (columns on `job_tickets`, not `ticket_files`)
- **Size limit:** 10 MB
- **Accepted MIME types:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`

### Staff file API

| Method | Endpoint | Auth | Behavior |
|--------|---------|------|---------|
| POST | `/api/tickets/[id]/files` | `canMutateTicket` | Multipart upload; `variant_id` OR `line_item_id` in form fields; replaces existing file for that scope |
| GET | `/api/tickets/[id]/files/[fileId]` | `canAccessTicket` | 302 redirect to 60-second signed URL |
| DELETE | `/api/tickets/[id]/files/[fileId]` | `canMutateTicket` | Deletes from storage + DB row |
| POST | `/api/tickets/[id]/sales-permit` | `canMutateTicket` | Multipart `file`; replaces prior permit; updates `sales_permit_*` columns |
| GET | `/api/tickets/[id]/sales-permit` | `isPaymentStaffRole` | 302 redirect to 60-second signed URL (accepts reference code or UUID) |
| DELETE | `/api/tickets/[id]/sales-permit` | `canMutateTicket` | Removes storage object + clears `sales_permit_*` columns |

Line/variant file mutations call `notifyPublicQuoteUpdatedByTicketId` to refresh the public portal. Sales permit is staff-only (not shown on the customer portal).

Handler: `app/api/tickets/[id]/sales-permit/route.ts` — uses `validateTicketAttachmentFile` / `ticket-line-files` helpers (same bucket as line attachments).

### Refund evidence

Separate bucket: `refund-evidence`. Uploaded via `POST /api/tickets/[id]/refund` (multipart).

---

## 21. Real-time Updates

### Two-layer approach

**Layer 1 — List pages (window events + Supabase postgres_changes via sidebar):**

The sidebar subscribes to Supabase `postgres_changes` on `leads`, `job_tickets`, `activities`, `customers`. On any change, it dispatches browser window events:

| Event | Source table |
|-------|-------------|
| `bazaar:leads-changed` | `leads` |
| `bazaar:tickets-changed` | `job_tickets` |
| `bazaar:activities-changed` | `activities` |
| `bazaar:customers-changed` | `customers` |
| `bazaar:refresh-counts` | After any mutation (sidebar + action handlers) |

List pages use **`useListPageData`** (`hooks/use-list-page-data.ts` → `useStaleWhileRevalidate`) to subscribe to these events and refetch the active `GET …/page-data` URL.

**Layer 2 — Detail pages:**

- **Initial load:** `Promise.all([getTicketFormBootstrap(), GET /api/tickets/[id]/page-data])` — bootstrap = company + lookups + products (`lib/utils/ticket-form-bootstrap-server-cache.ts`, client cache `lib/client/ticket-form-bootstrap-cache.ts`); page-data = `{ ticket }` only (`lib/utils/fetch-ticket-detail.ts`).
- **Silent refresh:** `GET /api/tickets/[id]` only (no bootstrap).
- **`useTicketRealtimeSync(ticketId, onRefresh)`** — `postgres_changes` on this ticket + `activities` INSERT; also `bazaar:tickets-changed` / `bazaar:activities-changed`. Refetch delay **`REALTIME_REFETCH_MS` (0)**.

**Layer 2b — List row expand (Jun 2026):**

- Rows on ticket list page-data include `line_preview`; `seedLinePreviewFromListRows` after fetch.
- Cache miss: `GET /api/tickets/[id]/line-preview` (`lib/utils/fetch-ticket-line-preview.ts`, batch: `fetch-ticket-line-previews-batch.ts`).

**Layer 3 — Public portal (broadcast channel):**

Admin client broadcasts to `public-quote:{token}` channel; anonymous browser subscribes. Used for portal updates without requiring RLS-gated postgres_changes access.

### `useListPageData` / `useStaleWhileRevalidate` (list pages — Jun 2026)

| Module | Role |
|--------|------|
| `lib/client/list-page-cache.ts` | In-memory cache keyed by `prefix:url` (5 min TTL, max 48 entries) |
| `lib/constants/realtime-refetch.ts` | `REALTIME_REFETCH_MS = 0`, `LIST_NAV_REVALIDATE_MS = 300` |
| `hooks/use-stale-while-revalidate.ts` | SWR logic: per-key cache, in-flight dedupe, one queued follow-up fetch |
| `hooks/use-list-page-data.ts` | Thin wrapper for `GET …/page-data` |
| `lib/client/notify-list-data-changed.ts` | After mutation: optional prefix invalidate + window events |
| `components/ui/mobile-list-card.tsx` | `ListRefreshingNotice` — “Updating” during silent refetch |

**Two refresh paths (do not mix):**

| Trigger | Delay | UX |
|---------|-------|-----|
| Mount / tab switch **with cache hit** | `LIST_NAV_REVALIDATE_MS` (300ms) | Show cached rows immediately; background sync (skipped if realtime already fired) |
| `bazaar:tickets-changed`, `bazaar:leads-changed`, `bazaar:customers-changed`, etc. | **0ms** | Start fetch immediately; cancel pending nav revalidate timer |
| Mount **without cache** | `mountDelay` (~50ms) | Skeleton until first response |

**Tab switch:** `useLayoutEffect` clears in-hook data when `cacheKey` changes so another tab’s rows never flash. List components clear local row state when `pageData` is null.

**In-flight dedupe:** Only one `page-data` request per cache key at a time; burst realtime queues at most one extra silent refetch when the current request finishes.

**Pause while editing:** Leads/Sales pass `enabled: !drawerLead` (Leads read-only drawer: `enabled: !drawerLead || drawerReadOnly`).

### `useCoalescedRefresh` (legacy)

`hooks/use-coalesced-refresh.ts` remains for reference; **tabbed list pages migrated to `useListPageData` (Jun 2026).** Default `eventDelay` is now **0** if used elsewhere.

Table updates when the API returns (network latency still applies). Realtime means **no intentional app delay** before starting the request—not “zero network time.”

---

## 22. Activity Log

### Purpose

Immutable audit trail of every significant action in the system. Used for:
- Verify drawer History tab (lead timeline)
- Quote detail History section (ticket timeline)
- Admin activity log page (global audit)
- Business logic (e.g., routed-to-sales tab eligibility is based on `lead_routed_to_sales` activity, not `status` alone)

### Activity types

**Lead-related:**
`lead_verified`, `lead_manual_created`, `lead_edited`, `lead_claimed`, `lead_status_changed`, `lead_routed_to_sales`, `lead_rejected`, `lead_held`, `lead_follow_up_later`, `lead_resumed`, `lead_merged`, `lead_sales_claimed`, `lead_reassigned`

**Ticket-related:**
`order_ticket_created`, `ticket_sent`, `ticket_client_confirmed`, `ticket_converted`, `order_ticket_status_changed`, `ticket_production_released`, `ticket_payment_reminder_sent`, `ticket_invoice_resent`, `ticket_payment_confirmed_sent`, `ticket_cancelled`, `ticket_payment_recorded`, `contact_edited`

### Read APIs

| Endpoint | Scope |
|----------|-------|
| `GET /api/leads/[id]/activities` | Lead activities, newest first |
| `GET /api/activities?ticket_id=` | Ticket activities |
| `GET /api/activities?ticket_id=&include_linked_lead=true` | Merged ticket + lead activities, oldest→newest |
| `GET /api/admin/activity-log` | Paginated global log (admin only) |

### Display helpers

- `lib/utils/lead-activity-display.ts` — `leadActivityLabel()`, `leadActivityDetailLines()` for verify drawer history
- `lib/utils/ticket-lifecycle-timeline.ts` — `buildTicketLifecycleTimeline()` for visual timeline in QuoteDetail

---

## 23. PDF Generation

### Library

`@react-pdf/renderer` — `lib/pdf/invoice-pdf.tsx` exports `InvoicePDF` React component.

Shares layout logic with public `PublicQuoteDocument` (line items, multi-destination shipping, payment summary, company branding).

### Staff PDF

`GET /api/tickets/[id]/pdf`

Auth: session + ticket detail page access + `canAccessTicket`

Loads: ticket, `company_settings`, line bundle, shipping destinations.

`renderToBuffer(InvoicePDF)` → `application/pdf` response

Filename: `Quote-{ref}.pdf` (draft/sent) or `Invoice-{ref}.pdf` (order/production/completed)

### Public PDF

`GET /api/public/quotes/[token]/pdf`

Same rendering path, token authentication, rate-limited.

---

## 24. UI Design System

> **Full color guide:** [`docs/color-system.md`](./color-system.md) — token list, dark mode, Tailwind bridge, exceptions.

### Color token system

All colors defined as CSS variables in `app/globals.css`. **Never hardcode hex in components.**

**Core tokens:**

| Token | Light | Dark |
|-------|-------|------|
| `--color-bg` | `#FFFFFF` | `#18181B` |
| `--color-surface` | `#FAFAFA` | `#27272A` |
| `--color-topbar` | `#1B2B4B` (navy) | `#27272A` |
| `--color-accent` | `#E8C97A` (gold) | `#F97316` (orange) |
| `--color-accent-dark` | `#C9A84C` | `#FB923C` |
| `--color-text-primary` | `#333333` | `#F4F4F5` |
| `--color-text-muted` | `#666666` | `#71717A` |
| `--color-border` | `#E5E7EB` | `#3F3F46` |
| `--color-badge-bg` | `#EAF0FB` | `#2D1F0E` |
| `--color-badge-text` | `#1B2B4B` | `#FB923C` |
| `--color-row-alt` | `#F8F7F4` | `#27272A` |
| `--color-row-hover` | `#EAF0FB` | `#27272A` |
| `--color-btn-primary-bg` | `#E8C97A` | `#F97316` |
| `--color-btn-primary-text` | `#1B2B4B` | `#FFFFFF` |
| `--color-tab-active` | `#1B2B4B` | `#F97316` |
| `--color-tab-underline` | `#E8C97A` | `#F97316` |
| `--color-tab-inactive` | `#888888` | `#71717A` |

**Semantic token sets** (each has `-bg`, `-text`, `-border`, some have `-text-deep`):
- `--color-danger-*` — red (errors, destructive actions)
- `--color-success-*` — green
- `--color-warning-*` — amber
- `--color-info-*` — blue (banners, known customer)
- `--color-neutral-*` — grey (pending status pills)

### Dark mode

- Toggle `dark` class on `<html>` element
- Persisted in `localStorage` key `bazaar-theme` (`"light"` | `"dark"` | `"system"`)
- `ThemeProvider` reads on load before first render (no flash)
- Sidebar toggle switches between light and dark

### Typography

- **Font:** Inter (Google Fonts via `next/font/google`)
- **Max weight:** 600 (never 700+)
- Table headers: `11px / 500 / uppercase / letter-spacing 0.06em` in `--color-text-muted`
- Page title (h1): `20px / 600`
- Button text: `13px / 500`

### Layout

- Left collapsible sidebar: `224px` expanded, `56px` collapsed
- Sidebar collapse state: `localStorage` key `bazaar-sidebar-collapsed`
- App content: `max-w-[1980px] px-4 lg:px-6 py-6` (effectively full-screen)
- Page roots use `<div className="space-y-5">` (matching `leads-page.tsx` pattern)
- No `max-w-screen-xl` on page-level wrappers — full width
- Detail/form pages: `w-full px-6 py-6`

### Border radius

| Size | Use |
|------|-----|
| `4px` | Badges, chips, status pills |
| `6px` | Buttons, inputs, small cards |
| `10px` | Cards, modals, dropdowns |
| `16px` | Large panels |
| `9999px` | Toggle switches, avatars, round pills |

### Component patterns

**Buttons:**
- Primary CTA: `bg: var(--color-btn-primary-bg)`, `color: var(--color-btn-primary-text)` (gold/orange)
- Verify/navy: `bg: var(--color-btn-verify-bg)`, `color: var(--color-btn-verify-text)`
- Danger: `bg: var(--color-danger)`, white text
- All: `border-radius: 6px`, `padding: 6px 14px`, `font-size: 13px`

**Tables:**
- Min row height: 52px
- Sticky header at `top: 100px`
- Light: odd `#FFFFFF`, even `#F8F7F4`, hover `#EAF0FB`
- Dark: all rows `#1C1C1F`, hover `#27272A`
- Mobile: `hidden lg:block` table + `lg:hidden` card list

**Skeleton loading:**
- Never full-page spinner — always table skeleton
- Light shimmer: `#E5E7EB → #F3F4F6`
- Dark shimmer: `#27272A → #3F3F46`

**Tab badges:**
- All tabs show count badge at all times (not just active tab)
- Counts loaded on mount in single page-data request
- Active tab badge: full `--color-badge-bg` opacity; inactive: 70% opacity blend

**Status/urgency pills:**
- `<StatusPill status={...} />` — all lead/ticket statuses
- `<UrgencyPill urgency={...} />` — High/Medium/Low/Not Defined

**Shared UI components (`components/ui/`):**
`badge`, `button`, `card`, `dialog`, `input`, `select`, `separator`, `tooltip`, `date-picker`, `phone-input`, `email-input`, `status-pill`, `urgency-pill`, `list-pagination`, `table-skeleton`, `mobile-list-card` (+variants), `ticket-list-toolbar`, `dashboard-date-range-filter`, `kpi-help-line`, `back-button`, `spec-preview`, `stripe-evidence-panel`, `open-in-stripe-link`, `linked-lead-card`, `outreach-channel-icons`

### Collapsible detail sections

`DetailCollapsibleSection` from `components/quotes/quote-detail/detail-layout-primitives.tsx` — long optional sections (Timeline, Pricing, Payment settings).

`MoreSectionGroup` — collapses multiple sections under a "More details" toggle button. Sections: Fulfillment, Quote & Pricing, Notes, Payment Summary (collapsed by default; each individually expandable within More).

---

## 25. Sidebar, Navigation & Counts

### Sidebar structure (`components/layout/sidebar.tsx`)

- **Brand:** `BAZAARPRINTING` + `CRM` subtitle in `--color-accent`; collapsed shows `B`
- **Profile card:** avatar initial, name, role; links to `/profile`
- **Nav items:** loaded from `pages` DB table filtered by `role_permissions` (`filterPagesForRole`)
- **Sections:** `main` pages, `admin` section (only `/admin` in sidebar), bottom controls
- **Icons:** Lucide map keyed by `page.icon` string from DB

**Active nav item:** `background: var(--color-accent)`, `color: var(--color-btn-primary-text)`

**Bottom controls:** theme toggle, sign-out (session end + MFA trust revoke), collapse toggle

### Badge counts

`GET /api/sidebar-counts?routes=...` — lightweight counts per route for sidebar badges.

| Route | Count meaning |
|-------|-------------|
| `/leads` | `Pending | Validated` leads (unclaimed) |
| `/sales` | `Routed to Sales` unclaimed |
| `/payments` | Evidence pending |
| `/orders` | `order` status (awaiting production release) |

- Red pill when expanded; dot on icon when collapsed
- Count capped at `99+`
- Refetch debounced on `bazaar:refresh-counts` window event
- Sidebar also dispatches the events from `postgres_changes` subscriptions

### Mobile navigation

`MobileNav` component shown below `lg` breakpoint — same badge/event pattern as sidebar.

---

## 26. Environment Variables

| Variable | Where used | Description |
|----------|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | Supabase anon/publishable key |
| `SUPABASE_SECRET_KEY` | Server (Route Handlers) only | Service role key — bypasses RLS |
| `NEXT_PUBLIC_APP_URL` | Client + server | Canonical origin (e.g. `https://crm.bazaarprinting.com`) |
| `STRIPE_SECRET_KEY` | Server only | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | Server only | Stripe webhook signature verification |
| `TWILIO_ACCOUNT_SID` | Server only | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Server only | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Server only | SMS "from" number |
| `TWILIO_WHATSAPP_FROM` | Server only | WhatsApp "from" number |
| `INSTANTLY_API_KEY` | Server only | Instantly.ai API key |
| `INSTANTLY_SENDING_ACCOUNT` | Server only | Sending account email for Instantly |

---

## 27. Key File Index

### Core business logic (`lib/utils/`)

| File | Purpose |
|------|---------|
| `ticket-math.ts` | `skuLineTotal`, `computePricing` — all pricing calculations |
| `ticket-line-items.ts` | `fetchTicketLinesBundle`, `syncTicketLines`, `lineItemsToApiPayload`, file types |
| `compute-checkout.ts` | `computeCheckout` — 3-step production gate |
| `invoice-payment-summary.ts` | `computeInvoicePaymentSummary`, `isTicketPaidInFull` |
| `maybe-convert-quote-to-order.ts` | Quote → Order conversion logic |
| `maybe-auto-release-production.ts` | Auto-release production logic |
| `ticket-access.ts` | `canAccessTicket`, `canMutateTicket`, `canPatchTicket` |
| `lead-access.ts` | `canReadLead`, `canMutateLead`, `canClaimLead`, `canAcquireLeadLock` |
| `leads-workspace-query.ts` | Complex lead list queries with counts |
| `sdr-dashboard-metrics.ts` | SDR KPI calculations |
| `sales-dashboard-metrics.ts` | Sales KPI calculations |
| `ticket-lifecycle-timeline.ts` | `buildTicketLifecycleTimeline` |
| `lead-activity-display.ts` | `leadActivityLabel`, `leadActivityDetailLines` |
| `lead-routed-pipeline-stage.ts` | Routed lead stage badges |
| `ticket-shipping-destinations.ts` | Multi-destination shipping helpers |
| `format.ts` | `fmtDate`, `relativeTime`, `formatCurrency`, `digitsOnly` |
| `pagination.ts` | Shared pagination helpers |
| `validate-quote-send.ts` | `canSendQuote`, `getQuoteSendMissingFields` (tax-exempt: permit # + `hasSalesPermitFile`) |
| `tax-exempt-approval.ts` | `requiresTaxExemptAccountantReview`, `isTaxExemptApprovalPending`, `isLegacyTaxExemptMissingPermitFile`, `isTaxExemptReviewQueueItem`, `canMarkTicketCompleted`, `computeTotalsIfTaxExemptDenied` |
| `public-invoice-document.ts` | Customer portal/PDF banners, refund-only pricing, `ticketIsOrderStage`, evidence-pending suppression when cancelled/refunded |
| `reference-codes.ts` | `ticketIsOrderStage` / `ticketIsQuoteStage` — `ORD-*` / `QUO-*` authoritative over `ticket_kind` for labels |
| `customer-tax-exempt.ts` | Customer last permit sync, reuse copy to ticket |
| `fetch-payments-data.ts` | Payments page-data: evidence + tax-exempt queues and merged approved list |
| `ticket-list-select.ts` | `jobTicketCustomerEmbed()` — disambiguated customer embed after migration 105 |
| `fetch-crm-data.ts` | CRM list with aggregated lead/ticket counts |

### Stripe (`lib/stripe/`)

| File | Purpose |
|------|---------|
| `apply-checkout-session.ts` | `applyStripeCheckoutSession` — webhook auto-approve, payment totals, convert/release, customer notification |

### Core UI components

| File | Purpose |
|------|---------|
| `components/quotes/quote-detail.tsx` | Shared detail for quote/order/payment/completed |
| `components/quotes/quote-detail/ticket-overview-sections.tsx` | Overview sections (More group) |
| `components/quotes/quote-detail/detail-quick-actions.tsx` | Send, convert, complete, refund buttons |
| `components/quotes/quote-detail/detail-layout-primitives.tsx` | `DetailLineItemCard`, `DetailCollapsibleSection`, `MoreSectionGroup` |
| `components/quotes/quote-detail/resend-quote-modal.tsx` | Send/resend modal with channel selector |
| `components/quotes/shared/line-items-form.tsx` | Line items edit + read-only list |
| `components/quotes/shared/line-item-variants.tsx` | Additional SKUs |
| `components/quotes/shared/line-item-attachment.tsx` | `LineItemFileThumbnail`, `LineItemAttachmentControl` |
| `components/quotes/shared/quote-form.tsx` | Quote tab pricing/tax; sales permit # + file attachment UI |
| `components/quotes/new-quote-form.tsx` | `/quotes/new` 4-tab wizard |
| `app/api/tickets/[id]/sales-permit/route.ts` | Sales permit file GET (accountant/admin) / POST / DELETE |
| `app/api/tickets/[id]/sales-permit/reuse-from-customer/route.ts` | Copy customer last permit onto ticket |
| `app/api/crm/customers/[id]/tax-exempt-history/route.ts` | CRM tax-exempt history for See more modal |
| `components/orders/payments-page.tsx` | Payments tabs including tax-exempt pending |
| `components/orders/approve-tax-exempt-modal.tsx` | Approve/deny totals + optional adjust |
| `components/orders/tax-exempt-review-section.tsx` | Payment/order detail tax-exempt review card |
| `components/crm/customer-tax-exempt-modal.tsx` | CRM customer tax-exempt history |
| `components/leads/verify-drawer.tsx` | SDR lead verification modal |
| `components/sales/sales-drawer.tsx` | Sales pipeline lead modal |
| `components/layout/sidebar.tsx` | Nav, badges, realtime subscriptions |

### Auth & RBAC (`lib/auth/`)

| File | Purpose |
|------|---------|
| `lib/auth/require-session.ts` | `requireSession` — base session guard |
| `lib/auth/require-admin.ts` | `requireAdmin` |
| `lib/auth/require-page-access.ts` | RBAC page access guards |
| `lib/auth/role-checks.ts` | `isAdminRole`, `isPaymentStaffRole` |
| `lib/auth/mfa-trust.ts` | 30-day trusted device logic |
| `lib/auth/safe-return-path.ts` | Safe redirect validation |
| `lib/auth/resolve-default-home.ts` | Role → home page |

### Integrations (`lib/integrations/`)

| File | Purpose |
|------|---------|
| `send-quote.ts` | All send functions + `resolveTicketOutreach` |
| `quote-email-template.ts` | Quote/order email HTML |
| `payment-reminder-template.ts` | Payment reminder email |
| `invoice-link-template.ts` | Invoice resend email |
| `order-ready-template.ts` | Order complete email |
| `welcome-email-template.ts` | Staff welcome/reset email |
| `sms-template-catalog.ts` | SMS template keys + defaults |
| `render-sms-template.ts` | Template placeholder substitution |

### Hooks

| File | Purpose |
|------|---------|
| `hooks/use-list-page-data.ts` | Tabbed list pages — SWR cache + page-data fetch |
| `hooks/use-stale-while-revalidate.ts` | Core list SWR (in-flight dedupe, tab-key reset) |
| `lib/client/list-page-cache.ts` | In-memory list cache (5 min TTL) |
| `lib/client/notify-list-data-changed.ts` | Post-mutation cache clear + window events |
| `lib/constants/realtime-refetch.ts` | `REALTIME_REFETCH_MS`, `LIST_NAV_REVALIDATE_MS` |
| `hooks/use-coalesced-refresh.ts` | Legacy — superseded on list pages (Jun 2026) |
| `hooks/use-ticket-realtime-sync.ts` | Ticket detail postgres_changes (0ms debounce) |

---

*Last updated: 2026-06-02 (list SWR, line_preview bundling, split detail bootstrap, `/api/me`, realtime 0ms, migration 107). Page-load guide: `docs/FuturePlan/Performance/page-loading.md`. Cross-reference `supabase/migrations/` (`103`–`107`) and `docs/api-contract.md`.*
