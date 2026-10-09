alter table public.support_assistant_workflows
  add column if not exists state_history jsonb not null default '[]'::jsonb;

alter table public.support_assistant_workflows
  drop constraint if exists support_assistant_workflows_state_history_array;

alter table public.support_assistant_workflows
  add constraint support_assistant_workflows_state_history_array
  check (jsonb_typeof(state_history) = 'array');

alter table public.support_assistant_workflows
  drop constraint if exists support_assistant_workflows_conversation_id_user_id_key;

create unique index if not exists support_assistant_workflows_active_conversation_user_idx
  on public.support_assistant_workflows (conversation_id, user_id)
  where status in ('DRAFT', 'READY', 'QUOTE_CREATED', 'PDF_GENERATED', 'EMAIL_PREPARED');

comment on column public.support_assistant_workflows.state_history is
  'Server-owned prior workflow states used for one-step canonical navigation. Terminal workflow rows remain immutable history.';
