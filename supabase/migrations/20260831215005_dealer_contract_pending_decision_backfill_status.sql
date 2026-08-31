-- Adds an internal awaiting-decision status for initial contract overview
-- backfill records. These records are visible in the internal overview as
-- "Afventer", but they are not exposed to external partners and they do not
-- imply that guided review/signature preparation has been completed.

alter table public.dealer_contracts
  drop constraint if exists dealer_contract_status_check;

alter table public.dealer_contracts
  add constraint dealer_contract_status_check
  check (contract_status in (
    'pending_decision',
    'draft',
    'guided_review',
    'ready_for_signature',
    'awaiting_signed_upload',
    'submitted_for_approval',
    'changes_requested',
    'approved',
    'archived'
  ));

create index if not exists dealer_contracts_dealer_account_id_idx
  on public.dealer_contracts (dealer_account_id)
  where dealer_account_id is not null;
