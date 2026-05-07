create table public.activities (
  id          uuid        primary key default gen_random_uuid(),
  customer_id uuid        references public.customers(id),
  lead_id     uuid        references public.leads(id),
  ticket_id   uuid        references public.job_tickets(id),
  type        text        not null,
  channel     text,
  by_user_id  uuid        references auth.users(id),
  payload     jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);
