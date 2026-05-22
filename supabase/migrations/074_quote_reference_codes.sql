-- ─────────────────────────────────────────────────────────────────────────────
-- 074 — Quote reference codes (QUO-YYYY-NNNN)
--
-- Mirrors order_sequence_counters for human-readable quote IDs assigned at
-- creation. Existing quote rows are backfilled in created_at order.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.quote_sequence_counters (
  year        int  primary key,
  last_number int  not null default 0
);

alter table public.quote_sequence_counters enable row level security;

create policy "admin_all_quote_sequence_counters" on public.quote_sequence_counters
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create or replace function public.increment_quote_sequence(p_year int)
returns int
language plpgsql
security definer
as $$
declare
  v_next int;
begin
  insert into public.quote_sequence_counters (year, last_number)
  values (p_year, 1)
  on conflict (year)
  do update set last_number = quote_sequence_counters.last_number + 1
  returning last_number into v_next;

  return v_next;
end;
$$;

-- Backfill quotes that don't yet have a QUO reference
do $$
declare
  r record;
  v_year int;
  v_seq  int;
begin
  for r in
    select id, extract(year from created_at)::int as yr
    from public.job_tickets
    where ticket_kind = 'quote'
      and ticket_status not in ('order', 'in_production', 'completed')
      and (reference_code is null or reference_code not like 'QUO-%')
    order by created_at asc
  loop
    v_year := r.yr;
    v_seq  := public.increment_quote_sequence(v_year);
    update public.job_tickets
    set reference_code = 'QUO-' || v_year || '-' || lpad(v_seq::text, 4, '0')
    where id = r.id;
  end loop;
end;
$$;
