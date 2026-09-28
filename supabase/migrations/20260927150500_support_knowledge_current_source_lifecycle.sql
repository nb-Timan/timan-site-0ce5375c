-- Phase 4 closure: keep the approved current source revision canonical.
-- Source revisions remain immutable; only the current marker follows the
-- human-managed knowledge lifecycle.

create or replace function public.support_sync_knowledge_current_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
begin
  if new.status = 'APPROVED' then
    select s.id
      into v_source_id
      from public.support_knowledge_sources as s
     where s.knowledge_item_id = new.id
       and s.ingestion_status = 'READY_FOR_REVIEW'
     order by s.revision desc
     limit 1;

    update public.support_knowledge_sources as s
       set is_current = (s.id = v_source_id)
     where s.knowledge_item_id = new.id
       and s.is_current is distinct from (s.id = v_source_id);
  else
    update public.support_knowledge_sources as s
       set is_current = false
     where s.knowledge_item_id = new.id
       and s.is_current = true;
  end if;

  return new;
end;
$$;

create trigger support_knowledge_items_sync_current_source
after insert or update of status on public.support_knowledge_items
for each row execute function public.support_sync_knowledge_current_source();

revoke all on function public.support_sync_knowledge_current_source() from public, anon, authenticated, service_role;

comment on function public.support_sync_knowledge_current_source() is
  'Selects the latest ready immutable source revision only while its human-managed knowledge item is APPROVED.';
