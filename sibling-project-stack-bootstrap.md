# Sibling project — stack & bare-minimum setup

Use this when spinning up a **second product** on the same Vercel account with the **same technical stack and auth story** as this repo (Pulse V2), **without** copying Pulse-specific pages or domain logic.

**Related in this repo:** [README.md](README.md) (Stack, App shell, Auth), [V2/auth-invites-mfa-deployment-api-errors.md](V2/auth-invites-mfa-deployment-api-errors.md) (MFA, `proxy.ts`, Vercel env), [Planning/auth-2fa-flow.md](Planning/auth-2fa-flow.md).

---

## Tools & toolchain (this application)

What you actually use day to day for **Pulse V2** / this repo—mirror these on a sibling project if you want the same workflow.

### Local development

| Tool | Role |
|------|------|
| **Node.js** | Runtime (use an **LTS** version compatible with **Next.js 16** and your **Vercel** project settings). |
| **npm** | Package manager — `npm install`, `npm run dev`, `npm run build`, etc. |
| **Git** | Version control; **Vercel** connects to your remote for deploys. |
| **`.env.local`** | Local secrets — copy from **[`env.local.example`](../env.local.example)** (root); never commit real keys. |

### Cloud / hosted services

| Service | Role |
|---------|------|
| **Vercel** | Hosting, **Preview** / Production deployments, **environment variables**, Git-triggered builds. |
| **Supabase** (hosted) | **Postgres**, **Auth** (email/password, **TOTP MFA**, sessions), optional **Storage** (e.g. file buckets), **Dashboard** (SQL Editor, Auth URL config, logs). Optional **custom SMTP** under Authentication for higher auth-email limits—see **[V2/auth-invites-mfa-deployment-api-errors.md](V2/auth-invites-mfa-deployment-api-errors.md)**. |

This repo applies SQL mainly via **Supabase Dashboard → SQL Editor**; incremental workflows can use **`supabase db push`** if you use the **Supabase CLI** linked to the project (**[README.md](README.md)** mentions both).

### `npm` scripts (this repo)

| Script | Command | Purpose |
|--------|---------|---------|
| **`dev`** | `next dev` | Local app at `http://localhost:3000` |
| **`build`** | `next build` | Production bundle |
| **`start`** | `next start` | Run production build locally |
| **`db:sync-bootstrap`** | `bash scripts/concat-supabase-migrations.sh` | Regenerate **`supabase/bootstrap_all.sql`** from numbered migrations (run after adding/changing migration files). |

### UI / component tooling

| Tool | Role |
|------|------|
| **shadcn** (CLI) | **`shadcn`** package + `npx shadcn …` to add/regenerate UI primitives. This repo’s **`components.json`** uses **style `base-nova`**, **React Server Components**, **Lucide**, CSS variables, **`app/globals.css`**. |
| **Lucide** | Icons via **`lucide-react`** (also set in **`components.json`** as `iconLibrary`). |

### Database & SQL workflow

- **`supabase/migrations/*.sql`** — source of truth for schema (ordered by filename).
- **`supabase/bootstrap_all.sql`** — single concatenated file for a **fresh empty** database only (see **[README.md](README.md)** — do not double-apply with migrations on the same project).
- **`supabase/seed/*.sql`** — optional dev/test data (see **`supabase/seed/README.md`**).
- **Bash** — migration concat script; requires a normal Unix shell (macOS/Linux or WSL on Windows).

### IDE / AI assistance (optional)

| Piece | Role |
|-------|------|
| **Cursor** | If you use it: this repo ships **`.cursor/rules/`** and **`AGENTS.md`** to steer contributors and agents; you can recreate a similar setup for the sibling app. |

### CI and linting (this repo)

- **GitHub Actions:** no workflows are checked in under **`.github/`** here; CI is effectively **Vercel’s build** on push.
- **ESLint / Prettier:** not present in root **`package.json`**—add them in a new repo if you want enforced lint/format.

---

## Goals

- **Same product feel:** Next.js App Router on **Vercel**, **Tailwind** + shadcn-style UI; first build out only **`/dashboard`** and **`/settings`** behind auth, with the same **sidebar + mobile nav** pattern as this app (no Pulse business routes).
- **Same auth story:** **Supabase Auth** — email/password + **TOTP MFA** and **AAL2** session flow aligned with this app.
- **Same owner account & 2FA:** Usually means **one Supabase project** shared by both deployments so **users, MFA enrollment, and identity** match. If you create a **second Supabase project**, data is isolated and the same person must **sign up / enroll MFA again** there (same email, different Auth user row).

---

## Runtime & framework

| Piece        | Notes (this repo) |
|-------------|-------------------|
| **Next.js** | **16.x**, App Router. Session gate lives in **`proxy.ts`** (Next “Proxy”), **not** `middleware.ts` — do **not** add both; the build can fail. |
| **React**   | **19.x** (see root `package.json`). |
| **TypeScript** | **5.x**, `strict`, path alias `@/*` → project root. |

---

## UI & styling

