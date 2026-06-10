-- Action permission foundation (RBAC Slice 0)
-- Adds a permissions catalog and role_action_grants table.
-- Seeds all 4 system roles with grants that exactly match current hardcoded behavior.
-- NO behavior changes — existing roleName checks are untouched.
-- See docs/rbac-migration/plan.md for the full migration plan.
--
-- REVIEWED 2026-06-09 against full codebase scan:
--   app/api/leads/**, app/api/tickets/**, app/api/customers/**,
--   app/api/payments/**, app/api/orders/**, app/api/completed/**,
--   lib/utils/lead-access.ts, ticket-access.ts, db-counts.ts, role-checks.ts

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.permissions (
  id           uuid default gen_random_uuid() primary key,
  key          text unique not null,   -- e.g. 'leads.create', 'payments.record_payment'
  display_name text not null,
  area         text not null,          -- 'leads'|'sales'|'quotes'|'orders'|'payments'|'crm'|'admin'
  description  text,
  sort_order   int  not null default 0,
  created_at   timestamptz default now()
);

create table if not exists public.role_action_grants (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ─── Permissions catalog ─────────────────────────────────────────────────────

insert into public.permissions (key, display_name, area, description, sort_order) values

-- LEADS — data scope
('leads.scope.inbox_pool',  'View unclaimed inbox pool',           'leads', 'See leads not yet claimed by any SDR (All Leads toggle)',                     10),
('leads.scope.own',         'View own / assigned leads',           'leads', 'See leads where you are the SDR or sales owner',                              20),
('leads.scope.all',         'View all leads',                      'leads', 'See every lead regardless of ownership (admin view)',                          30),
('leads.scope.routed',      'View routed-to-sales pipeline',       'leads', 'See leads that have been routed to the sales pipeline',                        40),

-- LEADS — actions
('leads.create',            'Manually add a lead',                 'leads', 'POST /api/leads/manual — create a new lead from the inbox',                   50),
('leads.edit',              'Edit lead fields',                    'leads', 'PATCH /api/leads/[id] — update urgency, interests, notes, etc.',               60),
('leads.lock',              'Lock / claim lead (SDR ownership)',   'leads', 'POST /api/leads/[id]/lock — acquire SDR ownership lock',                       70),
('leads.unlock_own',        'Release own lock',                    'leads', 'POST /api/leads/[id]/unlock — release a lock you hold',                        80),
('leads.unlock_any',        'Force-release any lock',              'leads', 'POST /api/leads/[id]/unlock — override another user''s lock (admin only)',      90),
('leads.route_to_sales',    'Route lead to Sales',                 'leads', 'Set status = Routed to Sales via PATCH /api/leads/[id]',                      100),
('leads.reject',            'Reject a lead',                       'leads', 'Set status = Rejected via PATCH /api/leads/[id]',                             110),
('leads.hold',              'Put lead on hold',                    'leads', 'POST /api/leads/[id]/hold',                                                   120),
('leads.resume',            'Resume from hold / follow-up',        'leads', 'POST /api/leads/[id]/resume — restore to previous status',                    130),
('leads.follow_up',         'Mark follow-up later',                'leads', 'POST /api/leads/[id]/follow-up',                                              140),
('leads.claim',             'Claim a routed lead (Sales)',         'leads', 'POST /api/leads/[id]/claim — sales rep takes ownership of a routed lead',      150),
('leads.reassign',          'Reassign lead to another SDR',        'leads', 'POST /api/leads/[id]/reassign — admin reassign',                              160),
('leads.override_terminal', 'Edit rejected leads',                 'leads', 'Modify a lead in Rejected status (admin only)',                                170),

-- SALES
('sales.view_pipeline',     'View the Sales pipeline',             'sales', 'Access /sales and the sales-specific lead tabs',                                10),
('sales.hold',              'Put sales lead on hold',              'sales', 'POST /api/leads/[id]/hold with role=sales',                                    20),
('sales.resume',            'Resume a sales lead',                 'sales', 'POST /api/leads/[id]/resume with role=sales',                                  30),
('sales.follow_up',         'Follow up on a sales lead',           'sales', 'POST /api/leads/[id]/follow-up with role=sales',                               40),

-- QUOTES
('quotes.create',              'Create a quote',                         'quotes', 'POST /api/tickets — create a new quote',                                          10),
('quotes.edit',                'Edit quote fields',                      'quotes', 'PATCH /api/tickets/[id] — update line items, pricing, etc.',                      20),
('quotes.send',                'Send quote to customer',                 'quotes', 'PATCH /api/tickets/[id] with send_quote=true',                                     30),
('quotes.claim',               'Claim a routed quote',                   'quotes', 'Sales claim of a ticket routed through the sales pipeline',                        40),
('quotes.cancel',              'Cancel a quote',                         'quotes', 'PATCH /api/tickets/[id] with ticket_status=cancelled',                             50),
('quotes.upload_sales_permit', 'Upload / replace tax-exempt permit',     'quotes', 'POST /api/tickets/[id]/sales-permit — owner or payment staff upload',              60),

-- ORDERS
('orders.view_own',          'View own orders',                    'orders', 'See orders where you are the creator',                                          10),
('orders.view_all',          'View all orders',                    'orders', 'See every order regardless of creator (admin / accountant)',                    20),
('orders.release_production','Release order to production',        'orders', 'PATCH /api/tickets/[id] with release_production=true (owner or admin)',        30),
('orders.mark_complete',     'Mark order as completed',            'orders', 'PATCH /api/tickets/[id] with mark_completed=true — accountant: paid-in-full only; admin: balance override', 40),
('orders.convert_manual',    'Manually convert quote to order',   'orders', 'PATCH /api/tickets/[id] with ticket_status=order — admin only',                 50),
('orders.cancel',            'Cancel an order',                    'orders', 'PATCH /api/tickets/[id] with ticket_status=cancelled (order stage) — admin + accountant', 60),

-- PAYMENTS
('payments.record_payment',            'Confirm / record a payment',             'payments', 'PATCH /api/tickets/[id] with record_payment=true',                                       10),
('payments.approve_tax_exempt',        'Approve tax-exempt documentation',       'payments', 'PATCH /api/tickets/[id] with approve_tax_exempt=true',                                   20),
('payments.deny_tax_exempt',           'Deny tax-exempt documentation',          'payments', 'PATCH /api/tickets/[id] with deny_tax_exempt=true',                                      30),
('payments.request_resubmit',          'Request evidence / permit resubmission', 'payments', 'PATCH /api/tickets/[id] with request_payment_evidence_resubmit=true or request_tax_exempt_resubmit=true', 40),
('payments.resend_invoice',            'Resend invoice link to customer',        'payments', 'PATCH /api/tickets/[id] with resend_invoice=true — creator or admin/accountant',         50),
('payments.send_reminder',             'Send payment reminder to customer',      'payments', 'PATCH /api/tickets/[id] with send_payment_reminder=true — creator or admin/accountant',  60),
('payments.view_evidence',             'View payment & refund evidence files',   'payments', 'GET /api/tickets/[id]/evidence and /api/tickets/[id]/refund-evidence/* — admin + accountant', 70),
('payments.view_sales_permit',         'View / download tax-exempt permit file', 'payments', 'GET /api/tickets/[id]/sales-permit — admin + accountant',                               80),
('payments.refund',                    'Issue a refund',                         'payments', 'POST /api/tickets/[id]/refund',                                                          90),

-- CRM
('crm.view',   'View customer profiles',    'crm', 'Read customer details and history',              10),
('crm.edit',   'Edit customer information', 'crm', 'PATCH /api/customers/[id]',                     20),
('crm.merge',  'Merge duplicate customers', 'crm', 'POST /api/customers/[id]/merge',                30),
('crm.create', 'Create a new customer',     'crm', 'POST /api/customers during lead creation',      40),

-- ADMIN
('admin.manage_users',       'Manage users',               'admin', 'Create, edit, deactivate users at /admin/settings/users', 10),
('admin.manage_roles',       'Manage roles & permissions', 'admin', 'Edit role grants at /admin/settings/roles',               20),
('admin.view_reports',       'View reports',               'admin', 'Access /reports',                                         30),
('admin.view_activity_log',  'View activity log',          'admin', 'Access /activity-log',                                    40)

on conflict (key) do nothing;

-- ─── System role grants ───────────────────────────────────────────────────────
-- Seeds grants that exactly match current hardcoded behavior in the TypeScript
-- codebase. These are informational until Slice 1+ migration wires them in.
--
-- Mapping logic:
--   SDR    — lib/utils/lead-access.ts (canMutateLead, canAcquireLeadLock)
--            app/api/leads/manual/route.ts, app/api/tickets/route.ts
--            canResendTicketNotifications (creator), canPatchTicket (creator)
--   Sales  — lib/utils/lead-access.ts (canClaimLead), app/api/leads/[id]/claim
--            lib/utils/ticket-access.ts (canMutateTicket as creator)
--            canResendTicketNotifications (creator)
-- Accountant — lib/utils/ticket-access.ts (canAccountantMutateTicket)
--              isPaymentStaffRole() gating in payment-related handlers
--   Admin  — requireAdmin() + isAdminRole() — all permissions

-- SDR
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.name = 'sdr'
  and p.key in (
    -- Leads scope
    'leads.scope.inbox_pool',
    'leads.scope.own',
    -- Leads actions
    'leads.create',
    'leads.edit',
    'leads.lock',
    'leads.unlock_own',
    'leads.route_to_sales',
    'leads.reject',
    'leads.hold',
    'leads.resume',
    'leads.follow_up',
    -- Quotes / orders (created_by_id = SDR)
    'quotes.create',
    'quotes.edit',
    'quotes.send',
    'quotes.upload_sales_permit',   -- owner path: SDR can upload permit on their own ticket
    'orders.view_own',
    'orders.release_production',    -- canPatchTicket allows creator (SDR) to release
    -- Payments (creator-based: canResendTicketNotifications allows creator)
    'payments.resend_invoice',      -- creator can resend invoice for own ticket
    'payments.send_reminder',       -- creator can send payment reminder for own ticket
    -- CRM
    'crm.view',
    'crm.edit',
    'crm.create'
  )
on conflict do nothing;

-- Sales
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.name = 'sales'
  and p.key in (
    -- Leads scope
    'leads.scope.routed',
    'leads.scope.own',
    -- Leads actions
    'leads.claim',
    'leads.edit',
    'leads.unlock_own',
    'leads.hold',
    'leads.resume',
    'leads.follow_up',
    -- Sales pipeline
    'sales.view_pipeline',
    'sales.hold',
    'sales.resume',
    'sales.follow_up',
    -- Quotes / orders (created_by_id = Sales after claim)
    'quotes.create',
    'quotes.edit',
    'quotes.send',
    'quotes.claim',
    'quotes.upload_sales_permit',   -- owner path: Sales can upload permit on their own ticket
    'orders.view_own',
    'orders.release_production',    -- canPatchTicket allows creator (Sales) to release
    -- Payments (creator-based)
    'payments.resend_invoice',      -- creator can resend invoice for own ticket
    'payments.send_reminder',       -- creator can send payment reminder for own ticket
    -- CRM
    'crm.view',
    'crm.edit',
    'crm.create',
    'crm.merge'
  )
on conflict do nothing;

-- Accountant
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.name = 'accountant'
  and p.key in (
    -- Orders (isPaymentStaffRole = accountant + admin)
    'orders.view_all',
    'orders.release_production',   -- canAccountantMutateTicket allows production_released_at field
    'orders.mark_complete',        -- accountant: paid-in-full only (canAccountantMutateTicket)
    'orders.cancel',               -- isPaymentStaffRole gating (canAccountantMutateTicket)
    -- Payments (isPaymentStaffRole gating throughout)
    'payments.record_payment',
    'payments.approve_tax_exempt',
    'payments.deny_tax_exempt',
    'payments.request_resubmit',   -- request resubmission of evidence / permit
    -- NOTE: payments.resend_invoice and payments.send_reminder are NOT seeded for accountant.
    -- canResendTicketNotifications() requires admin OR created_by_id === userId.
    -- Accountants cannot create tickets (isAccountantQuoteWorkflowDenied blocks them),
    -- so they will never satisfy created_by_id === userId. These actions are creator-only.
    'payments.view_evidence',      -- GET /api/tickets/[id]/evidence + POST staff-replace
    'payments.view_sales_permit',  -- GET /api/tickets/[id]/sales-permit
    'payments.refund',
    -- Quotes
    'quotes.upload_sales_permit',  -- staff path: accountant can replace permit on any ticket
    'quotes.cancel'                -- isPaymentStaffRole gating (canAccountantMutateTicket)
  )
on conflict do nothing;

-- Admin — all permissions
insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.name = 'admin'
on conflict do nothing;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.permissions       enable row level security;
alter table public.role_action_grants enable row level security;

-- Any authenticated staff can read the catalog (needed for admin UI + client hooks)
create policy "Staff can read permissions"
  on public.permissions for select
  using (auth.uid() is not null);

-- Any authenticated staff can read grants (needed for session load)
create policy "Staff can read role_action_grants"
  on public.role_action_grants for select
  using (auth.uid() is not null);
