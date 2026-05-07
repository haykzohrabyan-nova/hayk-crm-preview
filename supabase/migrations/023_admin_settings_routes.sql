-- Add /admin/settings/* routes to the pages table so they are available
-- for role_permissions linking. These are admin-only sub-pages; they will
-- not appear in the sidebar (section = 'admin-sub').

insert into public.pages (route, display_name, icon, section, sort_order)
values
  ('/admin/settings/users',         'Users',               'Users',       'admin-sub', 10),
  ('/admin/settings/roles',         'Roles & Permissions', 'KeyRound',    'admin-sub', 20),
  ('/admin/settings/dropdowns',     'Dropdown Options',    'ListFilter',  'admin-sub', 30),
  ('/admin/settings/notifications', 'Notifications',       'Megaphone',   'admin-sub', 40)
on conflict (route) do nothing;
