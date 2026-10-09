-- PostgreSQL shortened the legacy constraint name to 63 bytes. Remove that
-- actual constraint so the same workbook can safely import separate sheets by
-- (source system, file hash, item number).

alter table public.planning_supply_import_batches
  drop constraint if exists planning_supply_import_batche_source_system_source_file_sha_key;

create unique index if not exists planning_supply_import_batches_file_item_unique
  on public.planning_supply_import_batches (
    source_system,
    source_file_sha256,
    item_number
  );
