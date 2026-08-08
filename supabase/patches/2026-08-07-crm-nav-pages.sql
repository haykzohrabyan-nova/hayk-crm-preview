-- Sidebar menu rows for the new Sales CRM pages (run on the target DB).
insert into public.pages(route,display_name,icon,section,sort_order) values ('/my-day','My Day','Sunrise','main',10) on conflict (route) do nothing;
insert into public.pages(route,display_name,icon,section,sort_order) values ('/tasks','Tasks','CheckSquare','main',11) on conflict (route) do nothing;
insert into public.pages(route,display_name,icon,section,sort_order) values ('/missed-calls','Missed Calls','PhoneMissed','main',12) on conflict (route) do nothing;
insert into public.pages(route,display_name,icon,section,sort_order) values ('/team','Team','Users2','main',13) on conflict (route) do nothing;
insert into public.pages(route,display_name,icon,section,sort_order) values ('/inbox','Inbox','Flame','main',14) on conflict (route) do nothing;
insert into public.pages(route,display_name,icon,section,sort_order) values ('/deals','Deals','Handshake','main',15) on conflict (route) do nothing;
insert into public.pages(route,display_name,icon,section,sort_order) values ('/pipeline','Pipeline','GitBranch','main',16) on conflict (route) do nothing;
