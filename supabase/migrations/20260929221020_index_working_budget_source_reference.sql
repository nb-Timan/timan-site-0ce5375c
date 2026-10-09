create index if not exists budget_references_source_reference_idx
  on public.budget_references (source_reference_id)
  where source_reference_id is not null;
