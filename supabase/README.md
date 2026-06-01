# Supabase database

## Schema sources

| Source | Use |
|--------|-----|
| **`schema.sql`** | Fresh installs — idempotent full DDL + seeds in Supabase SQL Editor |
| **`migrations/`** | Incremental deltas for **existing** production DBs (currently `077`–`102`) |

**New project:** run `schema.sql` once.

**Existing production DB:** apply only new migration files you have not run yet. Do **not** re-run the full `schema.sql` on a live database. Sales `/quotes` + `/orders` on live DBs: grant via **Admin → Roles** (or already present in `role_permissions`).

## Recent migrations (reference)

| Migration | Purpose |
|-----------|---------|
| `081_grant_sdr_completed_page.sql` | SDR `/quotes`, `/orders`, `/completed` |

## Local test reset

Wipe tickets, leads, customers, and payment evidence (keeps users + settings):

```bash
npm run reset-test-data
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
