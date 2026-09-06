-- Approved commercial terms live on the canonical partner account. Contract
-- documents remain the historical source for the signed agreement.
alter table public.dealer_accounts
  add column if not exists standard_machine_discount_pct numeric(5,2),
  add column if not exists importer_discount_pct numeric(5,2),
  add column if not exists spare_parts_discount_pct numeric(5,2);

alter table public.dealer_accounts
  drop constraint if exists dealer_accounts_standard_machine_discount_pct_range,
  drop constraint if exists dealer_accounts_importer_discount_pct_range,
  drop constraint if exists dealer_accounts_spare_parts_discount_pct_range;

alter table public.dealer_accounts
  add constraint dealer_accounts_standard_machine_discount_pct_range
    check (standard_machine_discount_pct is null or standard_machine_discount_pct between 0 and 100),
  add constraint dealer_accounts_importer_discount_pct_range
    check (importer_discount_pct is null or importer_discount_pct between 0 and 100),
  add constraint dealer_accounts_spare_parts_discount_pct_range
    check (spare_parts_discount_pct is null or spare_parts_discount_pct between 0 and 100);

create or replace function public.approve_dealer_contract_upload(p_upload_version_id uuid)
returns public.dealer_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  actor jsonb := public.current_app_user_json();
  uv public.dealer_contract_upload_versions;
  result public.dealer_contracts;
  form_terms jsonb;
  standard_discount numeric;
  importer_discount numeric;
  spare_parts_discount numeric;
  canonical_payment_terms text;
begin
  select * into uv from public.dealer_contract_upload_versions where id = p_upload_version_id;
  if uv.id is null then raise exception 'upload version not found'; end if;
  if not public.can_approve_dealer_contract(uv.contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.dealer_contract_upload_versions
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by_user_id = auth.uid(),
      reviewed_by_name = actor ->> 'display_name',
      reviewed_by_email = actor ->> 'email',
      updated_at = now()
  where id = uv.id and status = 'submitted';

  if not found then raise exception 'only submitted uploads can be approved'; end if;

  update public.dealer_contract_upload_versions
  set status = 'superseded', updated_at = now()
  where contract_id = uv.contract_id
    and id <> uv.id
    and status in ('draft', 'changes_requested', 'submitted');

  update public.dealer_contracts
  set contract_status = 'approved',
      status = 'Signed',
      approved_upload_version_id = uv.id,
      approved_at = now(),
      approved_by_user_id = auth.uid(),
      approved_by_name = actor ->> 'display_name',
      approved_by_email = actor ->> 'email',
      signed_at = now(),
      archived_at = coalesce(archived_at, now()),
      updated_at = now()
  where id = uv.contract_id
    and contract_status = 'submitted_for_approval'
  returning * into result;

  if result.id is null then raise exception 'contract cannot be approved from current status'; end if;

  form_terms := coalesce(result.form_data, '{}'::jsonb);
  standard_discount := case
    when coalesce(form_terms ->> 'standardMachineDiscountPct', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then least(100::numeric, greatest(0::numeric, (form_terms ->> 'standardMachineDiscountPct')::numeric))
    else null
  end;
  importer_discount := case
    when coalesce(form_terms ->> 'importerDiscountPct', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then least(100::numeric, greatest(0::numeric, (form_terms ->> 'importerDiscountPct')::numeric))
    else null
  end;
  spare_parts_discount := case
    when coalesce(form_terms ->> 'sparePartsDiscountPct', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then least(100::numeric, greatest(0::numeric, (form_terms ->> 'sparePartsDiscountPct')::numeric))
    else null
  end;
  canonical_payment_terms := case form_terms ->> 'paymentTerm'
    when 'net_30' then 'Net 30 days'
    when 'cbs' then 'CBS - Cash before shipment'
    else 'Standard NET21'
  end;

  -- The approval permission above is the sole authority for this controlled
  -- security-definer write; ordinary partner profile edits cannot alter terms.
  update public.dealer_accounts
  set standard_machine_discount_pct = coalesce(standard_discount, standard_machine_discount_pct),
      importer_discount_pct = coalesce(importer_discount, importer_discount_pct),
      spare_parts_discount_pct = coalesce(spare_parts_discount, spare_parts_discount_pct),
      payment_terms = canonical_payment_terms,
      updated_at = now()
  where (result.dealer_account_id is not null and id = result.dealer_account_id)
     or (result.dealer_account_id is null and account_number = result.dealer_account_number);

  perform public.audit_dealer_contract_event(uv.contract_id, 'approved', jsonb_build_object('upload_version_id', uv.id, 'contract_version', result.contract_version));
  perform public.audit_dealer_contract_event(uv.contract_id, 'archived', jsonb_build_object('dealer_account_number', result.dealer_account_number));
  return result;
end;
$$;

revoke all on function public.approve_dealer_contract_upload(uuid) from public;
grant execute on function public.approve_dealer_contract_upload(uuid) to authenticated;
