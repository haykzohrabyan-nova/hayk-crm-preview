-- No unique constraints on phone/email intentionally:
-- Multiple customer profiles may share the same phone or email.
-- The SDR decides which profile to link to a lead during the dedup flow.
create table public.customers (
  id          uuid        primary key default gen_random_uuid(),
  first_name  text,
  last_name   text,
  email       text,
  phone       text,
  company     text,
  industry    text,
  website     text,
  heat_tag    text        check (heat_tag in ('hot', 'warm', 'cold')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
