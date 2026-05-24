-- Remove /production from sidebar nav — in-production orders now live on /orders (In Production tab).
-- role_permissions rows cascade-delete via FK ON DELETE CASCADE.

DELETE FROM public.pages WHERE route = '/production';
