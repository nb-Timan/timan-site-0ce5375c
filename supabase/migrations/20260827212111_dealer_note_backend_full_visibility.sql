-- Backend must be able to read every dealer note.
-- Sellers/service can read Timan-side notes and shared notes.
-- Dealer-side users can read their own dealer-side notes and shared notes.

create or replace function public.can_read_dealer_note(note_dealer_number text, note_visibility text, note_author_party text)
returns boolean language sql stable security definer
set search_path = public as $$
  select
    public.is_timan_backend()
    or
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
