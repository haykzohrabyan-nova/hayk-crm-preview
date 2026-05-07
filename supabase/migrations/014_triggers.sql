create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger set_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger set_tickets_updated_at
  before update on public.job_tickets
  for each row execute function public.set_updated_at();

create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();
