-- Line-level attachments (no additional SKU yet). variant_id nullable; one file per line OR per variant.

alter table public.ticket_files
  alter column variant_id drop not null;

create unique index if not exists ticket_files_line_item_only_key
  on public.ticket_files (line_item_id)
  where variant_id is null;
