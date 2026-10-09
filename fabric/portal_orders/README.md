# Portal order domain: prepared Fabric integration

Status, 2026-10-01: source discovery and local implementation/verification done.
**NOT deployed or executed in Fabric. No end-to-end PASS is claimed.**

## Verified existing architecture

Workspace `Timan Fabric`: `fbdf1344-cf96-42fa-9ded-ce8786b4c58b`.

| Existing item | ID / observed implementation |
| --- | --- |
| Orchestrator `pl_daily_7_12_15` | `9d0cff07-9d2c-4750-84a4-9d7fede59b6b`; activities `pl_daily`, `nb__fact_Invent_trans`, `nb_dim_a_b_kunde`, `nb_dim_customer`, `nb_fact_sales` |
| `pl_crm_leads_supabase` | `b237fca3-cd75-41fe-82a0-5235e4afabcc`; existing get_data pipeline, definition/dependencies still need export |
| `nb_get_data_crm_leads_supabase` | `bea9c8b0-4f88-429c-a80e-6b9e00da9d6a`; JDBC session pooler; metadata-driven SELECT; full overwrite to `Staging.Supabase.crm_leads` |
| `Staging` lakehouse | `937075af-f88e-43c5-a644-32e24897184e`; task label is `staging_lh`, actual lakehouse name is **Staging** |
| `nb_transform_dim_customer` | `e2f58b0d-3412-4aeb-8c8c-fb8349f13dac`; C5.CUSTTABLE -> reporting_lh.dim.dim_customer; key = xxhash64(customer_number) |
| `nb_transform_fact_sales_order` | `6c0ad7d8-b10f-4ede-a8fa-3d2803e6c701`; C5.SALESLINE left join C5.SALESTABLE on DATASET/NUMBER_ -> reporting_lh.fact.fact_sales |
| `reporting_lh` | `a441524a-218b-478e-b1b8-f5505719b162` |
| `data_model` | `87645134-0371-477d-9859-552952935e87`; viewing mode showed dim_customer, dim_a_b_kunde_beskrivelse, fact_sales, fact_invent_transaction |

No Fabric files/Git deployment configuration were found in this Portal repository.
Browser inspection was used for discovery, not as an ingestion data source.
The workspace's external Git binding has not been established.

The existing sales fact is **C5 line grain, without Portal revision identity**.
Appending Portal document lines there would mix distinct grains and potentially
double-count the same commercial event before/after ERP entry. The new
`fact_portal_order*` tables are the Portal document domain within the SAME
Staging/reporting lakehouses, not replacement C5 facts or a second architecture.
The existing C5 notebook's key_customer hash includes company, unlike its current
customer dimension. Do not copy that mismatch or change the unrelated C5 model.
The prepared Portal enrichment reads the existing dimension key by a unique
canonical dealer account number; ambiguous/missing matches remain null.

## Actual deployment blocker

The existing Orchestrator displays **Connection issues**, one invalid activity:

`pl_daily` -> connection `343435ab-35a9-482e-ad1c-cbe0394b2441`.

Fabric explicitly says this user cannot access the connection and that saving
requires fixing or deactivating the activity. Neither permissions nor activity
state was changed. Do not bypass this by creating a parallel pipeline.
An existing authorized connection owner must run the integration, or provide
the required normal connection access. Export the existing pipeline definition
and verify its dependency graph before inserting the order-ingestion dependency.
Do not replace the orchestrator with a guessed JSON definition.

The current ingestion notebook has an inline password assignment. Its value was
not printed, saved to this repo, or copied into these artifacts. Credentials are
not part of this deployment package. Use an existing approved connection/secret
binding; remediate the old credential pattern separately with the owner.

## Source mapping

Project: `rdodyoixxybiozvmuqon`, name `timan-site-0ce5375c`, eu-west-1.

| Source | Role / canonical relationship |
| --- | --- |
| public.configurations | Header, overview/current state; PK id; dealer_account_id -> dealer_accounts.id; assigned_seller_id -> app_users.id |
| public.configuration_items | PK id; configuration_id -> configurations.id; machine grouping/options, **not** the frozen commercial lines |
| public.configurator_order_correction_sessions | PK id; configuration_id -> configurations.id; actor_user_id -> app_users.id; before/after snapshots, correction completion and confirmation-send times |
| public.dealer_accounts | PK id; normalized current dealer identity, canonical account_number; no name-based joins |
| public.app_users | Read-only seller validation during discovery; stable ID + name. NOT copied wholesale: permissions/authentication fields stay outside ingestion |
| public.is_submitted_configurator_order | Canonical submitted predicate mirrored by `submitted()` and called directly by source QA SQL |
| public.read_submitted_order_confirmation | Canonical historical-selection semantics mirrored by `revisions()`; authorization is not replaced/exposed |
| public.list_submitted_configurator_order_corrections | Backend history semantics checked; not a bulk export API |
| public.record_order_revision_confirmation | Read during discovery only to distinguish confirmation timestamps; never invoked by ingestion |

