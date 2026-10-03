-- Completed demos keep their result/completion fields, but their operational
-- registration details may still be corrected through the canonical edit flow.
create or replace function public.save_crm_demo_registration(
  p_demo_id uuid, p_source_lead_id uuid, p_demo jsonb, p_effective_user_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  actor public.app_users%rowtype := public.crm_demo_effective_actor(p_effective_user_id);
  owner_row public.app_users%rowtype;
  lead_row public.crm_leads%rowtype;
  demo public.crm_demo_leads%rowtype;
  dealer public.dealer_accounts%rowtype;
  owner_id uuid := nullif(p_demo->>'owner_user_id','')::uuid;
  dealer_id uuid := nullif(p_demo->>'dealer_account_id','')::uuid;
  contact_id uuid := nullif(p_demo->>'dealer_rep_contact_id','')::uuid;
  person_id uuid := nullif(p_demo->>'dealer_rep_user_id','')::uuid;
  representative text := nullif(p_demo->>'dealer_rep','');
  payload jsonb; result jsonb;
begin
  if nullif(btrim(p_demo->>'title'),'') is null or nullif(p_demo->>'demo_date','') is null then
    raise exception using errcode='23514', message='DEMO_DATE_AND_TITLE_REQUIRED';
  end if;
  if p_demo_id is not null then
    select * into demo from crm_demo_leads where id=p_demo_id for update;
    if not found or demo.source_lead_id is distinct from p_source_lead_id then
      raise exception using errcode='42501', message='DEMO_OUTSIDE_SCOPE';
    end if;
  end if;
  if p_source_lead_id is not null then
    select * into lead_row from crm_leads where id=p_source_lead_id for update;
    if not found or (coalesce(actor.portal_role::text,actor.role)='timan_seller' and lead_row.owner_user_id is distinct from actor.id) then
      raise exception using errcode='42501', message='DEMO_LEAD_OUTSIDE_SCOPE';
    end if;
  end if;
  if coalesce(actor.portal_role::text,actor.role)='timan_seller' and owner_id is distinct from actor.id then
    raise exception using errcode='42501', message='DEMO_OWNER_OUTSIDE_SCOPE';
  end if;
  select * into owner_row from app_users where id=owner_id and approved and is_active
    and coalesce(portal_role::text,role) in ('timan_seller','timan_backend','timan_service');
  if not found then raise exception using errcode='42501', message='DEMO_OWNER_OUTSIDE_SCOPE'; end if;
  select * into dealer from dealer_accounts where id=dealer_id and deleted_at is null;
  if not found then raise exception using errcode='42501', message='DEMO_DEALER_OUTSIDE_SCOPE'; end if;
  if coalesce(actor.portal_role::text,actor.role)='timan_seller' and not exists (
    select 1 from dealer_accounts scoped
    where (scoped.id=dealer.id or scoped.account_number=dealer.parent_account_number)
      and (scoped.assigned_seller_id=actor.id or lower(scoped.assigned_seller_email)=lower(actor.email)
        or upper(actor.initials)=any(regexp_split_to_array(upper(coalesce(scoped.assigned_seller_initials,'')), '[^A-Z0-9]+')))
  ) then raise exception using errcode='42501', message='DEMO_DEALER_OUTSIDE_SCOPE'; end if;
  if num_nonnulls(contact_id,person_id)>1 then raise exception using errcode='22023', message='DEALER_REP_REFERENCE_CONFLICT'; end if;
  if contact_id is not null then
    select coalesce(nullif(name,''),email) into representative from dealer_contacts where id=contact_id and dealer_account_id=dealer_id;
    if not found then raise exception using errcode='42501', message='DEALER_REP_OUTSIDE_DEALER'; end if;
  elsif person_id is not null then
    select coalesce(nullif(display_name,''),full_name,email) into representative from app_users
      where id=person_id and dealer_number=dealer.account_number and approved and is_active;
    if not found then raise exception using errcode='42501', message='DEALER_REP_OUTSIDE_DEALER'; end if;
  end if;
  if lead_row.id is not null then
    update crm_leads set owner_user_id=owner_row.id, owner_name=coalesce(owner_row.display_name,owner_row.full_name,owner_row.email),
      owner_email=owner_row.email, linked_dealer_id=dealer.id where id=lead_row.id;
  end if;
  payload := p_demo || jsonb_build_object('owner_user_id',owner_row.id,
    'dealer_company',dealer.company_name, 'dealer_country',dealer.country,
    'interest_level',null, 'wants_offer',null, 'competitors_present',null,
    'competitor_name',null, 'estimated_value',null, 'probability',null,
    'result_status',null, 'notes_after_demo',null, 'update_followup',false, 'followup_date',null);
  if p_demo_id is null then
    result := public.create_crm_demo_lifecycle_with_representative(p_source_lead_id,payload);
    update crm_demo_leads set probability=null where id=(result->>'demo_id')::uuid;
    return result;
  end if;
  update crm_demo_leads set title=btrim(payload->>'title'), demo_date=(payload->>'demo_date')::date,
    owner_user_id=owner_row.id, owner_name=coalesce(owner_row.display_name,owner_row.full_name,owner_row.email), owner_email=owner_row.email,
    dealer_account_id=dealer.id, dealer_company=dealer.company_name, dealer_country=dealer.country,
    dealer_rep=representative, dealer_rep_contact_id=contact_id, dealer_rep_user_id=person_id,
    customer_name=nullif(payload->>'customer_name',''), customer_address=nullif(payload->>'customer_address',''),
    notes=nullif(payload->>'notes',''), machine_category=array(select jsonb_array_elements_text(payload->'machine_category')),
    demo_machine=nullif(payload->>'demo_machine',''), demo_equipment=array(select jsonb_array_elements_text(payload->'demo_equipment')),
    attachments=coalesce(payload->'attachments','[]'::jsonb)
  where id=p_demo_id returning * into demo;
  return jsonb_build_object('lead_id',lead_row.id,'lead_no',lead_row.lead_no,'demo_id',demo.id,'demo_no',demo.demo_no,'demo_date',demo.demo_date);
end;
$$;

revoke all on function public.save_crm_demo_registration(uuid,uuid,jsonb,uuid) from public, anon;
grant execute on function public.save_crm_demo_registration(uuid,uuid,jsonb,uuid) to authenticated;
