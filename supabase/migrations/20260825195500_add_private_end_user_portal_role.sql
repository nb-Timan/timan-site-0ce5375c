-- Add a real portal role for private/end-user accounts.
-- This preserves existing users and does not modify role assignments.

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
end$$;
