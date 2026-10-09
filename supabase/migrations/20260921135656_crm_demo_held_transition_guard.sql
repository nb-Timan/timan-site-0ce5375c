-- Emit completed history only on an actual transition from non-yes to yes.
-- Setting demo_has_run to no during demo scheduling must do nothing here.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.append_crm_demo_held_history()'::regprocedure)
    into v_definition;
  if position('if new.demo_has_run is not distinct from ''yes''' in v_definition) = 0 then
    raise exception 'Unexpected demo-held transition guard';
  end if;
  v_definition := replace(v_definition,
    'if new.demo_has_run is not distinct from ''yes''',
    'if new.demo_has_run is distinct from ''yes''');
  execute v_definition;
end;
$migration$;
