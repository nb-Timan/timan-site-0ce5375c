create or replace function public.planning_reject_conflicted_supply_import()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.outcome = 'conflict' then
    raise exception using
      errcode = '23514',
      message = 'PLANNING_IMPORT_REQUIRES_CLEAN_PREVIEW';
  end if;
  return new;
end;
$$;

revoke all on function public.planning_reject_conflicted_supply_import()
  from public, anon, authenticated;
grant execute on function public.planning_reject_conflicted_supply_import()
  to service_role;

create trigger planning_supply_import_conflict_guard
before insert or update of outcome
on public.planning_supply_import_batch_rows
for each row execute function public.planning_reject_conflicted_supply_import();
