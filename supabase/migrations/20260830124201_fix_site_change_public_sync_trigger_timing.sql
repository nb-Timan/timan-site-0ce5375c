-- The public projection has a foreign key back to site_change_entries. Keep
-- metadata preparation before the row is stored, but run projection writes
-- after the source row exists.

create or replace function public.site_change_prepare_publication_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.sync_site_change_public_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  public_title text;
  public_description text;
  public_localized_content jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.site_change_public_entries where id = old.id;
    return old;
  end if;

  if new.status = 'published' then
    public_title := coalesce(nullif(new.title_public, ''), nullif(new.localized_content #>> '{da,title}', ''), new.title_internal);
    public_description := nullif(coalesce(new.description_public, new.localized_content #>> '{da,description}', ''), '');
    public_localized_content := public.site_change_public_content(
      new.localized_content,
      public_title,
      public_description,
      new.module,
      new.change_type
    );

    insert into public.site_change_public_entries (
      id,
      published_at,
      implemented_at,
      title,
      description,
      localized_content,
      module,
      change_type,
      affected_roles,
      is_important,
      source_ref,
      updated_at
    )
    values (
      new.id,
      new.published_at,
      new.implemented_at,
      public_title,
      public_description,
      public_localized_content,
      new.module,
      new.change_type,
      coalesce(new.affected_roles, array['all']::text[]),
      new.is_important,
      new.source_ref,
      now()
    )
    on conflict (id) do update set
      published_at = excluded.published_at,
      implemented_at = excluded.implemented_at,
      title = excluded.title,
      description = excluded.description,
      localized_content = excluded.localized_content,
      module = excluded.module,
      change_type = excluded.change_type,
      affected_roles = excluded.affected_roles,
      is_important = excluded.is_important,
      source_ref = excluded.source_ref,
      updated_at = now();
  else
    delete from public.site_change_public_entries where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists site_change_prepare_publication_metadata on public.site_change_entries;
create trigger site_change_prepare_publication_metadata
before insert or update on public.site_change_entries
for each row execute function public.site_change_prepare_publication_metadata();

drop trigger if exists sync_site_change_public_entry on public.site_change_entries;
create trigger sync_site_change_public_entry
after insert or update or delete on public.site_change_entries
for each row execute function public.sync_site_change_public_entry();

revoke all on function public.site_change_prepare_publication_metadata() from public, anon, authenticated;
revoke all on function public.sync_site_change_public_entry() from public, anon, authenticated;