Frontend trace: CRM read-only document -> `loadSubmittedOrderConfirmation` in
configurationsService -> RPC above -> saved configuration state ->
`buildReadOnlySalesDocument` / `buildAccountCaseLines`.

Historical prices/descriptions/quantities come ONLY from
`snapshot.configuration.state_json.pricingSnapshot.lines` and `.totals`.
Discount details come from `.discountDetails`. Never join today's price list or
Configurator catalogue to replace them. Currency stays separate from decimals.
Source item numbers are retained, including leading zeroes and repeated items.

Current header status, seller/dealer IDs, source quote, creation/submission/send
timestamps come from configurations. Revision delivery, payment, comments and
contact fields come only from that revision's saved state. Machine config ID,
unit number, per-unit PO and delivery override use the same key precedence as
`orderPurchaseReferences.ts` and `configuratorDelivery.ts`. All contact/address
attributes are separate. Filler email and recipient email are different columns.
The order UI uses the CURRENT shared `TIMAN_COMPANY_PROFILE` for issuer display;
there is no historical issuer snapshot to infer in these saved revisions. Do not
invent historical issuer/VAT values. Issuer display can use that shared profile
in a separately reviewed semantic projection, explicitly marked current.

All five inspected source tables have RLS enabled. No policies, grants, functions,
source rows, history or legacy CRM columns were modified.

## Grain and field contracts

`model.TABLES` is the explicit typed schema contract; all keys use stable source
IDs, with namespaced deterministic composite keys where the source has no ID.

| Output under reporting_lh.fact | One row equals / key |
| --- | --- |
| fact_portal_order | One submitted configuration / order_id |
| fact_portal_order_revision | Original or completed correction / order ID + session UUID (original has suffix original) |
| fact_portal_order_line | One frozen line of one revision / revision key + source array ordinal |
| fact_portal_order_machine | One unit of a revision / revision key + global unit number |
| fact_portal_order_discount | One stored discount detail / revision key + ordinal |
| fact_portal_order_reference | One machine, legacy order or frozen-line reference occurrence; source column distinguishes them |
| fact_portal_order_quality | Explicit missing/invalid snapshot or unmatched-unit finding |

Line keys identify historical occurrences, not guessed cross-revision product
identity. Zero-priced lines remain rows. Missing values remain null, not zero.
Dates are native date, timestamps UTC, money/quantity decimal(38,12). Decimal
overflow/precision loss is rejected. Both sum(lines) vs subtotal and subtotal
minus discount vs final total use the Portal's 0.02 tolerance.

Revision 0 uses the earliest correction before_snapshot if there is a correction;
otherwise the submitted row. Completed revisions retain all after_snapshots.
Number ALL sessions by started_at/id, then select current by completed_at and
revision number. Active/expired corrections do not become completed revisions.
No mutable live header fields are merged into an historical snapshot.

Missing legacy price snapshots retain header/revision/machine metadata with
`MISSING_SNAPSHOT`, null financial values, no invented lines. Invalid financial
snapshots prevent publishing. Raw snapshots remain available for investigation.
Never sum every revision as current sales. Never sum Portal and ERP facts as
distinct revenue without an explicit, verified ERP order relationship.

## Integration cells (prepared, NOT installed)

Package `portal_orders/` (including __init__.py) as a zip at its root and attach it
as a versioned notebook resource or approved Spark environment dependency; use
`spark.sparkContext.addPyFile` with the workspace's approved resource URI so
executors can import the package too. Do not upload production extracts or secrets.

Append to the existing Supabase ingestion after connection initialization,
leaving the existing CRM cell/behavior unchanged:

```python
from portal_orders.staging import prepare_staging, publish_staging
frames, metadata = prepare_staging(spark, JDBC_URL, PROPS)
try:
    publish_staging(frames, metadata)
finally:
    for frame in frames.values():
        frame.unpersist()
    metadata.unpersist()
```

Append to `nb_transform_fact_sales_order`, leaving its C5 cell unchanged, with
successful order ingestion and dim_customer as dependencies:

```python
from portal_orders.notebook import build_frames, publish_frames
frames = build_frames(spark)
try:
    publish_frames(frames)
finally:
    for frame in frames.values():
        frame.unpersist()
```

This uses the existing `Staging.Supabase` namespace, `reporting_lh.fact` namespace
and `reporting_lh.dim.dim_customer`. No new lakehouse, CRM pipeline replacement,
customer dimension or source migration is required. Review and validate these
cells in Fabric before publication: local tests do not execute Spark/Delta/JDBC.

Full refresh is deliberate, matching the existing architecture. No timestamp-only
incremental logic is claimed: correction confirmations lack updated_at, and deletes
must be reflected. Ingestion caches all frames and rejects source changes between
before/after fingerprints before starting writes. Full-row hashing has a source
load cost; reassess against actual growth before replacing it with reviewed CDC.

