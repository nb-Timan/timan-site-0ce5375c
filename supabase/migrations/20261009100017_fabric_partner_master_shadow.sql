-- Independent imported shadow: no Portal masterdata writes or existing policy changes.
create table public.fabric_partner_master_shadow (
  company text not null check(company='DAT'),
  account_number text not null check(account_number=btrim(account_number) and length(account_number)>0),
  account_raw text not null,
  company_name text,
  address1 text,
  address2 text,
  postal_code text,
  city text,
  zipcity_raw text,
  zipcity_validation text not null check(zipcity_validation in ('EMPTY','PARSED_DK','REVIEW_REQUIRED')),
  country text,
  iso_country text,
  phone text,
  email text,
  c5_invoice_account_number text,
  c5_group text,
  c5_partner_type_code text,
  c5_salesrep text,
  language integer,
  vat_number text,
  currency text,
  payment text,
  c5_blocked integer,
  c5_approved integer,
  source_row_number bigint not null,
  source_last_changed timestamp without time zone,
  synced_at timestamptz not null,
  source_present boolean not null default true,
  primary key(company,source_row_number)
);
create index fabric_partner_shadow_account_idx on public.fabric_partner_master_shadow(company,account_number) where source_present;
create table public.fabric_partner_shadow_runs (
  snapshot_id uuid primary key,
  source_as_of timestamptz not null,
  fingerprint text not null,
  row_count integer not null check(row_count>0),
  completed_at timestamptz not null default now()
);
create table public.fabric_partner_shadow_state (
  singleton boolean primary key default true check(singleton),
  last_success_at timestamptz,
  source_as_of timestamptz,
  row_count integer not null default 0,
  last_error text,
  last_error_at timestamptz
);
insert into public.fabric_partner_shadow_state(singleton) values(true);
alter table public.fabric_partner_master_shadow enable row level security;
alter table public.fabric_partner_shadow_runs enable row level security;
alter table public.fabric_partner_shadow_state enable row level security;
revoke all on public.fabric_partner_master_shadow,public.fabric_partner_shadow_runs,public.fabric_partner_shadow_state from public,anon,authenticated,service_role;

