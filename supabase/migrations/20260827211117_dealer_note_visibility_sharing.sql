-- Dealer note sharing / visibility.
--
-- Existing notes are kept private by default:
-- - existing Timan notes become author_party = 'timan', visibility = 'internal'
-- - a note only becomes visible to both parties when visibility = 'shared'

alter table public.dealer_notes
  add column if not exists visibility text not null default 'internal',
  add column if not exists author_party text not null default 'timan',
  add column if not exists shared_at timestamptz;

alter table public.dealer_notes
  drop constraint if exists dealer_notes_visibility_check,
  add constraint dealer_notes_visibility_check
    check (visibility in ('internal', 'shared'));

alter table public.dealer_notes
  drop constraint if exists dealer_notes_author_party_check,
  add constraint dealer_notes_author_party_check
    check (author_party in ('timan', 'dealer'));

update public.dealer_notes
set visibility = 'internal'
where visibility is null;

update public.dealer_notes
set author_party = 'timan'
where author_party is null;

create or replace function public.current_app_user_dealer_number()
returns text language sql stable security definer
set search_path = public as $$
  select dealer_number
  from public.app_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and is_active = true
  order by updated_at desc nulls last
  limit 1;
$$;

create or replace function public.can_read_dealer_note(note_dealer_number text, note_visibility text, note_author_party text)
returns boolean language sql stable security definer
set search_path = public as $$
  select
    (
      public.is_timan_internal()
      and (note_author_party = 'timan' or note_visibility = 'shared')
    )
    or
    (
      coalesce(public.current_app_user_dealer_number(), '') = note_dealer_number
      and (note_author_party = 'dealer' or note_visibility = 'shared')
    );
$$;

drop policy if exists dealer_notes_select_internal on public.dealer_notes;
drop policy if exists dealer_notes_insert_internal on public.dealer_notes;
drop policy if exists dealer_notes_update_backend_or_owner on public.dealer_notes;
drop policy if exists dealer_notes_delete_backend_or_owner on public.dealer_notes;

create policy dealer_notes_select_visible
  on public.dealer_notes for select
  to authenticated
  using (public.can_read_dealer_note(dealer_number, visibility, author_party));

create policy dealer_notes_insert_by_party
  on public.dealer_notes for insert
  to authenticated
  with check (
    (
      public.is_timan_internal()
      and author_party = 'timan'
    )
    or
    (
      coalesce(public.current_app_user_dealer_number(), '') = dealer_number
      and author_party = 'dealer'
    )
  );

create policy dealer_notes_update_backend_or_owner
  on public.dealer_notes for update
  to authenticated
  using (
    public.is_timan_backend()
    or lower(coalesce(created_by_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_timan_backend()
    or lower(coalesce(created_by_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy dealer_notes_delete_backend_or_owner
  on public.dealer_notes for delete
  to authenticated
  using (
    public.is_timan_backend()
    or lower(coalesce(created_by_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists dealer_note_comments_select_internal on public.dealer_note_comments;
drop policy if exists dealer_note_comments_insert_internal on public.dealer_note_comments;
drop policy if exists dealer_note_comments_update_backend_or_owner on public.dealer_note_comments;
drop policy if exists dealer_note_comments_delete_backend_or_owner on public.dealer_note_comments;

create policy dealer_note_comments_select_visible
  on public.dealer_note_comments for select
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_notes n
      where n.id = note_id
        and n.visibility = 'shared'
        and public.can_read_dealer_note(n.dealer_number, n.visibility, n.author_party)
    )
  );

create policy dealer_note_comments_insert_shared_visible
  on public.dealer_note_comments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.dealer_notes n
      where n.id = note_id
        and n.visibility = 'shared'
        and public.can_read_dealer_note(n.dealer_number, n.visibility, n.author_party)
    )
  );

create policy dealer_note_comments_update_backend_or_owner
  on public.dealer_note_comments for update
  to authenticated
  using (
    public.is_timan_backend()
    or lower(coalesce(created_by_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_timan_backend()
    or lower(coalesce(created_by_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy dealer_note_comments_delete_backend_or_owner
  on public.dealer_note_comments for delete
  to authenticated
  using (
    public.is_timan_backend()
    or lower(coalesce(created_by_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
