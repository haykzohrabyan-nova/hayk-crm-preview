-- Add Quoted Requests and Orders as separate nav pages.
-- Both are planned (not yet built) and will show spec preview content.
-- Sort order places them after Tickets (sort_order 4) and before Statistics (sort_order 5).
insert into public.pages (route, display_name, icon, section, sort_order)
values
  ('/quotes', 'Quoted Requests', 'MessageSquareQuote', 'main', 5),
  ('/orders', 'Orders',          'ClipboardList',       'main', 6)
on conflict (route) do nothing;

-- Push Statistics and Notifications down to make room
update public.pages set sort_order = 7 where route = '/statistics';
update public.pages set sort_order = 8 where route = '/notifications';
