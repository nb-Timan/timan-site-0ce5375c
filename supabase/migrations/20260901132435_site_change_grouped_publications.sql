-- Editorial grouping for Marketing -> Nye features på sitet.
-- GitHub commits stay as internal source rows, while one published parent can
-- represent several related commits in the public "Hvad er nyt?" feed.

alter table public.site_change_entries
  add column if not exists is_group boolean not null default false,
  add column if not exists group_parent_id uuid references public.site_change_entries(id) on delete set null,
  add column if not exists group_suggestion_status text not null default 'none'
    check (group_suggestion_status in ('none', 'suggested', 'approved', 'split')),
  add column if not exists grouped_at timestamptz;

create index if not exists site_change_entries_group_parent_idx
  on public.site_change_entries (group_parent_id);

create index if not exists site_change_entries_group_suggestion_idx
  on public.site_change_entries (group_suggestion_status, implemented_at desc);

create or replace function public.sync_site_change_public_entry()
returns trigger
language plpgsql
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

  -- A grouped source commit remains in the internal table, but the public feed
  -- is owned by the group parent. This prevents duplicate public entries.
  if new.group_parent_id is not null then
    delete from public.site_change_public_entries where id = new.id;
    return new;
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
      coalesce(new.published_at, now()),
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

    if new.published_at is null then
      new.published_at = now();
    end if;
  else
    delete from public.site_change_public_entries where id = new.id;
  end if;

  return new;
end;
$$;
