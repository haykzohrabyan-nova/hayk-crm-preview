-- Backfill routed_by_id for existing tickets that were created by an SDR
-- and are currently routed (not yet claimed) or were previously routed and
-- then claimed by Sales (which changes created_by_id, erasing the SDR link).
--
-- Strategy: use the activities table — order_ticket_created records who
-- originally created each ticket, regardless of later ownership changes.
-- We also check for tickets that were claimed from routed status via
-- order_ticket_status_changed { from: 'routed' }.

update public.job_tickets jt
set routed_by_id = a.by_user_id
from (
  -- Original creator of each ticket, from the activities log
  select distinct on (ticket_id)
    ticket_id,
    by_user_id
  from public.activities
  where type = 'order_ticket_created'
    and ticket_id is not null
    and by_user_id is not null
  order by ticket_id, created_at asc
) a
join public.user_profiles up on up.id = a.by_user_id
join public.roles r          on r.id  = up.role_id
where jt.id             = a.ticket_id
  and jt.routed_by_id   is null
  and r.name            = 'sdr'
  -- Only backfill tickets that are currently routed, or were previously
  -- routed and claimed (signalled by an order_ticket_status_changed activity
  -- with payload->>'from' = 'routed').
  and (
    jt.ticket_status = 'routed'
    or exists (
      select 1
      from public.activities act
      where act.ticket_id  = jt.id
        and act.type        = 'order_ticket_status_changed'
        and act.payload->>'from' = 'routed'
    )
  );
