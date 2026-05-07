create table public.role_permissions (
  role_id   uuid  not null references public.roles(id) on delete cascade,
  page_id   uuid  not null references public.pages(id) on delete cascade,
  primary key (role_id, page_id)
);
