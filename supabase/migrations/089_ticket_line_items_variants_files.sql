-- Normalized ticket line items, per-line additional SKUs (variants), and file metadata.
-- Replaces job_tickets.quote_skus JSONB (backfill then drop).

-- ── ticket_line_items ───────────────────────────────────────────────────────
create table if not exists public.ticket_line_items (
  id               uuid        primary key default gen_random_uuid(),
  ticket_id        uuid        not null references public.job_tickets(id) on delete cascade,
  sort_order       int         not null default 0,
  product_type     text        not null default '',
  description      text,
  material         text,
  lamination       text,
  color_mode       text,
  sides            text,
  roll_direction   text,
  width            numeric,
  height           numeric,
  quantity         numeric,
  unit_price       numeric,
  line_total       numeric,
  design_required  boolean     not null default false,
  die_cut          boolean     not null default false,
  spot_uv          boolean     not null default false,
  foil             boolean     not null default false,
  perforation      boolean     not null default false,
  comment          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists ticket_line_items_ticket_id_idx
  on public.ticket_line_items(ticket_id);
create index if not exists ticket_line_items_ticket_sort_idx
  on public.ticket_line_items(ticket_id, sort_order);
create index if not exists ticket_line_items_product_type_idx
  on public.ticket_line_items(product_type)
  where product_type <> '';

-- ── ticket_line_variants ────────────────────────────────────────────────────
create table if not exists public.ticket_line_variants (
  id            uuid        primary key default gen_random_uuid(),
  line_item_id  uuid        not null references public.ticket_line_items(id) on delete cascade,
  ticket_id     uuid        not null references public.job_tickets(id) on delete cascade,
  sort_order    int         not null default 0,
  name          text        not null,
  quantity      numeric     not null check (quantity > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ticket_line_variants_line_item_idx
  on public.ticket_line_variants(line_item_id, sort_order);
create index if not exists ticket_line_variants_ticket_id_idx
  on public.ticket_line_variants(ticket_id);

-- ── ticket_files ──────────────────────────────────────────────────────────────
create table if not exists public.ticket_files (
  id              uuid        primary key default gen_random_uuid(),
  ticket_id       uuid        not null references public.job_tickets(id) on delete cascade,
  line_item_id    uuid        not null references public.ticket_line_items(id) on delete cascade,
  variant_id      uuid        not null references public.ticket_line_variants(id) on delete cascade,
  storage_path    text        not null,
  file_name       text        not null,
  mime_type       text        not null,
  byte_size       bigint,
  uploaded_by_id  uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  constraint ticket_files_variant_id_key unique (variant_id)
);

create index if not exists ticket_files_ticket_id_idx on public.ticket_files(ticket_id);

-- ── Backfill from quote_skus JSONB ────────────────────────────────────────────
insert into public.ticket_line_items (
  ticket_id,
  sort_order,
  product_type,
  description,
  material,
  lamination,
  color_mode,
  sides,
  roll_direction,
  width,
  height,
  quantity,
  unit_price,
  line_total,
  design_required,
  die_cut,
  spot_uv,
  foil,
  perforation,
  comment
)
select
  t.id,
  (elem.ordinality - 1)::int,
  coalesce(elem.value->>'product_type', ''),
  elem.value->>'description',
  elem.value->>'material',
  elem.value->>'lamination',
  elem.value->>'color_mode',
  elem.value->>'sides',
  elem.value->>'roll_direction',
  nullif(elem.value->>'width', '')::numeric,
  nullif(elem.value->>'height', '')::numeric,
  nullif(elem.value->>'quantity', '')::numeric,
  nullif(elem.value->>'unit_price', '')::numeric,
  nullif(elem.value->>'line_total', '')::numeric,
  coalesce((elem.value->>'design_required')::boolean, false),
  coalesce((elem.value->>'die_cut')::boolean, false),
  coalesce((elem.value->>'spot_uv')::boolean, false),
  coalesce((elem.value->>'foil')::boolean, false),
  coalesce((elem.value->>'perforation')::boolean, false),
  elem.value->>'comment'
from public.job_tickets t
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(t.quote_skus) = 'array' then t.quote_skus
    else '[]'::jsonb
  end
) with ordinality as elem(value, ordinality)
where jsonb_array_length(
  case when jsonb_typeof(t.quote_skus) = 'array' then t.quote_skus else '[]'::jsonb end
) > 0;

-- ── Drop legacy JSONB column ──────────────────────────────────────────────────
alter table public.job_tickets drop column if exists quote_skus;

-- ── RLS (API uses service role; policies for defense in depth) ───────────────
alter table public.ticket_line_items   enable row level security;
alter table public.ticket_line_variants enable row level security;
alter table public.ticket_files        enable row level security;

-- Storage: create private bucket `ticket-attachments` in Supabase Dashboard
-- (same pattern as payment-evidence). Upload/download only via Route Handlers.
