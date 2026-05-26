-- Remove redundant free-text initial_interest; product interests (interests jsonb) is the source of truth.

alter table public.leads drop column if exists initial_interest;
