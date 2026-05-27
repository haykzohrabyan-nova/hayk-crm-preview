-- Backfill ticket_sent for quotes created via Save & Send (POST) before ticket_sent was logged.
-- Affects sent-stage quotes with order_ticket_created but no ticket_sent (e.g. QUO-2026-0008).

insert into public.activities (type, lead_id, customer_id, ticket_id, by_user_id, payload, created_at)
select
  'ticket_sent',
  jt.linked_lead_id,
  jt.customer_id,
  jt.id,
  jt.created_by_id,
  jsonb_build_object(
    'channel', coalesce(jt.quote_channel, jt.ticket_quote_channel, 'unknown'),
    'destination', coalesce(jt.quote_destination, jt.ticket_dest_email, jt.ticket_dest_phone),
    'recipient', coalesce(jt.contact_name, jt.contact_email),
    'resend', false,
    'via', 'backfill_create_and_send'
  ),
  jt.created_at + interval '1 second'
from public.job_tickets jt
where jt.ticket_kind = 'quote'
  and jt.ticket_status not in ('draft', 'routed', 'cancelled')
  and exists (
    select 1
    from public.activities a
    where a.ticket_id = jt.id
      and a.type = 'order_ticket_created'
  )
  and not exists (
    select 1
    from public.activities a
    where a.ticket_id = jt.id
      and a.type = 'ticket_sent'
  );
