-- Remove /settings from the nav entirely.
-- Password resets and 2FA are managed by Admin; theme toggle lives in the sidebar.
-- Also clean up any role_permissions rows pointing to this page.
delete from public.role_permissions
where page_id = (select id from public.pages where route = '/settings');

delete from public.pages where route = '/settings';
