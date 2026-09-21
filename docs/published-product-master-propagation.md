# Published Product Master propagation

## Audit evidence (2026-09-21)

725132 was already published at 17:37:14 UTC with:
`CS-200 Combi, for lad, manuel regulering.` / DKK 52,350 / EUR 7,050.
The old wording was not a failed publish. Three downstream defects hid it:

1. `list_published_configurator_prices` returned only DKK/EUR, not product text or SEK.
2. `loadPublishedConfiguratorPrices` discarded all non-price fields; null prices
   were also coerced to zero by `Number(null)`.
3. `marketingContentFor` gave the stored Marketing title unconditional priority.
   Both Timan 3330 and LOOSE_TOOL had the old title ending in `Husk lad og vogn`.
   In addition, the cart memo did not subscribe to published price revisions.

## Source map

| Consumer | Canonical source / treatment |
| --- | --- |
| Backend editable Price Lists | `price_list_items`: unpublished edits, costs, field-level audit; Backend-only |
| Published Product Master | `price_list_published`: identity, DKK/EUR/SEK, publication timestamp |
| Browser read | `list_published_product_master`: only public commercial fields and previous identity aliases; no costs, actors or raw audit |
| Static machines.ts | Immutable structural originals: IDs, groups, model relationships, dependencies, translations, media defaults. Fallback commercial values only for unpublished items/fields |
| Current PRODUCTS / ACCESSORIES exports | Resolved copies overlaid by published master. Static originals are not mutated |
| getAccessoriesFlat / loose tools | Same resolver, including children and duplicate contexts of one item number |
| Product cards / Marketing catalog / product editor | Resolved canonical identity plus separate Marketing enrichment |
| Video product selectors / recommendations | Existing shared catalog imports now read the resolved current objects |
| Cart / pricing engine | Same published sell prices; product revision invalidates calculation memo; sequential discounts and campaign rules untouched |
| Budget catalog | Shared resolved catalog; module-level machine defaults rebuilt on revision. Fiscal mappings, actual transaction amounts and Budget-only products untouched |
| Academy | Shared Configurator catalog when used; training constants, progression and write isolation unchanged |
| New offer/order / pre-snapshot PDF | Current resolved catalog, captured at the existing explicit snapshot boundary |
| Saved drafts with pricing snapshot | Preserve saved prices/text. New selected items use current master; no implicit blanket repricing |
| Legacy unsent draft without snapshot | Existing rule: current catalog until next explicit save creates snapshot |
| Sent/submitted documents / revisions / PDFs | Frozen lines and totals remain authoritative; preserved product names also survive revision recalculation |
| Import/seed + publish preview | Seed still supplies structural classification; publish preview compares to published values first, not static originals |

No group, model, active/inactive or translated-name columns exist in the live
published table. This change does not invent them. A new item without structural
catalog/model placement is not automatically made selectable. Item-number renames
also require an explicit relationship migration, not guessed remapping.

SEK is exposed as the published value for consumers that need it. The existing
Configurator transaction engine remains DKK/EUR, with its existing display-currency
conversion. This change does not introduce a new SEK transaction-pricing rule.

## Deterministic identity/enrichment merge

- Published `item_text_da` owns Danish product identity; existing other-language
  translations remain intact (no fabricated translations).
- Exact current/previous identity prefixes are replaced with current identity.
  Any suffix is preserved. For 725132 the result is:
  `CS-200 Combi, for lad, manuel regulering. Husk lad og vogn`.
- Prior identity aliases are metadata on the published record. An update trigger
  remembers the outgoing published identity. Initial aliases use only documented
  predecessors whose new identity matches the actually published text.
- No item-number-specific replacement, fuzzy text splitting, or hardcoded `Husk`
  rule is used.
- Unrecognised custom Marketing title text is retained as descriptive enrichment,
  not silently used instead of the canonical product identity. Stored Marketing
  records are not rewritten by resolving or reading them.
- Images, video, specifications, badges and campaign scheduling remain from their
  existing sources. Marketing cannot write catalog prices through this merge.

## Loading and publish semantics

`PublishedProductMasterBoundary` loads the master before catalog consumers mount.
Concurrent reads share an in-flight promise; no persistent browser catalog cache
exists. A failed initial read gives a retry state rather than selling at stale
static prices. Authentication routes remain reachable independently.

Successful publish refreshes master data and notifies the current catalog. New
sessions and reloads fetch again; no deployment is required for subsequent product
updates. Another already-open tab sees updates after reload (no realtime claim).
Publish success counts remain actual database writes, with per-row failures
reported separately. A failed post-publish refresh does not falsely report that
the already-committed publication itself rolled back.

## Security and migration

`20260921181718_published_product_master_resolution` adds identity alias metadata,
the maintenance trigger and an explicit public read RPC. Existing publish guard,
table RLS, costs, and old price-only RPC are unchanged. No historical commercial
records are updated.

Rollback: revert frontend consumer to the old price-only RPC first, then drop the
new read function, trigger/function and `identity_aliases` column. This loses only
derived identity-alias metadata, not product prices, product text or documents.

## Verification

- Pure resolver tests: price-only, text-only, both, arbitrary item numbers, null vs
  zero, enrichment, current selectors, notifications, frozen names/prices.
- Loader tests: in-flight dedupe, fresh reads, controlled error, auth availability,
  successful/partial publish results.
- Existing campaign, quantity, Academy, Budget, offer/order/PDF suites rerun.
- `supabase/tests/published_product_master_rollback.sql`: real SQL transaction
  verifies public safe read, published alias maintenance and unauthorized publish
  rejection; the transaction is rolled back completely.
- Live read confirms 725131/725132/725138 published text/prices and aliases.
- Full TypeScript/lint baseline has pre-existing failures; report these separately
  from this change rather than claiming a clean repository.
