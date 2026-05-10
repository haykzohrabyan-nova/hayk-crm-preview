# BazaarPrinting CRM — Architecture & Setup

> Internal CRM for BazaarPrinting. Built on Next.js 16 + Supabase (Auth + Postgres) with a proof-of-concept in `sdr-crm-system` as the feature blueprint. See `docs/schema.md`, `docs/api-contract.md`, `docs/rbac.md`, `docs/navigation.md`, and `docs/feature-specs/` for the full production specification.

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
- `proxy.ts` enforces AAL2 on all app routes. Never add `middleware.ts` alongside it — Next.js 16 will fail the build.
- After `mfa.verify()`, always call `refreshSession()` then use `window.location.assign()` (not `router.push`) so the new cookies are sent before `proxy.ts` runs on the next request.
- All redirects go through `lib/auth/safe-return-path.ts` to prevent open redirect attacks.
- Default post-login destination is `/dashboard` via `lib/auth/resolve-default-home.ts` — extend this when RBAC is added.

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
│   │   ├── layout.tsx                    ✓ App shell — sidebar + mobile nav
│   │   ├── dashboard/page.tsx            ✓ Role router → sdr/sales/admin dashboard
│   │   ├── leads/page.tsx                ✓ SDR + Admin lead pipeline (4 tabs)
│   │   ├── sales/page.tsx                ✓ Sales pipeline (3 tabs)
│   │   ├── crm/page.tsx                  ✓ Customer registry + profile expand
│   │   ├── crm/customers/[id]/page.tsx   ✓ Full customer profile page
│   │   ├── notifications/page.tsx        ✓ Notification list
│   │   ├── settings/page.tsx             ✓ Personal profile settings
│   │   └── admin/
│   │       ├── layout.tsx                ✓ Admin-only shell with sub-nav
│   │       ├── page.tsx                  ✓ Overview card grid
│   │       ├── users/page.tsx            ✓ User management table
│   │       └── settings/[tab]/page.tsx   ✓ Users | Roles | Dropdowns | Notifications tabs
│   ├── api/
│   │   ├── auth/change-password/         ✓ POST — password update
│   │   ├── leads/
│   │   │   ├── route.ts                  ✓ (manual create via /api/leads/manual)
│   │   │   ├── manual/route.ts           ✓ POST — manual lead creation with dedup
│   │   │   ├── workspace/route.ts        ✓ GET — SDR/Admin lead queue with filters
│   │   │   ├── workspace/counts/route.ts ✓ GET — tab badge counts
│   │   │   ├── sales-counts/route.ts     ✓ GET — sales tab badge counts
│   │   │   └── [id]/
│   │   │       ├── route.ts              ✓ PATCH — update lead fields
│   │   │       ├── lock/route.ts         ✓ POST — acquire lock + set sdr_id
│   │   │       ├── unlock/route.ts       ✓ POST — release lock
│   │   │       ├── hold/route.ts         ✓ POST — put lead on hold
│   │   │       ├── resume/route.ts       ✓ POST — resume from hold
│   │   │       ├── claim/route.ts        ✓ POST — Sales claim a routed lead
│   │   │       ├── activities/route.ts   ✓ GET — lead activity timeline (newest first, actor joined)
│   │   │       └── reassign/route.ts     ✓ POST — Admin reassign/unassign lead (admin only)
│   │   ├── customers/
│   │   │   ├── route.ts                  ✓ GET — customer list
│   │   │   ├── lookup/route.ts           ✓ GET — phone-based dedup lookup
│   │   │   ├── [id]/route.ts             ✓ GET/PATCH — customer profile
│   │   │   └── [id]/merge/route.ts       ✓ POST — merge duplicate customers
│   │   ├── dashboard/kpis/route.ts       ✓ GET — role-scoped KPI data
│   │   ├── lookups/route.ts              ✓ GET — dropdown option lists
│   │   ├── sidebar-counts/route.ts       ✓ GET — sidebar badge counts
│   │   └── admin/
│   │       ├── users/route.ts            ✓ GET all users
│   │       ├── users/create/route.ts     ✓ POST create user
│   │       ├── users/[id]/route.ts       ✓ PATCH update/deactivate user
│   │       ├── team/route.ts             ✓ GET team overview for admin dashboard
│   │       ├── roles/route.ts            ✓ GET/POST roles
│   │       ├── roles/[id]/route.ts       ✓ PATCH/DELETE role
│   │       ├── roles/[id]/permissions/   ✓ Role page permission management
│   │       └── pages/route.ts            ✓ GET navigable pages list
│   ├── globals.css                       ✓ Tailwind v4 + BazaarPrinting CSS tokens
│   ├── layout.tsx                        ✓ Root layout — Inter font, ThemeProvider
│   └── page.tsx                          ✓ Redirects → /dashboard
├── components/
│   ├── dashboard-page.tsx                ✓ Role router (detects role → renders dashboard)
│   ├── sdr-dashboard.tsx                 ✓ SDR-specific dashboard (self-contained)
│   ├── sales-dashboard.tsx               ✓ Sales-specific dashboard (self-contained)
│   ├── admin-dashboard.tsx               ✓ Admin-specific dashboard (self-contained)
│   ├── leads-page.tsx                    ✓ SDR/Admin lead pipeline
│   ├── sales-page.tsx                    ✓ Sales pipeline
│   ├── verify-drawer.tsx                 ✓ SDR lead work drawer (edit + read-only modes)
│   ├── sales-drawer.tsx                  ✓ Sales lead work drawer
│   ├── crm-page.tsx                      ✓ Customer registry
│   ├── customer-profile.tsx              ✓ Full customer profile with history
│   ├── sidebar.tsx                       ✓ Collapsible left sidebar (role-aware nav)
│   ├── mobile-nav.tsx                    ✓ Mobile bottom nav
│   ├── theme-provider.tsx                ✓ Light/dark theme
│   ├── otp-input.tsx                     ✓ 6-box OTP input
│   ├── ui/
│   │   ├── status-pill.tsx               ✓ Lead/sales status pill
│   │   ├── urgency-pill.tsx              ✓ High/Medium/Low/Not Defined pill
│   │   ├── phone-input.tsx               ✓ Validated phone field
│   │   ├── email-input.tsx               ✓ Validated email field
│   │   └── [shadcn primitives]           ✓ button, input, select, dialog, etc.
│   └── admin/
│       ├── admin-sub-nav.tsx             ✓ Overview / Settings strip
│       ├── settings-tab-nav.tsx          ✓ Settings tab pills
│       └── users-section.tsx             ✓ User management table + Add User modal
├── lib/
│   ├── supabase/
│   │   ├── client.ts                     ✓ createBrowserClient (PUBLISHABLE_KEY)
│   │   └── admin.ts                      ✓ Service-role client — Route Handlers only
│   ├── auth/
│   │   ├── safe-return-path.ts           ✓ Redirect safety
│   │   ├── resolve-default-home.ts       ✓ Post-login destination
│   │   └── require-session.ts            ✓ Route Handler auth helper
│   ├── types/index.ts                    ✓ Shared TypeScript types (Lead, Customer, Activity, etc.)
│   └── utils/
│       └── phone.ts                      ✓ Phone formatting + validation
├── supabase/
│   └── migrations/                       ✓ 033 migrations (001–033, incl. 033_reset_leads_to_pending.sql)
├── docs/                                 ✓ All feature specs + architecture docs
├── proxy.ts                              ✓ AAL2 + RBAC session enforcement
├── components.json                       ✓ shadcn config — style: base-nova
├── vercel.json                           ✓
└── .env.local.example                    ✓ Key names template
```

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
```

**Auth bypass in dev:** If `NEXT_PUBLIC_SUPABASE_URL` is empty in `.env.local`, `proxy.ts` skips all auth checks so you can work on the UI without Supabase credentials.
