-- Resolve audited Portal corrections inside the canonical registry RPC so the
-- row, status filters and summary counters are calculated from the same facts.
-- Source warranty/MO rows remain immutable; RLS on the correction table keeps
-- the overlay available only to the existing internal Teknik & Service scope.
do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'machine_registry_page_scoped'
    and pg_get_function_identity_arguments(p.oid) =
      'p_allowed_dealers text[], p_query text, p_dealer text, p_model text, p_warranty_type text, p_health text, p_warranty_match text, p_demo_only boolean, p_date_from date, p_date_to date, p_sort text, p_direction text, p_limit integer, p_offset integer';

  if v_definition is null then
    raise exception 'Expected machine_registry_page_scoped signature is missing';
  end if;
  if position('case when has_canonical_warranty and has_active_dealer then ''approved'' when not has_canonical_warranty and not has_active_dealer then ''missing_warranty_and_dealer'' else ''needs_clarification'' end warranty_match_status' in v_definition) = 0
    or position('case when has_canonical_warranty and has_active_dealer then ''approved'' when has_canonical_warranty then ''missing_active_dealer'' when has_active_dealer then ''missing_warranty_registration'' else ''missing_warranty_and_active_dealer'' end warranty_match_detail' in v_definition) = 0
    or position('), assessed as (' in v_definition) = 0
    or position('), counts as (' in v_definition) = 0
    or position('), assessed as (' in v_definition) > position('), counts as (' in v_definition) then
    raise exception 'Expected canonical status and counter calculation is missing';
  end if;

  v_old := 'wr.machine_model, coalesce(dealer.company_name,wr.dealer_name_snapshot) dealer_name,';
  v_new := $sql$coalesce(correction.machine_model,wr.machine_model) machine_model,
    case when correction.dealer_account_id is not null then corrected_dealer.company_name else coalesce(dealer.company_name,wr.dealer_name_snapshot) end dealer_name,$sql$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected machine model/dealer projection is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'wr.dealer_account_number dealer_number, wr.customer_name,';
  v_new := 'case when correction.dealer_account_id is not null then corrected_dealer.account_number else wr.dealer_account_number end dealer_number, wr.customer_name,';
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected dealer number projection is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'wr.delivery_date, wr.legacy_operating_hours operating_hours,';
  v_new := 'coalesce(correction.delivery_date,wr.delivery_date) delivery_date, wr.legacy_operating_hours operating_hours,';
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected delivery-date projection is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'case when wr.source <> ''legacy_machine_import'' then case when wr.sharepoint_form_id is not null then ''SP-'' || wr.sharepoint_form_id::text else ''SP-'' || coalesce(wr.sharepoint_item_id,left(wr.id::text,8)) end else null end warranty_id,';
  v_new := $sql$case
      when wr.source <> 'legacy_machine_import' then case when wr.sharepoint_form_id is not null then 'SP-' || wr.sharepoint_form_id::text else 'SP-' || coalesce(wr.sharepoint_item_id,left(wr.id::text,8)) end
      when corrected_warranty.id is not null then coalesce(corrected_warranty.certificate_number, 'SP-' || coalesce(corrected_warranty.sharepoint_item_id,left(corrected_warranty.id::text,8)))
      else null
    end warranty_id,$sql$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected warranty projection is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := '(wr.source <> ''legacy_machine_import'') has_canonical_warranty,';
  v_new := '(wr.source <> ''legacy_machine_import'' or corrected_warranty.id is not null) has_canonical_warranty,';
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected canonical warranty predicate is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := '(wr.dealer_match_status=''matched'' and dealer.id is not null and coalesce(dealer.is_active,true) and not coalesce(dealer.is_deleted,false) and not coalesce(dealer.is_blocked,false)) has_active_dealer,';
  v_new := $sql$(case when correction.dealer_account_id is not null then
      corrected_dealer.id is not null
        and coalesce(corrected_dealer.is_active,true)
        and not coalesce(corrected_dealer.is_deleted,false)
        and not coalesce(corrected_dealer.is_blocked,false)
      else (wr.dealer_match_status='matched'
        and dealer.id is not null
        and coalesce(dealer.is_active,true)
        and not coalesce(dealer.is_deleted,false)
        and not coalesce(dealer.is_blocked,false))
    end) has_active_dealer,$sql$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected active dealer predicate is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'left join legacy_commercial lc on lc.normalized_serial = upper(regexp_replace(wr.machine_serial_number,''[^A-Za-z0-9]+'','''',''g''))' || chr(10) ||
    '  left join public.dealer_accounts dealer on dealer.id=wr.dealer_account_id';
  v_new := $sql$left join legacy_commercial lc on lc.normalized_serial = upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g'))
  left join public.machine_registry_corrections correction
    on correction.normalized_serial = upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g'))
  left join public.dealer_accounts corrected_dealer on corrected_dealer.id=correction.dealer_account_id
  left join public.warranty_registrations corrected_warranty
    on corrected_warranty.id=correction.approved_warranty_registration_id
    and corrected_warranty.is_active_in_source
    and corrected_warranty.source <> 'legacy_machine_import'
    and upper(regexp_replace(corrected_warranty.machine_serial_number,'[^A-Za-z0-9]+','','g')) = upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g'))
  left join public.dealer_accounts dealer on dealer.id=wr.dealer_account_id$sql$;
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected canonical source joins are missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'left join public.dealer_accounts importer on importer.account_number=dealer.parent_account_number';
  v_new := 'left join public.dealer_accounts importer on importer.account_number=case when correction.dealer_account_id is not null then corrected_dealer.parent_account_number else dealer.parent_account_number end';
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected importer join is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'and (case when p_allowed_dealers is null then (select public.is_timan_global_warranty()) else wr.dealer_account_number=any(p_allowed_dealers) end)';
  v_new := 'and (case when p_allowed_dealers is null then (select public.is_timan_global_warranty()) else (case when correction.dealer_account_id is not null then corrected_dealer.account_number else wr.dealer_account_number end)=any(p_allowed_dealers) end)';
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected View-as scope predicate is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := '(wr.source<>''legacy_machine_import'') desc,(wr.dealer_account_id is not null) desc,';
  v_new := '(wr.source<>''legacy_machine_import'') desc,(coalesce(correction.dealer_account_id,wr.dealer_account_id) is not null) desc,';
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected canonical source ordering is missing';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  execute v_definition;
end
$migration$;

alter function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer)
  security invoker;
revoke all on function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer) from public, anon;
grant execute on function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer) to authenticated;
