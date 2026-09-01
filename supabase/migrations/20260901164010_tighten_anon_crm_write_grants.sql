-- Remove leftover anonymous write grants on CRM lead tables.
-- RLS policies already target authenticated users; this keeps table grants
-- aligned with the intended public API surface without changing scope logic.

revoke insert, update, delete, truncate, references, trigger
on table public.crm_leads
from anon, public;

revoke insert, update, delete, truncate, references, trigger
on table public.crm_demo_leads
from anon, public;
