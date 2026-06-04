# Migrations removed

Incremental SQL files (`077`–`111`) were consolidated into **`../schema.sql`** (Jun 2026).

## Setup

| Scenario | Action |
|----------|--------|
| **New Supabase project** | Run `supabase/schema.sql` once in the SQL Editor (empty `public` schema) |
| **Existing production DB** | Do **not** re-run the full schema. Apply only the DDL deltas you still need (compare live DB to `schema.sql`), or reset a staging project from `schema.sql` |

### Payment evidence OTP portal (Jun 2026)

If `request_payment_evidence_resubmit` fails with a missing-column error on `payment_evidence_otp_expires_at`, run in SQL Editor:

```sql
alter table public.job_tickets
  add column if not exists payment_evidence_resubmit_token text,
  add column if not exists payment_evidence_otp_hash text,
  add column if not exists payment_evidence_otp_expires_at timestamptz;

create unique index if not exists job_tickets_payment_evidence_resubmit_token_key
  on public.job_tickets (payment_evidence_resubmit_token)
  where payment_evidence_resubmit_token is not null;
```

Historical migration filenames remain in `docs/CHANGELOG.md` and feature specs for reference only.