| Layer        | Technology |
|-------------|------------|
| **CSS**     | **Tailwind CSS v4** + **`@tailwindcss/postcss`** (`postcss.config.mjs`). |
| **Components** | **shadcn** CLI + **@base-ui/react**; **class-variance-authority**, **clsx**, **tailwind-merge**. |
| **Icons**   | **lucide-react**. |
| **Fonts**   | **`next/font/google`** (this app: Roboto / Roboto Mono — match for visual parity). |
| **Theme**   | Light/dark provider + `localStorage` (use your own storage key in the new app). |
| **Optional** | **nextjs-toploader** (route progress), **react-qr-code** (TOTP enrollment QR), **tw-animate-css**. |

---

## Backend & data

| Piece | Choice |
|-------|--------|
| **BaaS** | **Supabase** — Postgres + Auth. |
| **Browser** | `@supabase/ssr` — `createBrowserClient` with **`NEXT_PUBLIC_SUPABASE_URL`** + **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**. |
| **Server** | `@supabase/supabase-js` + **`SUPABASE_SECRET_KEY`** (service role) — **Route Handlers only**, never the client. |
| **Migrations** | Own `supabase/migrations/*.sql`; for a minimal app, ship only tables you need (e.g. profiles/roles if you mirror RBAC), not Pulse’s full chain. |

---

## Auth & MFA (align with this app)

1. **Login** → if MFA is required, **`/setup-2fa`** and **`/verify-2fa`** (TOTP).
2. After **`mfa.verify`**, **`refreshSession()`** then **full page navigation** (`window.location.assign`) so cookies reflect **AAL2** before **`proxy.ts`** runs (avoid relying on soft client navigation alone).
3. **`proxy.ts`**: server Supabase client from cookies; enforce **AAL2** on protected app routes; exempt auth routes; use safe internal return paths (see **`lib/auth/safe-return-path.ts`**).
4. **Supabase Dashboard:** URL allowlists and MFA settings; **Authentication → URL Configuration** must include the **new** Vercel deployment URL(s).
5. **Emails / links:** set **`NEXT_PUBLIC_APP_URL`** to the canonical origin; configure Supabase **Redirect URLs** for invites/password reset per **[V2/auth-invites-mfa-deployment-api-errors.md](V2/auth-invites-mfa-deployment-api-errors.md)** if you use them.

---

## Vercel (same account)

- New Git repo → new **Vercel project** under the same team/account.
- **Environment variables** (Production / Preview as needed):

  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SECRET_KEY` (server-only)
  - `NEXT_PUBLIC_APP_URL` (canonical site URL)

- Redeploy after env changes. **Common production bug:** missing/wrong **`SUPABASE_SECRET_KEY`** → **500** on API routes using the admin client.

---

## `package.json` baseline (mirror this repo)

**Dependencies (conceptual):** `next` 16.x, `react` / `react-dom` 19.x, `@supabase/ssr`, `@supabase/supabase-js`, `@base-ui/react`, `shadcn`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`; optional `nextjs-toploader`, `react-qr-code`, `tw-animate-css`.

**DevDependencies:** `typescript` 5.x, `tailwindcss` 4.x, `@tailwindcss/postcss`, `@types/node`, `@types/react`, `@types/react-dom`.

**Scripts:** at least `dev`, `build`, `start`.

---

## Bare minimum app shape (no Pulse domain)

**First milestone — two authenticated routes only:** **Dashboard** and **Settings** (everything else can wait).

| Route | Purpose |
|-------|---------|
| **`/dashboard`** | Home surface after login (KPIs, summary, or a simple placeholder). |
| **`/settings`** | App or account settings (forms can be stubs at first). |

**Suggested App Router files (sibling repo):**

- **`app/layout.tsx`** — root layout + theme provider.
- **`app/(auth)/`** — `login` (+ forgot/reset if needed), **`setup-2fa`**, **`verify-2fa`** wired to Supabase MFA.
- **`app/(app)/layout.tsx`** — shell (sidebar + main); nav with **two** links → **`/dashboard`** and **`/settings`**.
- **`app/(app)/dashboard/page.tsx`** — Dashboard page.
- **`app/(app)/settings/page.tsx`** — Settings page.
- **`proxy.ts`** — cookie session + **AAL2** enforcement.
- **`lib/supabase/client.ts`** / **`lib/supabase/admin.ts`** — same split as this repo.
- **`AuthContext`** (or equivalent) — session + profile; you can allow both routes for every signed-in user until you add RBAC.

**Post-login landing:** point **`resolveDefaultHomePath()`** (or equivalent) at **`/dashboard`** so **`?next=`** and MFA completion land somewhere stable.

No job tickets, orders, or Pulse admin modules — only auth shell + these two pages.

---

## One decision up front

| You want | Supabase |
|----------|----------|
| **Identical login + MFA + user rows** across both products | **One Supabase project**; both Vercel apps use the **same** URL + keys (plan RLS/API scope per product). |
| **Isolated database**, same human operator | **Second Supabase project**; separate Auth; re-invite / re-enroll MFA. |
