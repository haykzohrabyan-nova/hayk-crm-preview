-- Admin Operations page — sidebar nav + admin-only access (directly after Dashboard)
UPDATE public.pages
SET sort_order = sort_order + 1
WHERE section = 'main'
  AND route NOT IN ('/dashboard', '/operations');

INSERT INTO public.pages (route, display_name, icon, section, sort_order)
VALUES ('/operations', 'Operations', 'GitBranch', 'main', 1)
ON CONFLICT (route) DO UPDATE
SET display_name = excluded.display_name,
    icon = excluded.icon,
    section = excluded.section,
    sort_order = excluded.sort_order;
