-- ─────────────────────────────────────────────────────────────────────────────
-- 069 — Add /production and /completed pages to the navigation
--
-- /production  — orders currently being printed (ticket_status = in_production)
-- /completed   — finished orders (ticket_status = completed)
--
-- Both pages are granted to accountant and admin initially.
-- Admin can use the Roles & Permissions UI to grant them to other roles
-- (SDR, Sales, future Production role) without needing another migration —
-- system role permissions are now editable by Admin in the UI.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.pages (route, display_name, icon, section, sort_order)
VALUES
  ('/production', 'In Production', 'Factory',     'main', 6),
  ('/completed',  'Completed',     'PackageCheck', 'main', 7)
ON CONFLICT (route) DO NOTHING;

-- Grant both pages to accountant and admin
INSERT INTO public.role_permissions (role_id, page_id)
SELECT r.id, p.id
FROM   public.roles r, public.pages p
WHERE  r.name IN ('accountant', 'admin')
  AND  p.route IN ('/production', '/completed')
ON CONFLICT DO NOTHING;
