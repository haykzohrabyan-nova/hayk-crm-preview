-- Add /notifications to the main nav (section = 'main').
-- Placeholder page with spec content until the feature is built.
insert into public.pages (route, display_name, icon, section, sort_order)
values ('/notifications', 'Notifications', 'Bell', 'main', 6)
on conflict (route) do nothing;

-- Add admin deferred sub-pages so they appear in the role permission matrix.
-- section = 'admin-sub' keeps them out of the sidebar; they are reached via /admin/settings tabs.
insert into public.pages (route, display_name, icon, section, sort_order)
values
  ('/admin/settings/audit-log', 'Audit Log',     'ClipboardList', 'admin-sub', 50),
  ('/admin/settings/company',   'Company Info',  'Building2',     'admin-sub', 60),
  ('/admin/settings/products',  'Products',      'Package',       'admin-sub', 70)
on conflict (route) do nothing;
