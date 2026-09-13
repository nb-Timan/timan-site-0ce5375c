# Supabase Migration Reconciliation - 2026-09-13

> **Invalidated approach:** The earlier name-based mapping in this document was
> invalid. Live migration *version numbers*, not matching filenames, are the
> primary key. For example, `20260904083236` is live-canonical; it must not be
> replaced by the local-only `20260904103000` file with the same name.

## Version-based blocker

Live history contains 138 versions and every one has now been fetched locally.
There are no live-only migration versions. `supabase db push --dry-run` is
correctly blocked because the following local-only versions predate the latest
live migration and have not yet been reconciled by schema effect and Git
lineage:

`20260831210500`, `20260831215005`, `20260901065220`, `20260901081807`,
`20260901150652`, `20260901205252`, `20260902112120`, `20260904103000`,
`20260904123000`, `20260904124500`, `20260904131500`, `20260906201000`,
`20260907104400`, `20260907110100`, `20260907113000`, `20260907150000`,
`20260907170000`, `20260907213500`, `20260908063000`, `20260908065500`,
`20260908071500`, `20260908090000`, `20260908160000`, `20260908180000`,
`20260909140017`, `20260910065351`, `20260910083000`, `20260910084500`,
`20260910085500`, `20260911082228`, and `20260911124006`.

No historical SQL, history repair, schema change, or further local migration
deletion is permitted until each listed version has a documented live schema,
RPC, and RLS effect plus a Git-lineage decision. The Academy migration remains
pending and has not been applied.

## Authority and method

The live Supabase project `rdodyoixxybiozvmuqon` is the authority for this
reconciliation. Its migration history was fetched into this repository without
applying database changes. Each stale local version below has a corresponding
applied live migration with the same schema purpose. `Equivalent` means that
the SQL matches after comments, whitespace, and a terminal standalone
semicolon are ignored. `Live variant` means that the live artifact is a newer
canonical implementation of the same migration purpose and must win.

Removing a stale local file below does not remove a schema effect: the live
version is retained in `supabase/migrations` under its applied version.

## Replaced local version files

