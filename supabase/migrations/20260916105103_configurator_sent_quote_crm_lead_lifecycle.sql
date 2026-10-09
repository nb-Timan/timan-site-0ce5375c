-- A sent Configurator quote is an active commercial opportunity. Keep one
-- canonical CRM lead per configuration, regardless of whether the user
-- explicitly picked/created a lead before sending the quote.
create or replace function public.ensure_sent_configuration_quote_lead(
  p_configuration_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_configuration public.configurations;
  v_lead_id uuid;
  v_country text;
  v_machine_types text[];
  v_contact_information text;
  v_created_by_app_user_id uuid;
begin
  select *
    into v_configuration
    from public.configurations
   where id = p_configuration_id
   for update;

  if not found
     or v_configuration.quote_sent_at is null
     or v_configuration.order_sent_at is not null
     or v_configuration.submitted_at is not null
     or coalesce(lower(v_configuration.document_type), lower(v_configuration.case_type), '') = 'order'
     or coalesce(lower(v_configuration.case_status), '') = 'deleted' then
    return null;
  end if;

  v_lead_id := v_configuration.lead_id;

  if v_lead_id is null then
    select country
      into v_country
      from public.dealer_accounts
     where id = v_configuration.dealer_account_id;

    select coalesce(array_agg(distinct machine_type order by machine_type), '{}'::text[])
      into v_machine_types
      from (
        select nullif(btrim(machine ->> 'type'), '') as machine_type
          from jsonb_array_elements(coalesce(v_configuration.state_json -> 'machineConfigs', '[]'::jsonb)) as machine
      ) machine_rows
     where machine_type is not null;

    v_contact_information := concat_ws(E'\n',
      case when nullif(btrim(coalesce(v_configuration.state_json ->> 'firmanavn', v_configuration.customer_company, v_configuration.customer_name, '')), '') is not null
        then 'Firma/CVR: ' || coalesce(v_configuration.state_json ->> 'firmanavn', v_configuration.customer_company, v_configuration.customer_name) end,
      case when nullif(btrim(coalesce(v_configuration.state_json ->> 'kontaktperson', '')), '') is not null
        then 'Kontaktperson: ' || (v_configuration.state_json ->> 'kontaktperson') end,
      case when nullif(btrim(coalesce(v_configuration.state_json ->> 'telefon', '')), '') is not null
        then 'Telefon: ' || (v_configuration.state_json ->> 'telefon') end,
      case when nullif(btrim(coalesce(v_configuration.state_json ->> 'email', '')), '') is not null
        then 'E-mail: ' || (v_configuration.state_json ->> 'email') end,
      case when nullif(btrim(coalesce(v_country, '')), '') is not null
        then 'Land: ' || v_country end
    );

    -- Older Configurator records can retain the Supabase auth id here,
    -- while crm_leads correctly references app_users.id.
    select u.id
      into v_created_by_app_user_id
      from public.app_users u
     where u.id = v_configuration.created_by_user_id
        or u.auth_user_id = v_configuration.created_by_user_id
        or (
          v_configuration.created_by_user_id is null
          and nullif(btrim(v_configuration.created_by_email), '') is not null
          and lower(u.email) = lower(v_configuration.created_by_email)
        )
     order by case
       when u.id = v_configuration.created_by_user_id then 1
       when u.auth_user_id = v_configuration.created_by_user_id then 2
       else 3
     end
     limit 1;

    insert into public.crm_leads (
      title,
      owner_user_id,
      owner_name,
      owner_email,
      linked_dealer_id,
      first_contact_date,
      expected_close_date,
      next_followup_date,
      machine_types,
      next_activity,
      contact_information,
      country,
      notes,
      estimated_value,
      pipeline_value_snapshot,
      pipeline_value_snapshot_reason,
      pipeline_value_snapshot_updated_at,
      probability,
      pipeline_stage,
      status,
      incomplete_from_configurator,
      created_by_user_id
    ) values (
      coalesce(
        nullif(btrim(v_configuration.state_json ->> 'firmanavn'), ''),
        nullif(btrim(v_configuration.customer_company), ''),
        nullif(btrim(v_configuration.customer_name), ''),
        nullif(btrim(v_configuration.dealer_name), ''),
        nullif(btrim(v_configuration.title), ''),
        'Configurator tilbud'
      ),
      v_configuration.assigned_seller_id,
      coalesce(nullif(btrim(v_configuration.seller_name), ''), nullif(btrim(v_configuration.seller_initials), '')),
      nullif(btrim(v_configuration.seller_email), ''),
      v_configuration.dealer_account_id,
      v_configuration.quote_sent_at::date,
      v_configuration.delivery_date,
      null,
      v_machine_types,
      'Offer sent to the customer',
      nullif(v_contact_information, ''),
      v_country,
      'Tilbud afgivet via konfiguratoren' || case when v_configuration.quote_number is not null then ' — ' || v_configuration.quote_number else '' end,
      coalesce(v_configuration.total_price, 0),
      coalesce(v_configuration.total_price, 0),
      'configurator_sent_quote',
      now(),
      70,
      'Offer sent',
      'open',
      false,
      v_created_by_app_user_id
    ) returning id into v_lead_id;

    update public.configurations
       set lead_id = v_lead_id,
           updated_at = now()
     where id = v_configuration.id
       and lead_id is null;
  else
    -- A manually closed lead is authoritative. A quote re-send must never
    -- reopen a lead already marked Won or Lost.
    update public.crm_leads
       set next_activity = 'Offer sent to the customer',
           probability = 70,
           pipeline_stage = 'Offer sent',
           status = 'open',
           incomplete_from_configurator = false,
           updated_at = now()
     where id = v_lead_id
       and coalesce(status, 'open') <> 'closed'
       and coalesce(pipeline_stage, '') not in ('Won', 'Lost')
       and coalesce(next_activity, '') not in ('Closed with order', 'Closed without order', 'Not relevant')
       and (
         next_activity is distinct from 'Offer sent to the customer'
         or probability is distinct from 70
         or pipeline_stage is distinct from 'Offer sent'
         or status is distinct from 'open'
         or incomplete_from_configurator is distinct from false
       );
  end if;

  return v_lead_id;
end;
$$;

create or replace function public.sync_sent_configuration_quote_to_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_sent_configuration_quote_lead(new.id);
  return new;
end;
$$;

drop trigger if exists sync_sent_configuration_quote_to_lead on public.configurations;
create trigger sync_sent_configuration_quote_to_lead
  after insert or update of quote_sent_at, lead_id, order_sent_at, submitted_at, document_type, case_status, status
  on public.configurations
  for each row execute function public.sync_sent_configuration_quote_to_lead();

-- One-time, idempotent repair for sent active quotes created before the
-- lifecycle trigger existed. The function locks each configuration row and
-- never creates a second lead once lead_id is present.
select public.ensure_sent_configuration_quote_lead(id)
  from public.configurations
 where quote_sent_at is not null
   and order_sent_at is null
   and submitted_at is null
   and coalesce(lower(document_type), lower(case_type), '') <> 'order'
   and coalesce(lower(case_status), '') <> 'deleted';

revoke all on function public.ensure_sent_configuration_quote_lead(uuid) from public, anon, authenticated;
revoke all on function public.sync_sent_configuration_quote_to_lead() from public, anon, authenticated;
