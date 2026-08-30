-- Server-side persistence for the guided dealer contract flow.
--
-- Stores progress, confirmations, party data, signature and final snapshot so
-- a signed contract remains locked after reload/logout and does not depend on
-- React state or localStorage.

create table if not exists public.dealer_contracts (
  id uuid primary key default gen_random_uuid(),
  draft_key text not null unique,
  dealer_account_number text,
  owner_auth_user_id uuid default auth.uid(),
  owner_email text not null,
  owner_name text,
  current_step text not null default 'parties',
  completed_steps text[] not null default '{}',
  confirmations jsonb not null default '{}'::jsonb,
  form_data jsonb not null default '{}'::jsonb,
  contract_version text not null,
  final_snapshot jsonb,
  signature_data_url text,
  status text not null default 'Draft',
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_contracts_status_check check (
    status in ('Draft', 'In review', 'Ready for signature', 'Signed', 'Archived')
  )
);

create index if not exists dealer_contracts_owner_email_idx
  on public.dealer_contracts (lower(owner_email), updated_at desc);

create index if not exists dealer_contracts_dealer_account_number_idx
  on public.dealer_contracts (dealer_account_number)
  where dealer_account_number is not null;

create index if not exists dealer_contracts_status_idx
  on public.dealer_contracts (status, updated_at desc);

alter table public.dealer_contracts enable row level security;

revoke all on public.dealer_contracts from anon, public;
grant select, insert, update on public.dealer_contracts to authenticated;
grant all on public.dealer_contracts to service_role;

drop policy if exists dealer_contracts_select_owner_or_backend on public.dealer_contracts;
create policy dealer_contracts_select_owner_or_backend
on public.dealer_contracts
for select
to authenticated
using (
  owner_auth_user_id = (select auth.uid())
  or lower(owner_email) = lower(coalesce((select auth.email()), ''))
  or public.is_timan_backend()
);

drop policy if exists dealer_contracts_insert_owner_or_backend on public.dealer_contracts;
create policy dealer_contracts_insert_owner_or_backend
on public.dealer_contracts
for insert
to authenticated
with check (
  owner_auth_user_id = (select auth.uid())
  or lower(owner_email) = lower(coalesce((select auth.email()), ''))
  or public.is_timan_backend()
);

drop policy if exists dealer_contracts_update_owner_or_backend on public.dealer_contracts;
create policy dealer_contracts_update_owner_or_backend
on public.dealer_contracts
for update
to authenticated
using (
  owner_auth_user_id = (select auth.uid())
  or lower(owner_email) = lower(coalesce((select auth.email()), ''))
  or public.is_timan_backend()
)
with check (
  owner_auth_user_id = (select auth.uid())
  or lower(owner_email) = lower(coalesce((select auth.email()), ''))
  or public.is_timan_backend()
);

create or replace function public.prevent_signed_dealer_contract_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'Signed' and (
    new.current_step is distinct from old.current_step
    or new.completed_steps is distinct from old.completed_steps
    or new.confirmations is distinct from old.confirmations
    or new.form_data is distinct from old.form_data
    or new.contract_version is distinct from old.contract_version
    or new.final_snapshot is distinct from old.final_snapshot
    or new.signature_data_url is distinct from old.signature_data_url
    or new.status is distinct from old.status
    or new.signed_at is distinct from old.signed_at
  ) then
    raise exception 'Signed dealer contracts are locked';
  end if;

  new.updated_at := now();
  if new.status = 'Signed' and old.status is distinct from 'Signed' and new.signed_at is null then
    new.signed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_signed_dealer_contract_update_trigger on public.dealer_contracts;
create trigger prevent_signed_dealer_contract_update_trigger
before update on public.dealer_contracts
for each row
execute function public.prevent_signed_dealer_contract_update();

create or replace function public.audit_dealer_contract_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  a record;
  old_payload jsonb;
  new_payload jsonb;
  changed text[];
begin
  select * into a from public.audit_current_actor();

  if tg_op = 'INSERT' then
    old_payload := null;
    new_payload := jsonb_build_object(
      'status', new.status,
      'current_step', new.current_step,
      'completed_steps', new.completed_steps,
      'confirmations', new.confirmations,
      'contract_version', new.contract_version,
      'has_final_snapshot', new.final_snapshot is not null,
      'has_signature', new.signature_data_url is not null,
      'dealer_account_number', new.dealer_account_number
    );
  else
    old_payload := jsonb_build_object(
      'status', old.status,
      'current_step', old.current_step,
      'completed_steps', old.completed_steps,
      'confirmations', old.confirmations,
      'contract_version', old.contract_version,
      'has_final_snapshot', old.final_snapshot is not null,
      'has_signature', old.signature_data_url is not null,
      'dealer_account_number', old.dealer_account_number
    );
    new_payload := jsonb_build_object(
      'status', new.status,
      'current_step', new.current_step,
      'completed_steps', new.completed_steps,
      'confirmations', new.confirmations,
      'contract_version', new.contract_version,
      'has_final_snapshot', new.final_snapshot is not null,
      'has_signature', new.signature_data_url is not null,
      'dealer_account_number', new.dealer_account_number
    );
  end if;

  changed := public.audit_changed_fields(old_payload, new_payload);
  if tg_op = 'UPDATE' and coalesce(array_length(changed, 1), 0) = 0 then
    return new;
  end if;

  insert into public.audit_log (
    actor_user_id,
    actor_email,
    actor_name,
    actor_role,
    action,
    module,
    record_type,
    record_id,
    record_label,
    old_value,
    new_value,
    changed_fields,
    status
  )
  values (
    a.actor_user_id,
    coalesce(a.actor_email, (select auth.email())),
    a.actor_name,
    a.actor_role,
    lower(tg_op),
    'contracts',
    'dealer_contracts',
    new.id::text,
    coalesce(new.form_data ->> 'dealerName', new.dealer_account_number, new.owner_email),
    old_payload,
    new_payload,
    changed,
    'success'
  );

  return new;
end;
$$;

drop trigger if exists audit_dealer_contract_change_trigger on public.dealer_contracts;
create trigger audit_dealer_contract_change_trigger
after insert or update on public.dealer_contracts
for each row
execute function public.audit_dealer_contract_change();

grant execute on function public.prevent_signed_dealer_contract_update() to authenticated;
grant execute on function public.audit_dealer_contract_change() to authenticated;
