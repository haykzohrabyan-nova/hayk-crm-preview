-- Activity log: move nav route from /notifications → /activity-log.
-- Frees /notifications for a future per-user notification bell.

update public.pages
set
  route = '/activity-log',
  display_name = 'Activity Log',
  icon = 'ClipboardList'
where route = '/notifications';
