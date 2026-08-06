-- Phase 65 - restore dealer customer type label used by SharePoint verify/sync.
--
-- The deployed SharePoint dealer sync reads/writes customer_type_label, but
-- the live dealer_accounts table can be missing the column if older dealer
-- migrations were not applied. This migration is idempotent and only touches
-- dealer customer-type fields.

alter table public.dealer_accounts
  add column if not exists customer_type_label text;

update public.dealer_accounts
   set customer_type = coalesce(
         nullif(customer_type, ''),
         case upper(nullif(source_customer_type_code, ''))
           when '1' then 'Forhandler'
           when 'A' then 'Forhandler'
           when '2' then 'Service Partner'
           when 'B' then 'Service Partner'
           when '3' then 'Importør'
           when 'C' then 'Importør'
           else null
         end
       ),
       customer_type_label = coalesce(
         nullif(customer_type_label, ''),
         nullif(customer_type, ''),
         case upper(nullif(source_customer_type_code, ''))
           when '1' then 'Forhandler'
           when 'A' then 'Forhandler'
           when '2' then 'Service Partner'
           when 'B' then 'Service Partner'
           when '3' then 'Importør'
           when 'C' then 'Importør'
           else null
         end
       )
 where nullif(customer_type, '') is null
    or nullif(customer_type_label, '') is null;

