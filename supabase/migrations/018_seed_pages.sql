-- Main nav pages
insert into public.pages (route, display_name, icon, section, sort_order) values
  ('/dashboard',            'Dashboard',            'LayoutDashboard',  'main',   0),
  ('/leads',                'Leads',                'Inbox',            'main',   1),
  ('/sales',                'Sales Pipeline',       'Briefcase',        'main',   2),
  ('/crm',                  'CRM',                  'BookUser',         'main',   3),
  ('/tickets',              'Tickets',              'FileText',         'main',   4),
  ('/statistics',           'Statistics',           'BarChart3',        'main',   5),
  -- Bottom nav
  ('/settings',             'Settings',             'Settings',         'bottom', 0),
  -- Admin section
  ('/admin',                'Admin Panel',          'ShieldCheck',      'admin',  0),
  ('/admin/users',          'Users',                'Users',            'admin',  1),
  ('/admin/roles',          'Roles & Permissions',  'KeyRound',         'admin',  2),
  ('/admin/dropdowns',      'Dropdown Options',     'ListFilter',       'admin',  3),
  ('/admin/notifications',  'Notifications',        'Megaphone',        'admin',  4),
  ('/admin/audit',          'Audit Log',            'ClipboardList',    'admin',  5)
on conflict (route) do nothing;
