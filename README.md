# BazaarPrinting CRM

Internal CRM for managing leads, quotes, orders, and payments.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5 strict**
- **Supabase** (Postgres + Auth + Storage + Realtime)
- **Tailwind CSS v4**
- Deployed on **Vercel**

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local` with values from your Supabase project dashboard and third-party accounts. See `.env.local.example` for all required variables.

Required:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase project settings → API
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — anon/public key
- `SUPABASE_SECRET_KEY` — service-role key (server-only, never expose to browser)
- `NEXT_PUBLIC_APP_URL` — your local or production URL

Optional (features degrade gracefully if absent):
- `TWILIO_*` — SMS / WhatsApp outreach
- `INSTANTLY_*` — email outreach
- `CRON_SECRET` — quote follow-up reminders

### 3. Run database schema

In the Supabase SQL Editor, run **`supabase/schema.sql`** once on an empty `public` schema.

For an existing production database, do not re-run the full file — patch only missing objects from `schema.sql` or `supabase/patches/*.sql`. See `supabase/README.md` and `supabase/migrations/README.md`.

### 4. Start the dev server

```bash
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/(app)/          Authenticated CRM pages
app/(auth)/         Login, MFA, password flows
app/(public)/       Customer portals (/q/[token], /evidence/[token] payment resubmit, /permit/[token] tax-exempt resubmit)
app/api/            Route Handlers (server-side only)
components/         Feature UI (leads/, sales/, quotes/, orders/, crm/, admin/, layout/, ui/)
lib/auth/           Session helpers, MFA, RBAC guards
lib/supabase/       Browser client and server-only admin client
lib/utils/          Pure helpers (formatting, ticket math, PDF, etc.)
lib/integrations/   Email (Instantly) and SMS (Twilio) senders; admin-editable templates
docs/               Architecture, API contract, security model, changelog
supabase/           Schema DDL and incremental migrations
```

## Key docs

- Architecture & auth flow: [`docs/architecture.md`](docs/architecture.md)
- Security model: [`docs/security.md`](docs/security.md)
- API contract: [`docs/api-contract.md`](docs/api-contract.md)
- Email & SMS templates (admin): [`docs/email-template-guide.md`](docs/email-template-guide.md)
- Payments & resubmit flows: [`docs/feature-specs/invoice-payment.md`](docs/feature-specs/invoice-payment.md)
- Bulk lead import (admin, JSON): [`docs/feature-specs/lead-import.md`](docs/feature-specs/lead-import.md)
- Changelog: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

Before deploying, run `npm run build` locally and apply any new Supabase DDL patches on the target project.
- UI design system: [`.cursor/rules/ui-design-system.mdc`](.cursor/rules/ui-design-system.mdc)

## Scripts

```bash
npm run dev              # Start development server
npm run build            # Production build
npm run reset-test-data  # Reset test data (requires .env.local)
```
