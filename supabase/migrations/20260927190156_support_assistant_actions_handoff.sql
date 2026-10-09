-- Timan Assistant Phase 7: controlled actions, confirmations and human handoff.
-- Canonical quotes, leads, PDFs and mail remain in their existing systems.

create table public.support_assistant_workflows (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete restrict,
  state_json jsonb not null default '{}'::jsonb,
  state_hash text not null,
  state_version integer not null default 1 check (state_version > 0),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'READY', 'QUOTE_CREATED', 'PDF_GENERATED', 'EMAIL_PREPARED',
    'EMAIL_SENT', 'HANDED_OFF', 'ABANDONED', 'FAILED'
  )),
  dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  dealer_number text,
  dealer_contact_id uuid references public.dealer_contacts(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  configuration_id uuid references public.configurations(id) on delete set null,
  quote_number text,
  pricing_snapshot jsonb,
  email_draft jsonb,
  last_calculated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table public.support_assistant_confirmations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references public.app_users(id) on delete restrict,
  workflow_id uuid not null references public.support_assistant_workflows(id) on delete restrict,
  action_type text not null,
  confirmation_level integer not null check (confirmation_level in (2, 3)),
  state_version integer not null check (state_version > 0),
  parameters_hash text not null,
  confirmed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > confirmed_at)
);

