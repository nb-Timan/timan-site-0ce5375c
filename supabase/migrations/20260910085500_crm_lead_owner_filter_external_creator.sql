-- app_user_directory intentionally excludes dealer users, while this backend
-- filter must classify the original external creator. The scoped RPC runs for
-- the caller and keeps the existing lead scope; it only reads canonical roles.
do $migration$
declare
  signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  function_definition text;
begin
  select pg_get_functiondef(signature::regprocedure)
    into function_definition;
  function_definition := regexp_replace(function_definition, '\\s+', ' ', 'g');

  if position('public.app_users owner_directory' in function_definition) > 0 then
    return;
  end if;

  if position('public.app_user_directory owner_directory' in function_definition) = 0
    or position('public.app_user_directory creator_directory' in function_definition) = 0 then
    raise exception 'crm_leads_page_query does not contain the expected creator directory joins';
  end if;

  function_definition := replace(
    function_definition,
    'public.app_user_directory owner_directory',
    'public.app_users owner_directory'
  );
  function_definition := replace(
    function_definition,
    'public.app_user_directory creator_directory',
    'public.app_users creator_directory'
  );
  function_definition := replace(
    function_definition,
    'creator_directory.portal_role in',
    'creator_directory.portal_role::text in'
  );

  execute function_definition;
end;
$migration$;
