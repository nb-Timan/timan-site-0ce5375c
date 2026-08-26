-- Add external portal roles used by the user administration UI.
--
-- This enables admins to assign the dedicated Messe role to real users
-- instead of using Forhandlerbruger + portal_variant as a workaround.

do $$
begin
  if exists (select 1 from pg_type where typname = 'portal_role')
     and not exists (
       select 1
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       where t.typname = 'portal_role'
         and e.enumlabel = 'private_end_user'
     ) then
    alter type public.portal_role add value 'private_end_user';
  end if;

  if exists (select 1 from pg_type where typname = 'portal_role')
     and not exists (
       select 1
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       where t.typname = 'portal_role'
         and e.enumlabel = 'exhibition_user'
     ) then
    alter type public.portal_role add value 'exhibition_user';
  end if;
end$$;
