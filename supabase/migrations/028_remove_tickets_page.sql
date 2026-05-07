-- Remove /tickets from nav — Quoted Requests and Orders are now separate top-level pages.
-- The /tickets route still exists in code but is not linked from the sidebar.
delete from public.role_permissions where page_id = (select id from public.pages where route = '/tickets');
delete from public.pages where route = '/tickets';
