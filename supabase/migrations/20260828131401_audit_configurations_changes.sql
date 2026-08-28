create or replace function public.audit_configuration_change()
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
  full_payload jsonb;
  label text;
  rec_id text;
begin
  select * into a from public.audit_current_actor();

  if tg_op = 'INSERT' then
    old_payload := null;
    new_payload := public.audit_filter_payload(to_jsonb(new));
    full_payload := new_payload;
    rec_id := new.id::text;
  elsif tg_op = 'UPDATE' then
    old_payload := public.audit_filter_payload(to_jsonb(old));
    new_payload := public.audit_filter_payload(to_jsonb(new));
    changed := public.audit_changed_fields(old_payload, new_payload);
    if coalesce(array_length(changed, 1), 0) = 0 then
      return new;
    end if;
    old_payload := (
      select coalesce(jsonb_object_agg(field, old_payload -> field), '{}'::jsonb)
      from unnest(changed) field
    );
    new_payload := (
      select coalesce(jsonb_object_agg(field, new_payload -> field), '{}'::jsonb)
      from unnest(changed) field
    );
    full_payload := public.audit_filter_payload(to_jsonb(new));
    rec_id := new.id::text;
  else
    old_payload := public.audit_filter_payload(to_jsonb(old));
    new_payload := null;
    full_payload := old_payload;
    rec_id := old.id::text;
  end if;

  label := coalesce(
    full_payload ->> 'quote_number',
    full_payload ->> 'order_number',
    full_payload ->> 'title',
    full_payload ->> 'customer_company',
    full_payload ->> 'customer_name',
    rec_id
  );
  changed := coalesce(changed, public.audit_changed_fields(old_payload, new_payload));

  insert into public.audit_log (
    actor_user_id,
    actor_email,
    actor_name,
    actor_role,
    active_mode,
    seller_context,
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
    coalesce(a.actor_email, full_payload ->> 'created_by_email'),
    a.actor_name,
    coalesce(a.actor_role, full_payload ->> 'created_by_role'),
    full_payload ->> 'active_mode',
    coalesce(full_payload ->> 'seller_email', full_payload ->> 'seller_initials'),
    lower(tg_op),
    'crm_sales_documents',
    'configurations',
    rec_id,
    label,
    old_payload,
    new_payload,
    changed,
    'success'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.configurations') is not null then
    drop trigger if exists audit_configurations_changes on public.configurations;
    create trigger audit_configurations_changes
      after insert or update or delete on public.configurations
      for each row execute function public.audit_configuration_change();
  end if;
end $$;

grant execute on function public.audit_configuration_change() to authenticated;
