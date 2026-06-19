-- Allow 'Unit' as a third default_print_type alongside 'Roll' and 'Sheet'.
-- Drops and recreates the CHECK constraint on product_types.default_print_type.

alter table public.product_types
  drop constraint if exists product_types_default_print_type_check;

alter table public.product_types
  add constraint product_types_default_print_type_check
  check (default_print_type in ('Roll', 'Sheet', 'Unit'));