Delta writes are atomic **per table, not across the whole domain**. Disable
overlapping order loads and gate the downstream transform/semantic refresh on
successful completion of ALL writes. On failure, do not refresh/advertise a new
batch; rerun the full order load. Preserve table history. Before connecting a
live Direct Lake consumer, arrange consistent batch/version visibility through
the existing publication mechanism; this cannot be verified without the actual
pipeline connection and semantic deployment settings. Do not pretend a sequence
of Delta overwrites is a cross-table transaction.

## Schema evolution

Only configurations, configuration_items, correction_sessions and dealer_accounts
are allowlisted for broad raw ingestion. Added columns are read automatically.
JSON/array source values are lossless raw JSON, not comma-separated strings.
Curated fields remain explicit; new raw fields do not automatically enter reports.

Source format_type is persisted in `Supabase.portal_order_source_contract` after
a successful load. Missing table/column, rename (remove + add), ANY type/precision
change, or incompatible existing Delta type stops the load. Type widening requires
review rather than silent conversion. Metadata is checked again after extraction.
Writes use mergeSchema for additions, never overwriteSchema to hide removals.
This does not change the legacy CRM leads ingestion behavior in this task.

References: [Fabric schema evolution](https://learn.microsoft.com/en-us/fabric/data-engineering/delta-lake-schema-evolution),
[Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Semantic model deployment contract

Extend existing `data_model` only after lakehouse acceptance. No changes were
made to it in this task. Add order/revision/line and appropriate machine/discount
children, retaining IDs hidden from casual reports. Relationships are one-to-many,
single direction: order -> revisions -> lines/discounts/machines; dim_customer ->
order via the actual reused key_customer. Avoid a second active order -> line
path and cyclic bidirectional relationships. Null/unmatched customer keys remain
visible as unresolved, not mapped by name. Audit uniqueness before activation.

Do not expose contact email/phone, internal notes, raw state or auth fields in the
default semantic field list. Apply existing approved analytical audience controls;
Supabase RLS does not magically transfer to a lakehouse/Power BI model. Verify
that workspace/model access is appropriate before importing customer data.
Exact storage mode, partitions, security and relationship metadata must be read
from the existing model/export by its authorized operator before deployment.

Measures must filter current/VALID revision and a single currency. Mixed-currency
totals return blank unless a separately approved FX measure exists. Subtotal,
discount and total are revision-level measures; do not repeat/sum header totals
on every line. Missing-snapshot count is an explicit quality measure.

## Observed acceptance and tests

O-7026 was verified in read-only production SQL AND through the actual Python
projection run locally against production source data in memory (no extract saved):

| Field | Authoritative expected | Local actual | Fabric actual |
| --- | --- | --- | --- |
| Order | 1 | 1 | NOT VERIFIED |
| Current revision | 3 | 3 (original + 3 corrections retained) | NOT VERIFIED |
| Current lines | 5 | 5 | NOT VERIFIED |
| Currency | EUR | EUR | NOT VERIFIED |
| Subtotal | 37980 | 37980 | NOT VERIFIED |
| Discount | 9611.79 | 9611.79 | NOT VERIFIED |
| Final total | 28368.21 | 28368.21 | NOT VERIFIED |

The overview total_price is 28368, not the authoritative frozen total 28368.21.
Source lines: 411000=31590, 13101003=0, 410910=5905, 411701=150,
411594=335; quantities all 1. Seller Birger Pedersen, dealer account 10620,
delivery 2026-10-21, machine PO Hedemora Kommune, status ordre_afgivet.
These are test observations, not runtime constants. Full source mapping and IDs
remain in Supabase; no production customer extract is committed.

All 21 current orders projected locally: 14 VALID, 7 MISSING_SNAPSHOT, no invalid
current financial snapshots. Legacy gaps: O-7002, O-7004, O-7006, O-7007,
O-7008, O-7009, O-7012. They are not silently removed or repriced.

- Python model/schema tests: 26/26 PASS; artifact Python syntax PASS.
- Read-only SQL `source_quality.sql`: 21 headers, 14 valid / 7 documented gaps.
- Existing Portal targeted tests: 35/37 PASS, two baseline source-text failures:
  `order-purchase-references.test.ts:71` expects content in the old wrapper;
  `submitted-order-revision-confirmation.test.ts:10` expects an inline Danish label.
- `tsc --noEmit -p tsconfig.app.json`: FAIL on pre-existing Portal/test type errors
  (Academy, Configurator PDF and other files); src/supabase unchanged from origin/main.
- `npm run build`: PASS, existing bundle-size/import warnings.
- PySpark/Fabric runtime, pipeline validation, resulting lakehouse rows and semantic
  measures: NOT RUN because production orchestration access is incomplete.

Local test command: `python -B -m unittest discover -s fabric/portal_orders/tests -v`.
No Portal UI/business logic, Supabase schema/security or existing Fabric item was
changed. No email/order was sent. Deployment/execution is still required.
