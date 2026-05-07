-- leads
create index leads_customer_id_idx      on public.leads(customer_id);
create index leads_status_idx           on public.leads(status);
create index leads_sales_status_idx     on public.leads(sales_status);
create index leads_is_inbox_idx         on public.leads(is_inbox);
create index leads_sdr_id_idx           on public.leads(sdr_id);
create index leads_assigned_sdr_id_idx  on public.leads(assigned_sdr_id);
create index leads_sales_owner_id_idx   on public.leads(sales_owner_id);
create index leads_locked_by_id_idx     on public.leads(locked_by_id);
create index leads_created_at_idx       on public.leads(created_at desc);

-- customers
create index customers_phone_idx   on public.customers(phone);
create index customers_email_idx   on public.customers(email);
create index customers_company_idx on public.customers(company);

-- job_tickets
create index tickets_customer_id_idx   on public.job_tickets(customer_id);
create index tickets_lead_id_idx       on public.job_tickets(linked_lead_id);
create index tickets_kind_idx          on public.job_tickets(ticket_kind);
create index tickets_status_idx        on public.job_tickets(ticket_status);
create index tickets_created_at_idx    on public.job_tickets(created_at desc);

-- activities
create index activities_customer_id_idx on public.activities(customer_id);
create index activities_lead_id_idx     on public.activities(lead_id);
create index activities_ticket_id_idx   on public.activities(ticket_id);
create index activities_created_at_idx  on public.activities(created_at desc);

-- notifications
create index notifications_user_id_idx  on public.notifications(user_id);
create index notifications_read_idx     on public.notifications(user_id, read);

-- lookup_values
create index lookup_values_category_idx on public.lookup_values(category, is_active, sort_order);

-- role_permissions
create index role_permissions_role_id_idx on public.role_permissions(role_id);
