-- ─────────────────────────────────────────────────────────────────────────────
-- 058 — Add /reports to the main navigation
--
-- Placeholder page — full charts will be built after Stripe payment processing
-- is connected so revenue data is accurate (actual payments, not quote totals).
-- Sort order 9 places it after /notifications (sort_order 8).
-- Access is granted per-role via Admin → Roles & Permissions.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.pages (route, display_name, icon, section, sort_order)
values ('/reports', 'Reports', 'BarChart3', 'main', 9)
on conflict (route) do nothing;
