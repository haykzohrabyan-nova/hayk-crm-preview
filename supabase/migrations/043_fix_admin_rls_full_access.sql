-- ─────────────────────────────────────────────────────────────────────────────
-- 043 — Admin full access: configuration data + supporting tables
--
-- Rule: quotes and orders (job_tickets rows) are PERMANENT business records.
-- They are NEVER deleted — only cancelled via ticket_status = 'cancelled'.
-- Deletion is intentionally blocked at the DB level for job_tickets.
--
-- What admin CAN delete:
--   • Configuration / lookup data that reps select while building a quote:
--     product_types, materials, material_groups, product_material_links,
--     lookup_values, roles, pages — all protected by API-layer safety checks
--     that block deletion when a value is referenced in existing tickets.
--   • Supporting data: notifications, user_profiles (test/deactivated users)
--   • Leads (admin cleanup of duplicates or test data)
--   • Activities (admin correction of erroneous log entries)
--
-- Fixes two categories of issues found in 041/042:
--  1. Over-permissive write policies in 041: product catalog write policies
--     used auth.uid() is not null — any authenticated user could mutate them.
--     Replaced with admin-only.
--  2. Missing admin policies: order_sequence_counters, notifications,
--     user_profiles INSERT/DELETE, leads DELETE, activities DELETE.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Products catalog — restrict writes to admin only ──────────────────────
-- These are the selectable options reps use when building a quote (product
-- types, materials, etc.). Only admin can add, rename, or remove them.
-- API routes enforce an additional safety check: deletion is blocked if a
-- product type or material is referenced in any existing job_tickets.quote_skus.

-- product_types
drop policy if exists "product_types_write_auth"          on public.product_types;
create policy "admin_all_product_types" on public.product_types
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- material_groups
drop policy if exists "material_groups_write_auth"        on public.material_groups;
create policy "admin_all_material_groups" on public.material_groups
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- materials
drop policy if exists "materials_write_auth"              on public.materials;
create policy "admin_all_materials" on public.materials
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- product_material_links
drop policy if exists "product_material_links_write_auth" on public.product_material_links;
create policy "admin_all_product_material_links" on public.product_material_links
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');


-- ── 2. order_sequence_counters — admin full access ───────────────────────────
-- Written by the service-role client in POST /api/tickets.
-- Admin can inspect the sequence state (e.g. what number was last issued)
-- and correct it if a year counter ever gets out of sync.

create policy "admin_all_sequence_counters" on public.order_sequence_counters
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');


-- ── NOTE: leads — NO DELETE POLICY (intentional business rule) ───────────────
-- Leads and the sales pipeline are permanent business records.
-- A lead that is wrong, merged, or closed must be handled by:
--   • status = 'Rejected' or sales_status = 'Dropped' — to close it
--   • customer merge flow — to consolidate duplicates
-- Leads are never hard-deleted. This is enforced at the DB level by the
-- absence of any DELETE policy on the leads table.


-- ── NOTE: activities — NO DELETE POLICY (intentional business rule) ──────────
-- Activities are the append-only audit trail for leads and the sales pipeline.
-- Deleting them would destroy the history of what happened to a lead.
-- No DELETE policy exists on activities — not even for admin.


-- ── 5. notifications — admin full access ─────────────────────────────────────
-- Existing policies: users see only their own; users can mark their own read.
-- Admin needs read-all for debugging and delete for cleaning up stale entries.

create policy "admin_all_notifications" on public.notifications
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');


-- ── 6. user_profiles — complete admin coverage ───────────────────────────────
-- Existing: admin can SELECT all + UPDATE any.
-- INSERT: needed when admin creates a new user via the Admin panel.
-- DELETE: needed for removing deactivated/test users (cascade from
--         auth.users handles the child row automatically).

create policy "admin_insert_profiles" on public.user_profiles
  for insert
  with check (public.current_user_role() = 'admin');

create policy "admin_delete_profiles" on public.user_profiles
  for delete
  using (public.current_user_role() = 'admin');


-- ── NOTE: job_tickets — NO DELETE POLICY (intentional) ───────────────────────
-- Quotes and orders are permanent financial records. They must never be
-- deleted from the database. The only allowed terminal action is:
--   ticket_status = 'cancelled'   (by admin/owner, only if no payment recorded)
-- Keeping this comment here as an explicit reminder that the absence of a
-- DELETE policy on job_tickets is a business rule, not an oversight.
