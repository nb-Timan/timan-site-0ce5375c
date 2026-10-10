# Fabric-Native Sales-Stock Lines

## Source And Price Evidence

Read-only Staging inspection on 2026-10-10 confirmed that the actual item
table is C5.INVENTABLE. The approved Fabric asset projection preserves raw
SKU, line text, asset-instance identity, serial/Brik, warehouse, account,
order and transaction quantity. It is not a sales-price projection.

C5.INVENTABLE exposes COSTPRICE, COSTCURRENCY, COSTPRICEUNIT, COSTPRICE2,
COSTPRICE2DATE, COSTPRICE3 and COSTPRICE3DATE. These are cost facts, not a
documented current selling price. SALESLINE.PRICE/CURRENCY are historical
sales-line facts; they are not used as a current standard selling price.
No current customer-price-group/validity source was proven in the available
Staging metadata. Do not infer a selling price from these fields.

The controlled existing exact/revision SKU resolver is supplemental. Only
a positive released price from price_list_published supplies an original
price. A static catalogue fallback is deliberately not a fresh stock-sale
price. In particular, 312010 has a static match but no released price in
the inspected dataset.

Without a verified price, the case displays "Salgspris kræver fastsættelse".
An authorized stock-sales actor must enter a positive adjusted base and
reason in the existing pricing flow. No product is created. Unknown item
type remains null. Raw Fabric SKU and text remain the commercial identity.

## Persistence And Safety

Migration 20261010160651_sales_stock_optional_catalogue.sql matches the
version recorded by the production migration API. It adds native quantity,
optional catalogue identity and price provenance fields. Existing commercial
state/snapshots are not backfilled or rebuilt.

The existing configuration triggers enforce source identity, quantity,
account/location, pricing permission, positive prices at commercial
boundaries, currency and immutable stored physical identity. Existing
shared-Brik guards remain in place. Audit stays append-only and helper
execution remains unavailable to ordinary clients.

Fresh source lines preserve fractional quantities without splitting them.
Stock price adjustment and extra dealer discount remain separate,
sequential applications. Normal campaign, demo, quantity and delivery
layers do not enter this separate pricing mode. NAV CSV represents stock
adjustments as the equivalent standard/base adjustment while retaining
the separate extra dealer discount, raw SKU and row-total parity.

Historical snapshots without the new priceSource field retain their old
catalogue-generated line shape and frozen original price.

## Verification

- 285 focused UI/domain tests passed, including the non-overlapping current
  main Loans-partner-selector integration.
- 24 local PostgreSQL security/guard test groups passed.
- Local component browser QA used a read-only real Fabric stock snapshot:
  210100-01, 210112-02 and 210123-00 could each be selected; shared Brik
  blocked independently selecting another component of the same group.
  Three independent assets transferred with raw identifiers and manual
  prices. Desktop and 390 px had no horizontal overflow.
- Local production build and git diff --check passed.
- Repository typecheck/scoped lint still contain pre-existing failures.
  They are not repaired as part of this stock-sales change.
- The browser component harness is not an authenticated full production
  business-flow acceptance. No production lead, quote, order or email was
  created by this verification. No Lovable build/preview was triggered.

## Changed Files

src/components/configurator/SalesStockPricingPanel.tsx
src/lib/calcConfiguration.ts
src/lib/configuratorAccountSummaries.ts
src/lib/configuratorPdf.ts
src/lib/configuratorPricing.ts
src/lib/configuratorState.ts
src/lib/salesStockConfigurator.ts
src/lib/submittedOrderCsv.ts
src/pages/ConfiguratorPage.tsx
src/pages/loans/FabricStockAssetBrowser.tsx
src/pages/loans/SalesStockSalePanel.tsx
src/test/fabric-loan-stock.test.tsx
src/test/sales-stock-configurator.test.ts
src/test/sales-stock-selection.test.tsx
src/test/sales-stock-source-lines.test.tsx
src/types/configurator.ts
scripts/test-sales-stock-optional-catalogue.mjs
supabase/migrations/20261010160651_sales_stock_optional_catalogue.sql
supabase/tests/sales_stock_optional_catalogue_security.sql
docs/sales-stock-source-pricing.md
