-- Private Storage bucket for CRM/messe lead attachments.
-- Files are stored as <lead-id>/<unique-file-id>-<sanitized-filename>.
-- Leads store only storage metadata/path, never permanent base64 blobs.

insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-lead-attachments', 'crm-lead-attachments', false, 10485760)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

create or replace function public.can_access_crm_lead_attachment(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_user_row as (
    select
      au.id::text as app_user_id,
      lower(coalesce(au.email, '')) as email,
      coalesce(au.portal_role, '') as portal_role,
      coalesce(au.permissions, '{}'::jsonb) as permissions
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and coalesce(au.is_active, true) = true
      and coalesce(au.approved, true) = true
    limit 1
  )
  select exists (
    select 1
    from public.crm_leads cl
    cross join current_user_row au
    where cl.id::text = (storage.foldername(object_name))[1]
      and (
        au.portal_role in ('timan_backend', 'timan_seller', 'timan_service', 'timan_marketing')
        or coalesce((au.permissions ->> 'crm_manage')::boolean, false) = true
        or coalesce((au.permissions ->> 'crm_read')::boolean, false) = true
        or cl.owner_user_id::text = au.app_user_id
        or lower(coalesce(cl.owner_email, '')) = au.email
      )
  );
$$;

revoke all on function public.can_access_crm_lead_attachment(text) from public;
revoke all on function public.can_access_crm_lead_attachment(text) from anon;
grant execute on function public.can_access_crm_lead_attachment(text) to authenticated;

drop policy if exists "crm_lead_attachments_select_authenticated" on storage.objects;
drop policy if exists "crm_lead_attachments_insert_authenticated" on storage.objects;
drop policy if exists "crm_lead_attachments_update_authenticated" on storage.objects;
drop policy if exists "crm_lead_attachments_delete_authenticated" on storage.objects;

create policy "crm_lead_attachments_select_authenticated"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'crm-lead-attachments'
  and public.can_access_crm_lead_attachment(name)
);

create policy "crm_lead_attachments_insert_authenticated"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'crm-lead-attachments'
  and public.can_access_crm_lead_attachment(name)
);

create policy "crm_lead_attachments_update_authenticated"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'crm-lead-attachments'
  and public.can_access_crm_lead_attachment(name)
)
with check (
  bucket_id = 'crm-lead-attachments'
  and public.can_access_crm_lead_attachment(name)
);

create policy "crm_lead_attachments_delete_authenticated"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'crm-lead-attachments'
  and public.can_access_crm_lead_attachment(name)
);
