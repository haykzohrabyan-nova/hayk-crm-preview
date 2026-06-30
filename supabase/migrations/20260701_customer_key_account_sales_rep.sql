-- Key Account sales rep — optional dedicated rep per customer (Admin assigns).

alter table public.customers
  add column if not exists key_account_sales_rep_id uuid
    references public.user_profiles(id) on delete set null;

create index if not exists customers_key_account_sales_rep_id_idx
  on public.customers (key_account_sales_rep_id)
  where key_account_sales_rep_id is not null;
