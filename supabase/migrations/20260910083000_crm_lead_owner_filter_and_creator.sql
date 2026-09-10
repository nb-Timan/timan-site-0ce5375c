-- A lead's creator and its currently assigned Timan seller are different
-- concepts. Keep creator immutable so a later seller assignment cannot erase
-- the original partner user.
alter table public.crm_leads
  add column if not exists created_by_user_id uuid references public.app_users(id);

create or replace function public.stamp_crm_lead_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    select au.id
      into new.created_by_user_id
     from public.app_users au
     where au.auth_user_id = auth.uid()
     limit 1;
  elsif tg_op = 'UPDATE' then
    new.created_by_user_id := old.created_by_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists stamp_crm_lead_creator_before_write on public.crm_leads;
create trigger stamp_crm_lead_creator_before_write
before insert or update on public.crm_leads
for each row execute function public.stamp_crm_lead_creator();

-- Extend the already deployed scoped RPC in place. The live project carries
-- a newer scope-aware definition than the historical repository snapshot, so
-- replacing only verified fragments avoids rolling that scope logic back.
do $migration$
declare
  old_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz)';
  new_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  function_definition text;
begin
  select pg_get_functiondef(old_signature::regprocedure)
    into function_definition;
  function_definition := regexp_replace(function_definition, '\\s+', ' ', 'g');

  if position('p_owner_filter text' in function_definition) > 0 then
    return;
  end if;

  if position('p_now timestamp with time zone DEFAULT now()) RETURNS jsonb' in function_definition) = 0
    or position('l.owner_email, l.owner_name as responsible_name' in function_definition) = 0
    or position('d.owner_email, d.owner_name as responsible_name' in function_definition) = 0
    or position('classified_rows as ( select r.*, case when r.display_status' in function_definition) = 0
    or position('as search_blob from scoped_rows r ), counts as' in function_definition) = 0
    or position('and (p_status_filter is null or p_status_filter = '''' or p_status_filter = (r.display_status || ''::'' || coalesce(r.probability::text, ''''))) and ( a.search_text is null' in function_definition) = 0 then
    raise exception 'crm_leads_page_query does not match the verified owner-filter migration shape';
  end if;

  function_definition := replace(
    function_definition,
    $old$p_now timestamp with time zone DEFAULT now()) RETURNS jsonb$old$,
    $new$p_now timestamp with time zone DEFAULT now(), p_owner_filter text DEFAULT NULL::text, p_owner_excluded_seller_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS jsonb$new$
  );
  function_definition := replace(
    function_definition,
    $old$coalesce(p_external_dealer_names, '{}'::text[]) as external_dealer_names, (timezone$old$,
    $new$coalesce(p_external_dealer_names, '{}'::text[]) as external_dealer_names, nullif(trim(coalesce(p_owner_filter, '')), '') as owner_filter, coalesce(p_owner_excluded_seller_ids, '{}'::uuid[]) as owner_excluded_seller_ids, (timezone$new$
  );
  function_definition := replace(
    function_definition,
    $old$l.owner_email, l.owner_name as responsible_name,$old$,
    $new$l.owner_email, l.created_by_user_id, l.owner_name as responsible_name,$new$
  );
  function_definition := replace(
    function_definition,
    $old$d.owner_email, d.owner_name as responsible_name,$old$,
    $new$d.owner_email, d.owner_user_id as created_by_user_id, d.owner_name as responsible_name,$new$
  );
  function_definition := replace(
    function_definition,
    $old$classified_rows as ( select r.*, case when r.display_status$old$,
    $new$classified_rows as ( select r.*, coalesce(owner_directory.portal_role = 'timan_seller', false) as owner_is_timan_seller, coalesce(creator_directory.portal_role in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user'), false) as created_by_partner, creator_directory.email as created_by_email, case when r.display_status$new$
  );
  function_definition := replace(
    function_definition,
    $old$as search_blob from scoped_rows r ), counts as$old$,
    $new$as search_blob from scoped_rows r left join public.app_user_directory owner_directory on owner_directory.id = r.owner_user_id left join public.app_user_directory creator_directory on creator_directory.id = r.created_by_user_id ), counts as$new$
  );
  function_definition := replace(
    function_definition,
    $old$and (p_status_filter is null or p_status_filter = '' or p_status_filter = (r.display_status || '::' || coalesce(r.probability::text, ''))) and ( a.search_text is null$old$,
    $new$and (p_status_filter is null or p_status_filter = '' or p_status_filter = (r.display_status || '::' || coalesce(r.probability::text, ''))) and ( a.owner_filter is null or (a.owner_filter like 'seller:%' and r.owner_user_id::text = substring(a.owner_filter from 8)) or (a.owner_filter = 'other_timan_sellers' and r.owner_is_timan_seller and not (r.owner_user_id = any(a.owner_excluded_seller_ids))) or (a.owner_filter = 'partner_created' and r.created_by_partner) or (a.owner_filter = 'unassigned_timan_seller' and not r.owner_is_timan_seller) ) and ( a.search_text is null$new$
  );
  function_definition := replace(
    function_definition,
    $old$'owner_email', owner_email, 'responsible_name', responsible_name,$old$,
    $new$'owner_email', owner_email, 'created_by_user_id', created_by_user_id, 'created_by_email', created_by_email, 'created_by_partner', created_by_partner, 'owner_is_timan_seller', owner_is_timan_seller, 'responsible_name', responsible_name,$new$
  );

  execute format('drop function %s', old_signature);
  execute function_definition;
  execute format('revoke all on function %s from public', new_signature);
  execute format('grant execute on function %s to authenticated, service_role', new_signature);
end;
$migration$;
