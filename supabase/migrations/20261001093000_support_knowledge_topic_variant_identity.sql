-- A Knowledge Item has one canonical language variant; topic reassignment updates it in place.
create unique index if not exists support_knowledge_topic_variants_item_language_uidx
  on public.support_knowledge_topic_variants (knowledge_item_id, language);
