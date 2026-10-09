-- Calendar reads filter by owner initials as well as participant initials.
-- Keep that snapshot aligned with the canonical owner_user_id on linked demos.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.sync_crm_demo_calendar()'::regprocedure)
    into v_definition;
  if position('seller_user_id, seller_name, activity_type' in v_definition) = 0
     or position('seller_name = excluded.seller_name,' in v_definition) = 0 then
    raise exception 'Unexpected demo calendar owner mapping';
  end if;

  v_definition := replace(v_definition,
    'seller_user_id, seller_name, activity_type',
    'seller_user_id, seller_name, seller_initials, activity_type');
  v_definition := replace(v_definition,
    E'new.owner_name,\n    ''demo'',',
    E'new.owner_name,\n    (select nullif(upper(trim(owner.initials)), '''') from public.app_users owner where owner.id = new.owner_user_id),\n    ''demo'',');
  v_definition := replace(v_definition,
    'seller_name = excluded.seller_name,',
    'seller_name = excluded.seller_name, seller_initials = excluded.seller_initials,');
  if position('owner.id = new.owner_user_id' in v_definition) = 0 then
    raise exception 'Demo calendar owner lookup was not installed';
  end if;
  execute v_definition;
end;
$migration$;
