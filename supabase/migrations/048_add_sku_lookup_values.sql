-- ─────────────────────────────────────────────────────────────────────────────
-- 048 — Add SKU-level lookup categories missing from 044
--
-- Three new admin-managed dropdown categories for the Line Items tab:
--   color_mode    — print colour setup (CMYK, Pantone, etc.)
--   sides         — single or double-sided print
--   roll_direction — label roll unwind direction (Labels/Roll product type)
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.lookup_values (category, value, label, sort_order, is_active) values
  -- Color Mode
  ('color_mode', 'cmyk',             'CMYK',              1, true),
  ('color_mode', 'pantone',          'Pantone',            2, true),
  ('color_mode', 'black_only',       'Black Only',         3, true),
  ('color_mode', 'full_color_white', 'Full Color + White', 4, true),

  -- Sides
  ('sides', 'single_sided', 'Single-sided', 1, true),
  ('sides', 'double_sided', 'Double-sided', 2, true),

  -- Roll Direction (label unwind)
  ('roll_direction', 'top_off_first',    'Top Off First',    1, true),
  ('roll_direction', 'bottom_off_first', 'Bottom Off First', 2, true),
  ('roll_direction', 'right_off_first',  'Right Off First',  3, true),
  ('roll_direction', 'left_off_first',   'Left Off First',   4, true)

on conflict (category, value) do nothing;
