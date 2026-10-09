-- One-time, metadata-only mail-audit backfill.
--
-- Evidence source: configurations.quote_sent_at/order_sent_at is written only
-- after the corresponding n8n webhook returned a readable 2xx response.
-- The candidate's state_json must not have changed after that timestamp, so
-- recipient metadata can be reconstructed from the immutable saved state.
--
-- Deliberately excluded: Messe and all other categories. Their historical
-- provider execution metadata is not available in the portal database.
-- This script does not send mail, read a mail body, or read attachment content.

begin;

-- Serializes this small import with other audit inserts. The WHERE NOT EXISTS
-- predicate below makes an identical rerun a no-op.
lock table public.mail_audit_events in share row exclusive mode;

with constants as (
  select
    timestamptz '2026-09-02 05:43:52.891514+00' as window_start,
    timestamptz '2026-09-16 05:43:52.891514+00' as window_end,
    'sales@timan.dk'::text as internal_bcc
), candidates as (
  select
    c.id::text as configuration_id,
    c.quote_sent_at as sent_at,
    'quote'::text as category,
    'configurator'::text as source_module,
    'historical_quote_email_backfill'::text as source_action,
    'n8n:timan-afsend-tilbud'::text as provider,
    c.quote_number as related_entity_label,
    c.assigned_seller_id,
    c.state_json
  from public.configurations c
  cross join constants k
  where c.quote_sent_at >= k.window_start
    and c.quote_sent_at < k.window_end
    and c.updated_at <= c.quote_sent_at + interval '1 second'

  union all

  select
    c.id::text as configuration_id,
    c.order_sent_at as sent_at,
    'order'::text as category,
    'configurator'::text as source_module,
    'historical_order_email_backfill'::text as source_action,
    'n8n:timan-afsend-ordre'::text as provider,
    c.order_number as related_entity_label,
    c.assigned_seller_id,
    c.state_json
  from public.configurations c
  cross join constants k
  where c.order_sent_at >= k.window_start
    and c.order_sent_at < k.window_end
    and c.updated_at <= c.order_sent_at + interval '1 second'
), normalized as (
  select
    c.*,
    array(
      select distinct lower(trim(address))
      from unnest(regexp_split_to_array(concat_ws(' ', c.state_json ->> 'email', c.state_json ->> 'emailRecipient'), '[,;\\s]+')) as address
      where trim(address) <> ''
      order by lower(trim(address))
    ) as to_addresses
  from candidates c
)
insert into public.mail_audit_events (
  sent_at,
  category,
  source_module,
  source_action,
  subject,
  to_addresses,
  cc_addresses,
  bcc_addresses,
  responsible_user_id,
  responsible_seller_id,
  related_entity_type,
  related_entity_id,
  related_entity_label,
  status,
  provider,
  provider_message_id,
  attachment_count,
  error_message
)
select
  n.sent_at,
  n.category,
  n.source_module,
  n.source_action,
  null, -- n8n execution history is unavailable; do not fabricate a subject.
  n.to_addresses,
  '{}'::text[],
  array[(select internal_bcc from constants)],
  n.assigned_seller_id,
  n.assigned_seller_id,
  n.category,
  n.configuration_id,
  n.related_entity_label,
  'sent',
  n.provider,
  null, -- Provider message IDs are not stored in the portal for this period.
  1, -- Each successful quote/order webhook payload contained one generated PDF.
  null
from normalized n
where cardinality(n.to_addresses) > 0
  and not exists (
    select 1
    from public.mail_audit_events existing
    where existing.category = n.category
      and existing.source_module = n.source_module
      and existing.source_action = n.source_action
      and existing.sent_at = n.sent_at
      and existing.related_entity_id = n.configuration_id
      and existing.to_addresses = n.to_addresses
  );

commit;
