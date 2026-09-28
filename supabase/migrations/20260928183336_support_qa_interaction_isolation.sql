alter table public.support_conversations
  add column if not exists is_qa boolean not null default false;

create index if not exists support_conversations_is_qa_idx
  on public.support_conversations (is_qa)
  where is_qa = true;

comment on column public.support_conversations.is_qa is
  'Marks internal QA conversations so immutable action evidence can be retained without affecting production-facing Support metrics.';

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
    'configuration_started', (
      select count(*)
      from public.support_assistant_action_audit a
      join public.support_conversations c on c.id = a.conversation_id
      where a.action_type = 'create_configuration_draft'
        and a.event_type = 'ACTION_EXECUTED'
        and not c.is_qa
    ),
    'configuration_completed', (
      select count(*)
      from public.support_assistant_workflows w
      join public.support_conversations c on c.id = w.conversation_id
      where w.status in ('READY', 'QUOTE_CREATED', 'PDF_GENERATED', 'EMAIL_PREPARED', 'EMAIL_SENT')
        and not c.is_qa
    ),
    'quote_previewed', (
      select count(*)
      from public.support_assistant_action_audit a
      join public.support_conversations c on c.id = a.conversation_id
      where a.action_type = 'calculate_quote_preview'
        and a.event_type = 'SYSTEM_CALCULATION'
        and not c.is_qa
    ),
    'quote_created', (
      select count(*)
      from public.support_assistant_action_audit a
      join public.support_conversations c on c.id = a.conversation_id
      where a.action_type = 'create_quote_draft'
        and a.event_type = 'ACTION_EXECUTED'
        and not c.is_qa
    ),
    'lead_created_or_linked', (
      select count(*)
      from public.support_assistant_action_audit a
      join public.support_conversations c on c.id = a.conversation_id
      where a.action_type = 'create_or_link_lead'
        and a.event_type = 'ACTION_EXECUTED'
        and not c.is_qa
    ),
    'pdf_generated', (
      select count(*)
      from public.support_assistant_action_audit a
      join public.support_conversations c on c.id = a.conversation_id
      where a.action_type = 'generate_quote_pdf'
        and a.event_type = 'ACTION_EXECUTED'
        and not c.is_qa
    ),
    'email_prepared', (
      select count(*)
      from public.support_assistant_action_audit a
      join public.support_conversations c on c.id = a.conversation_id
      where a.action_type = 'prepare_quote_email'
        and a.event_type = 'ACTION_EXECUTED'
        and not c.is_qa
    ),
    'email_sent', (
      select count(*)
      from public.support_assistant_action_audit a
      join public.support_conversations c on c.id = a.conversation_id
      where a.action_type = 'send_quote_email'
        and a.event_type = 'ACTION_EXECUTED'
        and not c.is_qa
    ),
    'sales_handoffs', (
      select count(*)
      from public.support_assistant_handoffs h
      join public.support_conversations c on c.id = h.conversation_id
      where h.target = 'SALES'
        and not c.is_qa
    ),
    'service_handoffs', (
      select count(*)
      from public.support_assistant_handoffs h
      join public.support_conversations c on c.id = h.conversation_id
      where h.target = 'TECHNICAL_SERVICE'
        and not c.is_qa
    ),
    'failed_actions', (
      select count(*)
      from public.support_assistant_actions a
      join public.support_conversations c on c.id = a.conversation_id
      where a.status = 'FAILED'
        and not c.is_qa
    ),
    'open_workflows', (
      select count(*)
      from public.support_assistant_workflows w
      join public.support_conversations c on c.id = w.conversation_id
      where w.status in ('DRAFT', 'READY', 'EMAIL_PREPARED')
        and not c.is_qa
    )
  );
end;
$$;

revoke all on function public.get_support_action_overview() from public, anon;
grant execute on function public.get_support_action_overview() to authenticated;
