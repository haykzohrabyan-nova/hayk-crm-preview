-- RBAC seed update — 2026-06-17
-- Sales role granted: quotes.cancel, orders.cancel, orders.mark_complete
-- Matches code changes made 2026-06-17 in:
--   lib/utils/should-warn-partial-refund-before-cancel.ts  (canStaffCancelTicket)
--   components/quotes/quote-detail/detail-quick-actions.tsx (canMarkComplete)
--   components/quotes/quote-detail.tsx                      (isLocked, canEditTicket)
--   app/api/tickets/[id]/route.ts                           (cancel + complete + order-lock gates)
-- See docs/rbac-migration/plan.md — Slice 3/4 will wire these via requirePermission()
-- Stability clock for Orders/Quotes slice starts 2026-06-17.

-- ── Update catalog descriptions to reflect sales access ───────────────────────

update public.permissions
set description = 'PATCH /api/tickets/[id] with ticket_status=cancelled (order stage) — admin + accountant + sales (own tickets)'
where key = 'orders.cancel';

update public.permissions
set description = 'PATCH /api/tickets/[id] with ticket_status=completed from in_production — accountant: paid-in-full only; admin + sales: balance override with acknowledge_outstanding_balance modal'
where key = 'orders.mark_complete';

-- ── Add missing grants for Sales role ─────────────────────────────────────────

insert into public.role_action_grants (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.name = 'sales'
  and p.key in (
    'quotes.cancel',       -- canStaffCancelTicket now includes sales; same CancelTicketModal flow
    'orders.cancel',       -- same — order-stage cancel (order / in_production / completed)
    'orders.mark_complete' -- same override flow as admin (acknowledge_outstanding_balance + tax-exempt modal)
  )
on conflict do nothing;
