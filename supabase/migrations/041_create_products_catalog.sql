-- ─────────────────────────────────────────────────────────────────────────────
-- 041 — Product Catalog (complete build from scratch)
--
-- Creates and seeds:
--   product_types          — text slug PK, 15 product types
--   material_groups        — uuid PK, 9 groups
--   materials              — text slug PK, 37 materials
--   product_material_links — junction (text FKs)
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. product_types ─────────────────────────────────────────────────────────

create table if not exists public.product_types (
  id                 text        primary key,
  name               text        not null unique,
  default_print_type text        not null default 'Sheet'
                                 check (default_print_type in ('Roll', 'Sheet')),
  facility           text        not null default 'all',
  sort_order         int         not null default 0,
  is_active          boolean     not null default true,
  notes              text,
  created_at         timestamptz not null default now()
);

-- ── 2. material_groups ────────────────────────────────────────────────────────

create table if not exists public.material_groups (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  facility   text,
  sort_order int         not null default 0,
  is_active  boolean     not null default true
);

-- ── 3. materials ─────────────────────────────────────────────────────────────

create table if not exists public.materials (
  id           text        primary key,
  name         text        not null,
  group_id     uuid        references public.material_groups(id) on delete set null,
  category     text,
  facility     text        not null default 'all',
  sort_order   int         not null default 0,
  is_active    boolean     not null default true,
  default_unit text        not null default 'sheets',
  created_at   timestamptz not null default now()
);

-- ── 4. product_material_links ─────────────────────────────────────────────────

create table if not exists public.product_material_links (
  product_type_id text references public.product_types(id) on delete cascade,
  material_id     text references public.materials(id)     on delete cascade,
  primary key (product_type_id, material_id)
);

-- ── 5. Indexes ────────────────────────────────────────────────────────────────

create index if not exists product_types_sort_idx          on public.product_types(sort_order);
create index if not exists materials_group_idx             on public.materials(group_id);
create index if not exists pml_prod_idx                    on public.product_material_links(product_type_id);
create index if not exists pml_mat_idx                     on public.product_material_links(material_id);

-- ── 6. RLS ────────────────────────────────────────────────────────────────────

alter table public.product_types          enable row level security;
alter table public.material_groups        enable row level security;
alter table public.materials              enable row level security;
alter table public.product_material_links enable row level security;

do $$ begin
  create policy "product_types_select_all" on public.product_types
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "product_types_write_auth" on public.product_types
    for all using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "material_groups_select_all" on public.material_groups
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "material_groups_write_auth" on public.material_groups
    for all using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "materials_select_all" on public.materials
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "materials_write_auth" on public.materials
    for all using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "product_material_links_select_all" on public.product_material_links
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "product_material_links_write_auth" on public.product_material_links
    for all using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ── 7. Grants ─────────────────────────────────────────────────────────────────

grant usage  on schema public                  to anon, authenticated;
grant select on public.product_types          to anon, authenticated, service_role;
grant select on public.materials              to anon, authenticated, service_role;
grant select on public.material_groups        to anon, authenticated, service_role;
grant select on public.product_material_links to anon, authenticated, service_role;

-- ── 8. Seed: product_types ────────────────────────────────────────────────────

insert into public.product_types (id, name, default_print_type, facility, sort_order) values
  ('labels-roll',        'Labels (Roll)',              'Roll',  '16th-street', 10),
  ('labels-sheet',       'Labels (Sheet)',             'Sheet', '16th-street', 20),
  ('pouches',            'Pouches',                    'Roll',  '16th-street', 30),
  ('boxes',              'Folding Cartons / Boxes',    'Sheet', 'all',         40),
  ('business-cards',     'Business Cards',             'Sheet', '16th-street', 50),
  ('flyers',             'Flyers / Postcards',         'Sheet', '16th-street', 60),
  ('booklets',           'Booklets',                   'Sheet', '16th-street', 70),
  ('stickers-die',       'Diecut Stickers',            'Sheet', 'all',         80),
  ('vinyl-labels-rolls', E'Vinyl Labels / 54\'\' Rolls', 'Roll', 'boyd-street', 90),
  ('vinyl-signage',      'Vinyl Signage',              'Roll',  'boyd-street', 100),
  ('banners',            'Banners / Large Format',     'Roll',  'boyd-street', 110),
  ('window-decals',      'Window Decals',              'Roll',  'boyd-street', 120),
  ('wallpaper',          'Wallpaper',                  'Roll',  'boyd-street', 130),
  ('sheet-boyd',         'Sheet Products (Boyd)',      'Sheet', 'boyd-street', 140),
  ('other',              'Other',                      'Sheet', 'all',         150)
