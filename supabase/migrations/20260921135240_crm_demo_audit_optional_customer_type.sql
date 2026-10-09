-- The shared audit trigger also runs on crm_demo_leads, which has no
-- customer_type column. JSON extraction preserves the fallback for both tables.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.audit_crm_lead_change()'::regprocedure)
    into v_definition;

  if position('new.customer_type' in v_definition) = 0
     or position('old.customer_type' in v_definition) = 0 then
    raise exception 'Unexpected CRM audit function: optional customer_type references not found';
  end if;

  v_definition := replace(v_definition, 'new.customer_type', '(to_jsonb(new) ->> ''customer_type'')');
  v_definition := replace(v_definition, 'old.customer_type', '(to_jsonb(old) ->> ''customer_type'')');
  execute v_definition;
end;
$migration$;