create function public.fabric_partner_shadow_ingest(p_snapshot_id uuid,p_source_as_of timestamptz,p_rows jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  prior public.fabric_partner_shadow_runs%rowtype;
  state public.fabric_partner_shadow_state%rowtype;
  amount integer;
  fingerprint text;
begin
  if p_snapshot_id is null or p_source_as_of is null or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'INVALID_SNAPSHOT'; end if;
  amount:=jsonb_array_length(p_rows);
  if amount<1 or amount>10000 then raise exception 'INVALID_SNAPSHOT'; end if;
  if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
  fingerprint:=md5(p_rows::text);
  select * into prior from public.fabric_partner_shadow_runs where snapshot_id=p_snapshot_id;
  if found then
    if prior.fingerprint<>fingerprint or prior.source_as_of<>p_source_as_of then raise exception 'SNAPSHOT_CONFLICT'; end if;
    return prior.row_count;
  end if;
  if p_source_as_of<now()-interval '10 minutes' or p_source_as_of>now()+interval '1 minute' then raise exception 'STALE_SNAPSHOT'; end if;
  select * into state from public.fabric_partner_shadow_state where singleton for update;
  if state.source_as_of is not null and p_source_as_of<=state.source_as_of then raise exception 'STALE_SNAPSHOT'; end if;
  if state.row_count>0 and amount<state.row_count*0.9 then raise exception 'SNAPSHOT_SHRINK_REVIEW_REQUIRED'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object'
    or (select count(*) from jsonb_object_keys(r))<>26
    or not r ?& array['company','account_number','account_raw','company_name','address1','address2','postal_code','city','zipcity_raw','zipcity_validation','country','iso_country','phone','email','c5_invoice_account_number','c5_group','c5_partner_type_code','c5_salesrep','language','vat_number','currency','payment','c5_blocked','c5_approved','source_row_number','source_last_changed']
    or r->>'company'<>'DAT' or coalesce(r->>'account_number','')=''
    or r->>'account_number'<>btrim(r->>'account_number')
    or jsonb_typeof(r->'account_number')<>'string' or jsonb_typeof(r->'account_raw')<>'string'
    or coalesce(r->>'source_row_number','')!~'^-?[0-9]+$'
    or r->>'zipcity_validation' not in ('EMPTY','PARSED_DK','REVIEW_REQUIRED')
    or exists(select 1 from jsonb_each(r) v where jsonb_typeof(v.value)='string' and length(v.value#>>'{}')>2000)
  ) then raise exception 'INVALID_SOURCE_ROW'; end if;
  if (select count(distinct r->>'source_row_number') from jsonb_array_elements(p_rows) r)<>amount then raise exception 'DUPLICATE_SOURCE_ROW'; end if;
  -- Retain absent source rows as provenance, never delete business records.
  update public.fabric_partner_master_shadow set source_present=false where company='DAT' and source_present;
  insert into public.fabric_partner_master_shadow(company,account_number,account_raw,company_name,address1,address2,postal_code,city,zipcity_raw,zipcity_validation,country,iso_country,phone,email,c5_invoice_account_number,c5_group,c5_partner_type_code,c5_salesrep,language,vat_number,currency,payment,c5_blocked,c5_approved,source_row_number,source_last_changed,synced_at,source_present)
    select company,account_number,account_raw,company_name,address1,address2,postal_code,city,zipcity_raw,zipcity_validation,country,iso_country,phone,email,c5_invoice_account_number,c5_group,c5_partner_type_code,c5_salesrep,language,vat_number,currency,payment,c5_blocked,c5_approved,source_row_number,source_last_changed,now(),true from jsonb_to_recordset(p_rows) as r(company text,account_number text,account_raw text,company_name text,address1 text,address2 text,postal_code text,city text,zipcity_raw text,zipcity_validation text,country text,iso_country text,phone text,email text,c5_invoice_account_number text,c5_group text,c5_partner_type_code text,c5_salesrep text,language integer,vat_number text,currency text,payment text,c5_blocked integer,c5_approved integer,source_row_number bigint,source_last_changed timestamp without time zone)
    on conflict(company,source_row_number) do update set
    account_number=excluded.account_number,account_raw=excluded.account_raw,company_name=excluded.company_name,address1=excluded.address1,address2=excluded.address2,postal_code=excluded.postal_code,city=excluded.city,zipcity_raw=excluded.zipcity_raw,zipcity_validation=excluded.zipcity_validation,country=excluded.country,iso_country=excluded.iso_country,phone=excluded.phone,email=excluded.email,c5_invoice_account_number=excluded.c5_invoice_account_number,c5_group=excluded.c5_group,c5_partner_type_code=excluded.c5_partner_type_code,c5_salesrep=excluded.c5_salesrep,language=excluded.language,vat_number=excluded.vat_number,currency=excluded.currency,payment=excluded.payment,c5_blocked=excluded.c5_blocked,c5_approved=excluded.c5_approved,source_last_changed=excluded.source_last_changed,
    synced_at=excluded.synced_at,source_present=true;
  insert into public.fabric_partner_shadow_runs(snapshot_id,source_as_of,fingerprint,row_count) values(p_snapshot_id,p_source_as_of,fingerprint,amount);
  update public.fabric_partner_shadow_state set last_success_at=now(),source_as_of=p_source_as_of,row_count=amount,last_error=null,last_error_at=null where singleton;
  return amount;
end $$;
revoke all on function public.fabric_partner_shadow_ingest(uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.fabric_partner_shadow_ingest(uuid,timestamptz,jsonb) to service_role;

create function public.fabric_partner_shadow_record_failure()
returns void language sql security definer set search_path=pg_catalog,public as $$
  update public.fabric_partner_shadow_state set last_error='SYNC_FAILED',last_error_at=now() where singleton;
$$;
revoke all on function public.fabric_partner_shadow_record_failure() from public,anon,authenticated;
grant execute on function public.fabric_partner_shadow_record_failure() to service_role;

create function public.fabric_partner_shadow_preview()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_backend() then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  return jsonb_build_object(
    'state',(select to_jsonb(s) from public.fabric_partner_shadow_state s where singleton),
    'shadow',coalesce((select jsonb_agg(to_jsonb(s) order by s.account_number,s.source_row_number) from public.fabric_partner_master_shadow s where s.source_present),'[]'::jsonb),
    'portal',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'account_number',d.account_number,'company_name',d.company_name,
      'address_line_1',coalesce(d.address_line_1,d.address),'address_line_2',d.address_line_2,
      'postal_code',d.postal_code,'city',d.city,'country',d.country,'phone',d.phone,'email',d.email,
      'billing_account_number',b.account_number,'customer_type_label',d.customer_type_label,
      'customer_type',d.customer_type,'dealer_type',d.dealer_type,'assigned_seller_initials',d.assigned_seller_initials
    ) order by d.account_number) from public.dealer_accounts d left join public.dealer_accounts b on b.id=d.billing_account_id),'[]'::jsonb)
  );
end $$;
revoke all on function public.fabric_partner_shadow_preview() from public,anon,service_role;
grant execute on function public.fabric_partner_shadow_preview() to authenticated;
