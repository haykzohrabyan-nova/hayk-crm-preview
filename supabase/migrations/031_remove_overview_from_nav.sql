-- Remove /overview from the pages table so it no longer appears in the sidebar nav.
-- The route and page file (app/(app)/overview/page.tsx) are kept for future use.

delete from public.role_permissions
where page_id = (select id from public.pages where route = '/overview');

delete from public.pages where route = '/overview';