create table public.support_assistant_actions (
  action_id uuid primary key,
  idempotency_key text not null,
  user_id uuid not null references public.app_users(id) on delete restrict,
  conversation_id uuid not null references public.support_conversations(id) on delete restrict,
  workflow_id uuid references public.support_assistant_workflows(id) on delete restrict,
  action_type text not null,
  confirmation_level integer not null check (confirmation_level between 0 and 3),
  state_version integer,
  request_hash text not null,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  permission_result jsonb not null default '{}'::jsonb,
  result jsonb,
  affected_entity_type text,
  affected_entity_id uuid,
  sanitized_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create table public.support_assistant_action_audit (
  id bigint generated always as identity primary key,
  action_id uuid,
  user_id uuid not null references public.app_users(id) on delete restrict,
  conversation_id uuid not null references public.support_conversations(id) on delete restrict,
  workflow_id uuid references public.support_assistant_workflows(id) on delete restrict,
  event_type text not null check (event_type in (
    'USER_REQUEST', 'AI_INTERPRETATION', 'SYSTEM_CALCULATION',
    'USER_CONFIRMATION', 'ACTION_EXECUTED', 'ACTION_FAILED'
  )),
  action_type text not null,
  confirmation_level integer not null check (confirmation_level between 0 and 3),
  state_version integer,
  permission_result jsonb not null default '{}'::jsonb,
  parameters jsonb not null default '{}'::jsonb,
  result jsonb,
  affected_entity_type text,
  affected_entity_id uuid,
  sanitized_error text,
  created_at timestamptz not null default now()
);

create table public.support_assistant_handoffs (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null,
  workflow_id uuid not null references public.support_assistant_workflows(id) on delete restrict,
  conversation_id uuid not null references public.support_conversations(id) on delete restrict,
  requested_by_user_id uuid not null references public.app_users(id) on delete restrict,
  target text not null check (target in ('SALES', 'TECHNICAL_SERVICE')),
  reason_code text not null,
  summary text not null,
  authorized_context jsonb not null default '{}'::jsonb,
  configuration_id uuid references public.configurations(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  -- Reserved for a future canonical service-ticket relation. The production
  -- portal currently has no public.service_tickets table.
  service_ticket_id uuid,
  status text not null default 'OPEN' check (status in ('OPEN', 'ACCEPTED', 'RESOLVED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_id)
);

create index support_assistant_workflows_user_idx
  on public.support_assistant_workflows (user_id, updated_at desc);
create index support_assistant_actions_workflow_idx
  on public.support_assistant_actions (workflow_id, started_at desc);
create index support_assistant_actions_status_idx
  on public.support_assistant_actions (status, started_at) where status = 'RUNNING';
create index support_assistant_audit_workflow_idx
  on public.support_assistant_action_audit (workflow_id, created_at, id);
create index support_assistant_audit_action_idx
  on public.support_assistant_action_audit (action_id, created_at, id);
create index support_assistant_handoffs_target_idx
  on public.support_assistant_handoffs (target, status, created_at desc);
create index support_assistant_confirmations_lookup_idx
  on public.support_assistant_confirmations (workflow_id, action_type, state_version, expires_at desc);

create trigger support_assistant_workflows_touch_updated_at
before update on public.support_assistant_workflows
for each row execute function public.support_touch_updated_at();

create trigger support_assistant_handoffs_touch_updated_at
before update on public.support_assistant_handoffs
for each row execute function public.support_touch_updated_at();

create or replace function public.support_prevent_action_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Assistant action audit is append-only' using errcode = '42501';
end;
$$;

create trigger support_assistant_action_audit_immutable
before update or delete on public.support_assistant_action_audit
for each row execute function public.support_prevent_action_audit_mutation();

revoke all on function public.support_prevent_action_audit_mutation() from public, anon, authenticated;
grant execute on function public.support_prevent_action_audit_mutation() to service_role;

alter table public.support_assistant_workflows enable row level security;
alter table public.support_assistant_confirmations enable row level security;
alter table public.support_assistant_actions enable row level security;
alter table public.support_assistant_action_audit enable row level security;
alter table public.support_assistant_handoffs enable row level security;

revoke all on public.support_assistant_workflows from public, anon, authenticated;
revoke all on public.support_assistant_confirmations from public, anon, authenticated;
revoke all on public.support_assistant_actions from public, anon, authenticated;
revoke all on public.support_assistant_action_audit from public, anon, authenticated;
revoke all on public.support_assistant_handoffs from public, anon, authenticated;
revoke all on sequence public.support_assistant_action_audit_id_seq from public, anon, authenticated;

grant all on public.support_assistant_workflows to service_role;
grant all on public.support_assistant_confirmations to service_role;
grant all on public.support_assistant_actions to service_role;
grant all on public.support_assistant_action_audit to service_role;
grant all on public.support_assistant_handoffs to service_role;
grant usage, select on sequence public.support_assistant_action_audit_id_seq to service_role;

create or replace function public.support_claim_assistant_action(
  p_action_id uuid,
  p_idempotency_key text,
  p_user_id uuid,
  p_conversation_id uuid,
  p_workflow_id uuid,
  p_action_type text,
  p_confirmation_level integer,
  p_expected_state_version integer,
  p_request_hash text,
  p_permission_result jsonb
)
returns table (decision text, existing_action_id uuid, existing_status text, existing_result jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.support_assistant_actions%rowtype;
  v_workflow public.support_assistant_workflows%rowtype;
begin
  select * into v_existing
    from public.support_assistant_actions
   where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.action_type <> p_action_type or v_existing.request_hash <> p_request_hash then
      return query select 'CONFLICT', v_existing.action_id, v_existing.status,
        jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED');
      return;
    end if;
    return query select 'DUPLICATE', v_existing.action_id, v_existing.status, v_existing.result;
    return;
  end if;

  if p_workflow_id is not null then
    select * into v_workflow
      from public.support_assistant_workflows
     where id = p_workflow_id and user_id = p_user_id
     for update;
    if not found then
      return query select 'NOT_FOUND', null::uuid, null::text, null::jsonb;
      return;
    end if;
    if p_expected_state_version is not null and v_workflow.state_version <> p_expected_state_version then
      return query select 'STALE', null::uuid, null::text,
        jsonb_build_object('current_state_version', v_workflow.state_version);
      return;
    end if;
  end if;

  insert into public.support_assistant_actions (
    action_id, idempotency_key, user_id, conversation_id, workflow_id,
    action_type, confirmation_level, state_version, request_hash, permission_result
  ) values (
    p_action_id, p_idempotency_key, p_user_id, p_conversation_id, p_workflow_id,
    p_action_type, p_confirmation_level, p_expected_state_version, p_request_hash,
    coalesce(p_permission_result, '{}'::jsonb)
  );
  return query select 'CLAIMED', p_action_id, 'RUNNING', null::jsonb;
end;
$$;

revoke all on function public.support_claim_assistant_action(
  uuid, text, uuid, uuid, uuid, text, integer, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.support_claim_assistant_action(
  uuid, text, uuid, uuid, uuid, text, integer, integer, text, jsonb
) to service_role;

create or replace function public.support_consume_assistant_confirmation(
  p_token_hash text,
  p_user_id uuid,
  p_workflow_id uuid,
  p_action_type text,
  p_state_version integer,
  p_parameters_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_confirmation_id uuid;
begin
  update public.support_assistant_confirmations
     set consumed_at = now()
   where token_hash = p_token_hash
     and user_id = p_user_id
     and workflow_id = p_workflow_id
     and action_type = p_action_type
     and state_version = p_state_version
     and parameters_hash = p_parameters_hash
     and consumed_at is null
     and invalidated_at is null
     and expires_at > now()
  returning id into v_confirmation_id;
  return v_confirmation_id is not null;
end;
$$;

revoke all on function public.support_consume_assistant_confirmation(
  text, uuid, uuid, text, integer, text
) from public, anon, authenticated;
grant execute on function public.support_consume_assistant_confirmation(
  text, uuid, uuid, text, integer, text
) to service_role;

create or replace function public.get_support_action_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_support() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'configuration_started', (select count(*) from public.support_assistant_action_audit where action_type = 'create_configuration_draft' and event_type = 'ACTION_EXECUTED'),
    'configuration_completed', (select count(*) from public.support_assistant_workflows where status in ('READY', 'QUOTE_CREATED', 'PDF_GENERATED', 'EMAIL_PREPARED', 'EMAIL_SENT')),
    'quote_previewed', (select count(*) from public.support_assistant_action_audit where action_type = 'calculate_quote_preview' and event_type = 'SYSTEM_CALCULATION'),
    'quote_created', (select count(*) from public.support_assistant_action_audit where action_type = 'create_quote_draft' and event_type = 'ACTION_EXECUTED'),
    'lead_created_or_linked', (select count(*) from public.support_assistant_action_audit where action_type = 'create_or_link_lead' and event_type = 'ACTION_EXECUTED'),
    'pdf_generated', (select count(*) from public.support_assistant_action_audit where action_type = 'generate_quote_pdf' and event_type = 'ACTION_EXECUTED'),
    'email_prepared', (select count(*) from public.support_assistant_action_audit where action_type = 'prepare_quote_email' and event_type = 'ACTION_EXECUTED'),
    'email_sent', (select count(*) from public.support_assistant_action_audit where action_type = 'send_quote_email' and event_type = 'ACTION_EXECUTED'),
    'sales_handoffs', (select count(*) from public.support_assistant_handoffs where target = 'SALES'),
    'service_handoffs', (select count(*) from public.support_assistant_handoffs where target = 'TECHNICAL_SERVICE'),
    'failed_actions', (select count(*) from public.support_assistant_actions where status = 'FAILED'),
    'open_workflows', (select count(*) from public.support_assistant_workflows where status in ('DRAFT', 'READY', 'EMAIL_PREPARED'))
  );
end;
$$;

revoke all on function public.get_support_action_overview() from public, anon;
grant execute on function public.get_support_action_overview() to authenticated;

comment on table public.support_assistant_workflows is
  'Server-persisted Phase 7 workflow state. Canonical business entities remain in their existing tables.';
comment on table public.support_assistant_action_audit is
  'Immutable Phase 7 distinction between user request, AI interpretation, canonical result, confirmation and execution.';
