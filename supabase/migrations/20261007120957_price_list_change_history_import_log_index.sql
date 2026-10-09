create index if not exists price_list_price_changes_import_log_idx
  on public.price_list_price_changes (import_log_id)
  where import_log_id is not null;
