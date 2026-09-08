# Machine Order Warranty Semantics Reconciliation

## Historical live migration

- Supabase project: `rdodyoixxybiozvmuqon`
- Applied migration: `20260907200538_machine_order_warranty_semantics`
- Live migration status: applied before this document was added.
- Replay status: prohibited. This document is not a Supabase migration and must never be used as SQL input.

## What is verified live

The historical change established the distinction used by the machine read model:

- `legacy_warranty_reference` is the historical machine-order reference (MO), not a warranty certificate.
- An SP certificate is represented separately by warranty source/certificate data.
- `machine_registry_page_scoped` is the related canonical machine-list read model.
- Existing warranty RLS remains on `warranty_registrations` and `warranty_registration_history` through internal and scoped-select policies.

Live objects which currently carry this lineage include:

- `machine_registry_page_scoped` overloads; their original form has subsequently been replaced by later signatures and implementations.
- `attach_manual_machine_warranty(uuid, text)`, `assign_machine_active_dealer(uuid, uuid)`, and `update_machine_master_data(uuid, text, date, text, text)`; these are tracked separately by `20260907200523_manual_warranty_approval_workflow`.
- Warranty serial-normalization and updated-at triggers.
- The later `warranty_registrations_active_machine_order_unique` index, added by the MO backfill rather than this historical migration.

## Exact source recovery decision

No tracked SQL file is added for `20260907200538_machine_order_warranty_semantics`.

Git contains older related files with different timestamps (`20260907195821` and `20260907201220`) in an older warranty-worktree commit. They do not match the applied live migration timestamp or a provable one-to-one change sequence. Reintroducing either as `20260907200538` would be an unverified reconstruction and could cause a later Supabase migration replay.

## Superseding tracked migrations

The live migration's read-model semantics have been overtaken by these tracked live migrations:

- `20260907205258_add_machine_commercial_identifiers`
- `20260907211233_add_legacy_machine_cost_and_commercial_fields`
- `20260907212916_fix_dealer_machine_server_sorting`
- `20260907214212_fix_machine_registry_semantic_sorting`
- `20260908042855_backfill_canonical_machine_orders`
- `20260908043034_make_canonical_machine_order_deterministic`
- `20260908044022_align_canonical_machine_order_rows`

The current tracked implementation therefore documents the active behavior. This note records that the historical live migration exists but cannot safely be recreated as an executable migration from available evidence.
