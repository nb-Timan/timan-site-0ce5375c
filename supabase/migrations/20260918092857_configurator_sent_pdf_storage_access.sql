-- Sent Configurator PDFs are private to the user that created the file. A
-- quote/order sender needs both INSERT (archive) and SELECT (signed URL).
-- The role check mirrors the existing Configurator submit permission defaults.
drop policy if exists sent_pdfs_insert_submitters on storage.objects;
create policy sent_pdfs_insert_submitters
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'sent-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.is_active = true
      and au.approved = true
      and lower(au.status) in ('active', 'approved')
      and coalesce(
        au.can_submit_order,
        au.portal_role::text in (
          'timan_backend',
          'timan_seller',
          'timan_dealer',
          'timan_importer',
          'timan_service_partner'
        )
        or au.role = 'timan_saelger'
        or (
          au.role = 'partner'
          and au.partner_type in ('forhandler', 'service_partner', 'importoer')
        ),
        false
      )
  )
);

drop policy if exists sent_pdfs_select_submitters on storage.objects;
create policy sent_pdfs_select_submitters
on storage.objects
for select
to authenticated
using (
  bucket_id = 'sent-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.is_active = true
      and au.approved = true
      and lower(au.status) in ('active', 'approved')
      and coalesce(
        au.can_submit_order,
        au.portal_role::text in (
          'timan_backend',
          'timan_seller',
          'timan_dealer',
          'timan_importer',
          'timan_service_partner'
        )
        or au.role = 'timan_saelger'
        or (
          au.role = 'partner'
          and au.partner_type in ('forhandler', 'service_partner', 'importoer')
        ),
        false
      )
  )
);
