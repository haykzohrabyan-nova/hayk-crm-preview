# Supabase database

## Single schema file

All database DDL lives in **`schema.sql`** — one idempotent file for fresh installs.

**New project:** open the Supabase SQL Editor → paste/run `schema.sql`.

**Existing production DB:** do **not** re-run the full file. Apply only the delta you need, or use the Supabase dashboard. The old numbered migrations folder has been removed; `schema.sql` is the canonical source going forward.

## Local test reset

Wipe tickets, leads, customers, and payment evidence (keeps users + settings):

```bash
npm run reset-test-data
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
