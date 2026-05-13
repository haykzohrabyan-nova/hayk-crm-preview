-- Remove /statistics from the nav.
-- Dashboard handles all KPI/analytics going forward.
-- role_permissions rows cascade-delete automatically via FK ON DELETE CASCADE.

delete from public.pages where route = '/statistics';
