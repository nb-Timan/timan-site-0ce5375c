-- Keep the existing follow-up transaction and permissions; accept canonical scheduled demos.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.save_crm_lead_note_followup(uuid,uuid,text,date,text,boolean,text)'::regprocedure) into definition;
  if position('''Customer requests a demonstration'',' in definition)=0 then
    raise exception 'Unexpected next-activity validation';
  end if;
  definition := replace(definition, '''Customer requests a demonstration'',',
    '''Customer requests a demonstration'', ''Demonstration scheduled'',');
  execute definition;
end;
$migration$;
