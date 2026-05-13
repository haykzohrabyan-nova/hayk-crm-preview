-- ─────────────────────────────────────────────────────────────────────────────
-- 046 — increment_order_sequence function
--
-- Atomically increments the order sequence counter for a given year and
-- returns the new sequence number. Used by POST /api/tickets to generate
-- ORD-YYYY-NNN reference codes.
--
-- Called via service-role client (admin client bypasses RLS), so no RLS
-- policy changes are needed on order_sequence_counters.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.increment_order_sequence(p_year int)
returns int
language plpgsql
security definer
as $$
declare
  v_next int;
begin
  insert into public.order_sequence_counters (year, last_number)
  values (p_year, 1)
  on conflict (year)
  do update set last_number = order_sequence_counters.last_number + 1
  returning last_number into v_next;

  return v_next;
end;
$$;
