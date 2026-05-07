-- Admin sub-pages should not appear as individual sidebar items.
-- Only /admin (the overview) appears in the sidebar under section='admin'.
-- Sub-pages are navigated via the /admin two-tab layout.
update public.pages
set section = 'admin-sub'
where route in (
  '/admin/users',
  '/admin/roles',
  '/admin/dropdowns',
  '/admin/notifications',
  '/admin/audit'
);
