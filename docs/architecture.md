# BazaarPrinting CRM — Architecture & Setup

> Internal CRM for BazaarPrinting. Built as a sibling project to Pulse V2, sharing the same technical stack and Supabase auth story but with its own isolated Supabase project and Vercel deployment.

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
| `SUPABASE_SECRET_KEY` | Server only | Supabase service-role key — never expose to browser |
| `NEXT_PUBLIC_APP_URL` | Browser + Server | Canonical origin (`https://bazar-crm-eta.vercel.app` in prod, `http://localhost:3000` locally) |

Copy `.env.local.example` → `.env.local` and fill in values from **Supabase → Project Settings → API**.

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
Users are created manually in **Supabase → Authentication → Users → Add user → Create new user**. No self-registration.

---

## File Structure

```
BazarCRM/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              # Centered card wrapper for auth pages
│   │   ├── login/page.tsx          # Email + password sign-in
│   │   ├── setup-2fa/page.tsx      # TOTP enrollment — QR code + manual key
│   │   └── verify-2fa/page.tsx     # TOTP challenge — 6-box OTP, auto-submits on 6th digit
│   ├── (app)/
│   │   ├── layout.tsx              # App shell — sidebar (desktop) + mobile nav
│   │   ├── dashboard/page.tsx      # Dashboard (stub)
│   │   └── settings/page.tsx       # Settings (stub)
│   ├── globals.css                 # Tailwind v4 + BazaarPrinting CSS tokens (light + dark)
│   ├── layout.tsx                  # Root layout — Inter font, ThemeProvider, TopLoader
│   └── page.tsx                    # Redirects → /dashboard
├── components/
│   ├── otp-input.tsx               # Reusable 6-box OTP input (auto-advance, paste, backspace)
│   ├── sidebar.tsx                 # Collapsible desktop sidebar (224px ↔ 56px)
│   ├── mobile-nav.tsx              # Mobile top bar + slide-in drawer
│   ├── tab-nav.tsx                 # Horizontal tab nav (unused in current layout)
│   ├── topbar.tsx                  # Top bar component (unused in current layout)
│   └── theme-provider.tsx          # Light/dark theme — localStorage key: bazaar-theme
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # createBrowserClient (PUBLISHABLE_KEY)
│   │   └── admin.ts                # createClient service-role — Route Handlers only
│   ├── auth/
│   │   ├── safe-return-path.ts     # Validates redirect paths (no open redirects)
│   │   └── resolve-default-home.ts # Returns /dashboard — extend for RBAC
│   └── utils.ts                    # cn() helper (clsx + tailwind-merge)
├── docs/                           # Project documentation (this folder)
├── .cursor/rules/
│   ├── stack-conventions.mdc       # Stack rules — always applied to agent sessions
│   └── ui-design-system.mdc       # BazaarPrinting design system — always applied
├── proxy.ts                        # Next.js 16 Proxy — AAL2 session enforcement
├── middleware.ts                   # (deleted) — must not exist alongside proxy.ts
├── components.json                 # shadcn config — style: base-nova
├── vercel.json                     # Sets framework: nextjs for Vercel
├── .env.local                      # Local secrets — gitignored
└── .env.local.example              # Key names template — committed
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
