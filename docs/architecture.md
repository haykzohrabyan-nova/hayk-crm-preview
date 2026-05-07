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

Current state (auth scaffold complete) + planned additions:

```
BazarCRM/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              ✓ Centered card wrapper for auth pages
│   │   ├── login/page.tsx          ✓ Email + password sign-in
│   │   ├── setup-2fa/page.tsx      ✓ TOTP enrollment — QR code + manual key
│   │   ├── verify-2fa/page.tsx     ✓ TOTP challenge — 6-box OTP, auto-submits on 6th digit
│   │   ├── change-password/page.tsx   → TO BUILD (forced on first login with temp password)
│   │   ├── forgot-password/page.tsx   → TO BUILD
│   │   └── reset-password/page.tsx    → TO BUILD
│   ├── (app)/
│   │   ├── layout.tsx              ✓ App shell — sidebar + mobile nav (max-width: 1980px)
│   │   ├── dashboard/page.tsx      → TO BUILD (currently stub)
│   │   ├── leads/page.tsx          → TO BUILD (SDR + Admin — tabbed)
│   │   ├── sales/page.tsx          → TO BUILD (Sales + Admin — tabbed)
│   │   ├── crm/page.tsx            → TO BUILD (all roles)
│   │   ├── tickets/page.tsx        → TO BUILD (all roles — tabbed)
│   │   ├── statistics/page.tsx     → TO BUILD (all roles)
│   │   ├── settings/page.tsx       → TO BUILD (currently stub — personal profile)
│   │   └── admin/
│   │       ├── layout.tsx          ✓ Admin-only shell — border-b sub-nav strip + AdminSubNav
│   │       ├── page.tsx            ✓ Overview card grid (4 cards, all clickable, BazarCRM tokens)
│   │       └── settings/
│   │           ├── layout.tsx      ✓ Settings sub-layout — SettingsTabNav above children
│   │           ├── page.tsx        ✓ Redirects /admin/settings → /admin/settings/users
│   │           └── [tab]/page.tsx  ✓ Renders section per tab (users | roles | dropdowns | notifications)
│   ├── api/
│   │   ├── auth/change-password/   ✓ EXISTS
│   │   ├── leads/                  → TO BUILD (Route Handlers)
│   │   ├── contacts/               → TO BUILD
│   │   ├── tickets/                → TO BUILD
│   │   ├── activity/               → TO BUILD
│   │   ├── notifications/          → TO BUILD
│   │   ├── dashboard/              → TO BUILD
│   │   ├── outreach/               → TO BUILD
│   │   └── admin/
│   │       ├── users/route.ts      ✓ EXISTS (GET all users)
│   │       ├── users/create/       ✓ EXISTS (POST create user)
│   │       ├── users/[id]/         ✓ EXISTS (PATCH update user)
│   │       ├── roles/              → TO BUILD (CRUD + permission management)
│   │       └── audit/              → TO BUILD
│   ├── globals.css                 ✓ Tailwind v4 + BazaarPrinting CSS tokens
│   ├── layout.tsx                  ✓ Root layout — Inter font, ThemeProvider, TopLoader
│   └── page.tsx                    ✓ Redirects → /dashboard
├── components/
│   ├── otp-input.tsx               ✓ 6-box OTP input
│   ├── sidebar.tsx                 ✓ Collapsible sidebar — UPDATE for role-aware nav
│   ├── mobile-nav.tsx              ✓ Mobile nav — UPDATE for role-aware nav
│   ├── theme-provider.tsx          ✓ Light/dark theme
│   ├── ui/email-input.tsx          ✓ Validated email field
│   ├── ui/badge.tsx                ✓ Status badge primitive
│   ├── ui/button.tsx               ✓ Button primitive
│   ├── ui/card.tsx                 ✓ Card primitive
│   ├── ui/dialog.tsx               ✓ Modal dialog primitive
│   ├── ui/input.tsx                ✓ Input primitive
│   ├── ui/select.tsx               ✓ Select primitive
│   ├── ui/back-button.tsx          ✓ Back navigation button
│   ├── admin/admin-sub-nav.tsx     ✓ Overview / Settings strip (BazarCRM tokens)
│   ├── admin/settings-tab-nav.tsx  ✓ Horizontal settings tab pills (all tabs clickable)
│   ├── admin/users-section.tsx     ✓ Full user management table + Add User modal
│   ├── verify-drawer.tsx           → TO BUILD
│   ├── sales-drawer.tsx            → TO BUILD
│   ├── order-drawer.tsx            → TO BUILD (ticket builder)
│   ├── contact-crm.tsx             → TO BUILD
│   ├── history-timeline.tsx        → TO BUILD
│   ├── notification-bell.tsx       → TO BUILD
│   ├── outreach-dialog.tsx         → TO BUILD
│   └── period-filter.tsx           → TO BUILD
├── lib/
│   ├── supabase/
│   │   ├── client.ts               ✓ createBrowserClient (PUBLISHABLE_KEY)
│   │   └── admin.ts                ✓ Service-role client — Route Handlers only
│   ├── auth/
│   │   ├── safe-return-path.ts     ✓
│   │   └── resolve-default-home.ts ✓
│   ├── types/
│   │   └── index.ts                → TO BUILD (see docs/types.md)
│   ├── context/
│   │   └── period-filter-context.tsx → TO BUILD
│   ├── services/
│   │   ├── notifications.ts        → TO BUILD
│   │   └── outreach.ts             → TO BUILD (provider-agnostic)
│   ├── utils/
│   │   ├── order-ticket-pdf.ts     → TO BUILD (jspdf export)
│   │   └── stats-date-range.ts     → TO BUILD (period buckets)
│   └── utils.ts                    ✓ cn() helper
├── supabase/
│   └── migrations/                 → TO BUILD (see docs/schema.md)
├── docs/
│   ├── architecture.md             ✓ This file
│   ├── CHANGELOG.md                ✓
│   ├── schema.md                   ✓ Full DB schema + RLS
│   ├── api-contract.md             ✓ All Route Handler specs
│   ├── rbac.md                     ✓ Role matrix + proxy rules
│   ├── navigation.md               ✓ Route tree + sidebar nav
│   ├── types.md                    ✓ TypeScript types reference
│   └── feature-specs/
│       ├── leads-sdr.md            ✓
│       ├── leads-sales.md          ✓
│       ├── crm.md                  ✓
│       ├── tickets.md              ✓
│       ├── activity.md             ✓
│       ├── statistics.md           ✓
│       ├── notifications.md        ✓
│       ├── admin.md                ✓
│       └── dashboard.md            ✓
├── proxy.ts                        ✓ AAL2 session enforcement — EXTEND for RBAC
├── components.json                 ✓ shadcn config — style: base-nova
├── vercel.json                     ✓
├── .env.local                      ✓ Local secrets — gitignored
└── .env.local.example              ✓ Key names template
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
