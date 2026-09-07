-- The enrichment routine is an administrative import operation, never a public API.
revoke execute on function public.enrich_legacy_machine_sales(jsonb) from anon;
revoke execute on function public.enrich_legacy_machine_sales(jsonb) from public;
grant execute on function public.enrich_legacy_machine_sales(jsonb) to authenticated;
