# Supabase database

## Single source of truth

**`schema.sql`** — idempotent full DDL + seeds for a **fresh** Supabase project. Run once in the SQL Editor on an empty `public` schema.

Includes: tables, indexes, RLS (through security hardening 096), functions, triggers, views, Realtime, storage buckets, SMS/email template seeds, roles/pages/permissions, lookups, product catalog, `company_settings`.

Excludes: one-time **backfills** (e.g. staff payment activity rows) — those were run on production once and are not needed on new installs.

## Existing production database

Do **not** re-run the full `schema.sql` on a live database with data.

Patch missing objects by running only the relevant `CREATE TABLE` / `ALTER TABLE` / policy blocks copied from `schema.sql`, or rebuild a staging project from the full file.

## Local test reset

```bash
npm run reset-test-data
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

## `migrations/`

The numbered migration files were removed after consolidation. See `migrations/README.md`.