on conflict (id) do nothing;

-- ── 9. Seed: material_groups ──────────────────────────────────────────────────

insert into public.material_groups (name, facility, sort_order) values
  ('BOPP',             '16th-street', 10),
  ('Cosmetic Web',     '16th-street', 20),
  ('Label Sheets',     '16th-street', 30),
  ('Cardstock',        '16th-street', 40),
  ('Cardstock (Boyd)', 'boyd-street', 45),
  ('Cover/Text',       '16th-street', 50),
  ('Vinyl',            'boyd-street', 60),
  ('Specialty',        'boyd-street', 70),
  ('Sheet (Boyd)',     'boyd-street', 80)
on conflict (name) do nothing;

-- ── 10. Seed: materials ───────────────────────────────────────────────────────
-- Each batch resolves group_id by joining on the group name.

-- BOPP
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('bopp-clear',  'Clear BOPP',  'BOPP', '16th-street', '10', 'rolls'),
  ('bopp-white',  'White BOPP',  'BOPP', '16th-street', '20', 'rolls'),
  ('bopp-silver', 'Silver BOPP', 'BOPP', '16th-street', '30', 'rolls'),
  ('bopp-holo',   'Holo BOPP',   'BOPP', '16th-street', '40', 'rolls')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Cosmetic Web
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('cosm-clear',  'Clear Cosmetic Web',  'Cosmetic Web', '16th-street', '10', 'rolls'),
  ('cosm-white',  'White Cosmetic Web',  'Cosmetic Web', '16th-street', '20', 'rolls'),
  ('cosm-silver', 'Silver Cosmetic Web', 'Cosmetic Web', '16th-street', '30', 'rolls')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Label Sheets
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('ls-gloss',     'Gloss Label Sheet', 'Label Sheets', '16th-street', '10', 'sheets'),
  ('ls-matte',     'Matte Label Sheet', 'Label Sheets', '16th-street', '20', 'sheets'),
  ('ls-semigloss', 'Semi Gloss',        'Label Sheets', '16th-street', '30', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Cardstock (16th Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('cs-14c1s',    '14pt C1S',    'Cardstock', '16th-street', '10', 'sheets'),
  ('cs-14c2s',    '14pt C2S',    'Cardstock', '16th-street', '20', 'sheets'),
  ('cs-16c1s',    '16pt C1S',    'Cardstock', '16th-street', '30', 'sheets'),
  ('cs-16c2s',    '16pt C2S',    'Cardstock', '16th-street', '40', 'sheets'),
  ('cs-18c1s',    '18pt C1S',    'Cardstock', '16th-street', '50', 'sheets'),
  ('cs-18c2s',    '18pt C2S',    'Cardstock', '16th-street', '60', 'sheets'),
  ('cs-18silver', '18pt Silver', 'Cardstock', '16th-street', '70', 'sheets'),
  ('cs-24c1s',    '24pt C1S',    'Cardstock', '16th-street', '80', 'sheets'),
  ('cs-24c2s',    '24pt C2S',    'Cardstock', '16th-street', '90', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Cardstock (Boyd Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('cs-boyd-16pt', '16pt (Boyd)', 'Cardstock (Boyd)', 'boyd-street', '10', 'sheets'),
  ('cs-boyd-18pt', '18pt (Boyd)', 'Cardstock (Boyd)', 'boyd-street', '20', 'sheets'),
  ('cs-boyd-20pt', '20pt (Boyd)', 'Cardstock (Boyd)', 'boyd-street', '30', 'sheets'),
  ('cs-boyd-24pt', '24pt (Boyd)', 'Cardstock (Boyd)', 'boyd-street', '40', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Cover/Text Stock
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('ct-80-cover',  '80lb Cover',  'Cover/Text', '16th-street', '10', 'sheets'),
  ('ct-100-cover', '100lb Cover', 'Cover/Text', '16th-street', '20', 'sheets'),
  ('ct-110-cover', '110lb Cover', 'Cover/Text', '16th-street', '30', 'sheets'),
  ('ct-80-text',   '80lb Text',   'Cover/Text', '16th-street', '40', 'sheets'),
  ('ct-100-text',  '100lb Text',  'Cover/Text', '16th-street', '50', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Vinyl (Boyd Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('vinyl-white',     'White Vinyl',                   'Vinyl', 'boyd-street', '10', 'rolls'),
  ('vinyl-white-agg', 'White Vinyl - Aggressive Glue', 'Vinyl', 'boyd-street', '20', 'rolls'),
  ('vinyl-holo',      'Holographic Vinyl',             'Vinyl', 'boyd-street', '30', 'rolls')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Specialty (Boyd Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('spec-banner',         'Banner Material',                 'Specialty', 'boyd-street', '10', 'sqft'),
  ('spec-window',         'Window Decal',                   'Specialty', 'boyd-street', '20', 'sqft'),
  ('spec-wallpaper-ps',   'Self-Adhesive (Peel-and-Stick)', 'Specialty', 'boyd-street', '30', 'sqft'),
  ('spec-wallpaper-trad', 'Traditional / Unpasted',         'Specialty', 'boyd-street', '40', 'sqft')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- Sheet (Boyd Street)
insert into public.materials (id, name, category, facility, sort_order, default_unit, group_id)
select m.id, m.name, m.category, m.facility, m.sort_order::int, m.default_unit, mg.id
from (values
  ('sheet-boyd-18pt', '18pt (Boyd)', 'Sheet (Boyd)', 'boyd-street', '10', 'sheets'),
  ('sheet-boyd-20pt', '20pt (Boyd)', 'Sheet (Boyd)', 'boyd-street', '20', 'sheets'),
  ('sheet-boyd-24pt', '24pt (Boyd)', 'Sheet (Boyd)', 'boyd-street', '30', 'sheets')
) as m(id, name, category, facility, sort_order, default_unit)
join public.material_groups mg on mg.name = m.category
on conflict (id) do nothing;

-- ── 11. Seed: product_material_links ─────────────────────────────────────────

-- Labels (Roll): BOPP + Label Sheets
insert into public.product_material_links values
  ('labels-roll','bopp-clear'), ('labels-roll','bopp-white'),
  ('labels-roll','bopp-silver'), ('labels-roll','bopp-holo'),
  ('labels-roll','ls-gloss'), ('labels-roll','ls-matte'), ('labels-roll','ls-semigloss')
on conflict do nothing;

-- Labels (Sheet): Label Sheets only
insert into public.product_material_links values
  ('labels-sheet','ls-gloss'), ('labels-sheet','ls-matte'), ('labels-sheet','ls-semigloss')
on conflict do nothing;

-- Pouches: Cosmetic Web
insert into public.product_material_links values
  ('pouches','cosm-clear'), ('pouches','cosm-white'), ('pouches','cosm-silver')
on conflict do nothing;

-- Folding Cartons / Boxes: Cardstock (16th) + Cardstock (Boyd)
insert into public.product_material_links values
  ('boxes','cs-14c1s'), ('boxes','cs-14c2s'), ('boxes','cs-16c1s'), ('boxes','cs-16c2s'),
  ('boxes','cs-18c1s'), ('boxes','cs-18c2s'), ('boxes','cs-18silver'),
  ('boxes','cs-24c1s'), ('boxes','cs-24c2s'),
  ('boxes','cs-boyd-16pt'), ('boxes','cs-boyd-18pt'),
  ('boxes','cs-boyd-20pt'), ('boxes','cs-boyd-24pt')
on conflict do nothing;

-- Business Cards: Cardstock (16th) + Cover/Text covers only
insert into public.product_material_links values
  ('business-cards','cs-14c1s'), ('business-cards','cs-14c2s'),
  ('business-cards','cs-16c1s'), ('business-cards','cs-16c2s'),
  ('business-cards','cs-18c1s'), ('business-cards','cs-18c2s'),
  ('business-cards','cs-18silver'),
  ('business-cards','cs-24c1s'), ('business-cards','cs-24c2s'),
  ('business-cards','ct-80-cover'), ('business-cards','ct-100-cover'), ('business-cards','ct-110-cover')
on conflict do nothing;

-- Flyers / Postcards: Cover/Text (all) + Cardstock (16th)
insert into public.product_material_links values
  ('flyers','ct-80-cover'), ('flyers','ct-100-cover'), ('flyers','ct-110-cover'),
  ('flyers','ct-80-text'),  ('flyers','ct-100-text'),
  ('flyers','cs-14c1s'), ('flyers','cs-14c2s'), ('flyers','cs-16c1s'), ('flyers','cs-16c2s'),
  ('flyers','cs-18c1s'), ('flyers','cs-18c2s'), ('flyers','cs-18silver'),
  ('flyers','cs-24c1s'), ('flyers','cs-24c2s')
on conflict do nothing;

-- Booklets: Cover/Text (all)
insert into public.product_material_links values
  ('booklets','ct-80-cover'), ('booklets','ct-100-cover'), ('booklets','ct-110-cover'),
  ('booklets','ct-80-text'),  ('booklets','ct-100-text')
on conflict do nothing;

-- Diecut Stickers: BOPP + Label Sheets (16th) + Vinyl (Boyd)
insert into public.product_material_links values
  ('stickers-die','bopp-clear'), ('stickers-die','bopp-white'),
  ('stickers-die','bopp-silver'), ('stickers-die','bopp-holo'),
  ('stickers-die','ls-gloss'), ('stickers-die','ls-matte'), ('stickers-die','ls-semigloss'),
  ('stickers-die','vinyl-white'), ('stickers-die','vinyl-white-agg'), ('stickers-die','vinyl-holo')
on conflict do nothing;

-- Vinyl Labels / 54'' Rolls: Vinyl (Boyd)
insert into public.product_material_links values
  ('vinyl-labels-rolls','vinyl-white'),
  ('vinyl-labels-rolls','vinyl-white-agg'),
  ('vinyl-labels-rolls','vinyl-holo')
on conflict do nothing;

-- Vinyl Signage: Vinyl (Boyd)
insert into public.product_material_links values
  ('vinyl-signage','vinyl-white'),
  ('vinyl-signage','vinyl-white-agg'),
  ('vinyl-signage','vinyl-holo')
on conflict do nothing;

-- Banners / Large Format: all Specialty
insert into public.product_material_links values
  ('banners','spec-banner'), ('banners','spec-window'),
  ('banners','spec-wallpaper-ps'), ('banners','spec-wallpaper-trad')
on conflict do nothing;

-- Window Decals: Window Decal material only
insert into public.product_material_links values
  ('window-decals','spec-window')
on conflict do nothing;

-- Wallpaper: Wallpaper materials only
insert into public.product_material_links values
  ('wallpaper','spec-wallpaper-ps'), ('wallpaper','spec-wallpaper-trad')
on conflict do nothing;

-- Sheet Products (Boyd): Sheet (Boyd) materials
insert into public.product_material_links values
  ('sheet-boyd','sheet-boyd-18pt'),
  ('sheet-boyd','sheet-boyd-20pt'),
  ('sheet-boyd','sheet-boyd-24pt')
on conflict do nothing;

-- Other: all materials (catch-all product type)
insert into public.product_material_links
select 'other', id from public.materials
on conflict do nothing;