| Stale local version | Retained live-canonical version | Comparison | Action |
| --- | --- | --- | --- |
| 20260830220459 data_trace_archive_delete_restore | 20260830222109 | Equivalent | Remove stale local version |
| 20260901125302 dealer_contract_user_access_windows | 20260901150428 | Equivalent | Remove stale local version |
| 20260901132435 site_change_grouped_publications | 20260901163615 | Equivalent | Remove stale local version |
| 20260901143150 repair_crm_lead_sharing_dependencies | 20260901144345 | Equivalent | Remove stale local version |
| 20260901143152 secure_external_crm_scope_partner_relations | 20260901144522 | Equivalent | Remove stale local version |
| 20260901144702 tighten_crm_lead_sharing_grants | 20260901144729 | Equivalent | Remove stale local version |
| 20260901151012 fix_contract_window_policy_contract_id_qualification | 20260901151113 | Equivalent | Remove stale local version |
| 20260901152831 harden_contract_access_activation_rpc | 20260901152938 | Equivalent | Remove stale local version |
| 20260901153058 disambiguate_contract_access_history_events | 20260901153233 | Equivalent | Remove stale local version |
| 20260901155858 harden_app_user_directory | 20260901155950 | Equivalent | Remove stale local version |
| 20260901164010 tighten_anon_crm_write_grants | 20260901164037 | Equivalent | Remove stale local version |
| 20260901210152 marketing_video_user_favorites | 20260901210720 | Equivalent | Remove stale local version |
| 20260904083236 lock_submitted_configurator_orders | 20260904103000 | Equivalent | Remove stale local version |
| 20260904090359 crm_order_lifecycle_and_backend_corrections | 20260904123000 | Equivalent | Remove stale local version |
| 20260904090447 harden_submitted_order_correction_state | 20260904124500 | Equivalent | Remove stale local version |
| 20260904092839 require_submission_for_order_number | 20260904131500 | Equivalent | Remove stale local version |
| 20260904095227 pending_partner_submission_approval | 20260904095712 | Equivalent | Remove stale local version |
| 20260904141735 fix_active_quote_line_save_correction_guard | 20260904141835 | Equivalent | Remove stale local version |
| 20260906172530 partner_commercial_terms | 20260906173358 | Live variant | Remove stale local version |
| 20260906181532 repair_o7002_linked_lead_lifecycle | 20260906201000 | Live variant | Remove stale local version |
| 20260907101702 dealer_sales_dashboard_analytics | 20260907102000 | Live variant | Remove stale local version |
| 20260907102613 fix_dealer_sales_dashboard_sorting | 20260907104400 | Equivalent | Remove stale local version |
| 20260907103111 normalize_dealer_sales_dashboard_discounts | 20260907110100 | Equivalent | Remove stale local version |
| 20260907104219 mark_noncanonical_discount_values_unavailable | 20260907113000 | Equivalent | Remove stale local version |
| 20260907134125 allow_assigned_seller_dealer_contacts | 20260907150000 | Equivalent | Remove stale local version |
| 20260907165744 machine_registry_server_pagination | 20260907170000 | Live variant | Remove stale local version |
| 20260907171500 machine_registry_view_as_scope | 20260907181843 | Equivalent | Remove stale local version |
| 20260907184020 machine_registry_warranty_match_status | 20260907184422 | Live variant | Remove stale local version |
| 20260907185421 machine_registry_warranty_match_counts | 20260907190023 | Live variant | Remove stale local version |
| 20260907191915 add_machine_registry_status_filter | 20260907192328 | Equivalent | Remove stale local version |
| 20260907193556 dealer_machine_registry_search_sort | 20260907195140 | Equivalent | Remove stale local version |
| 20260907204513 add_machine_commercial_identifiers | 20260907205258 | Equivalent | Remove stale local version |
| 20260907210659 revoke_anon_legacy_machine_sales_enrichment | 20260907213500 | Equivalent | Remove stale local version |
| 20260907210823 add_legacy_machine_cost_and_commercial_fields | 20260907211233 | Equivalent | Remove stale local version |
| 20260907212720 fix_dealer_machine_server_sorting | 20260907212916 | Equivalent | Remove stale local version |
| 20260908042855 backfill_canonical_machine_orders | 20260908063000 | Live variant | Remove stale local version |
| 20260908043034 make_canonical_machine_order_deterministic | 20260908065500 | Equivalent | Remove stale local version |
| 20260908044022 align_canonical_machine_order_rows | 20260908071500 | Equivalent | Remove stale local version |
| 20260908080804 redact_external_machine_financials | 20260908090000 | Equivalent | Remove stale local version |
| 20260908210000 enforce_seller_contract_scope | 20260910171452 | Equivalent | Remove stale local version |
| 20260909181219 contract_overview_scoped_read | 20260909182101 | Equivalent | Remove stale local version |
| 20260909193000 partner_payment_terms_override | 20260910174059 | Equivalent | Remove stale local version |
| 20260913092817 marketing_video_trash_retention | 20260913094101 | Live variant | Remove stale local version |
| 20260913094702 harden_marketing_video_trash_restore | 20260913094819 | Equivalent | Remove stale local version |
| 20260913095157 correct_existing_marketing_video_restore_status | 20260913095228 | Equivalent | Remove stale local version |

## Local-only migration decisions

| Local version | Live evidence | Reconciliation action |
| --- | --- | --- |
| 20260831210500 dealer_contract_backend_delete | `delete_dealer_contract(uuid)` exists live with Backend guard, Storage cleanup, and audit logging. | Repair migration metadata to `applied`; retain file. |
| 20260831215005 dealer_contract_pending_decision_backfill_status | Live `dealer_contract_status_check` includes `pending_decision` and the index exists. | Repair migration metadata to `applied`; retain file. |
| 20260901065220 secure_external_crm_lead_scope | Superseded by live `20260911100000_replace_global_crm_partner_rls`; live `crm_leads_page_query` has the newer 19-argument scoped definition. | Remove obsolete local version; do not replay it. |
| 20260901081807 crm_partner_agreement_history_detail | `occurred_at`, its index, extended event constraint, and extended append helper all exist live. | Repair migration metadata to `applied`; retain file. |
| 20260901150652 enforce_user_specific_contract_window_policies | Superseded by live `20260901150923_contract_window_user_policies`; current policies use the newer canonical internal-actor helpers. | Remove obsolete local version; do not replay it. |
| 20260901205252 add_marketing_video_model_generation_status | Column, check constraint, and index all exist live. | Repair migration metadata to `applied`; retain file. |
| 20260902112120 repair_dvp_123456_dealer_account | No live `123456` user remains; one canonical `10458` user exists. It is a historic data repair, not schema. | Remove obsolete local data repair; do not replay or metadata-repair it. |
| 20260910065351 crm_lead_probability_precedence | The live 19-argument `crm_leads_page_query` preserves stored probability before stage fallbacks. | Repair migration metadata to `applied`; retain file. |

## Result required before Academy deployment

After the documented file removals and the five metadata repairs, the local
migration directory will contain every live migration exactly once. The only
pending migration will be the new Academy cycle migration. No historic
business data is changed by this reconciliation.
