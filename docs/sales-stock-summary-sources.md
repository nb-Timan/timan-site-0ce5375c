# Sales-stock overview: sources and coverage

The four compact cards use the exact filtered rows returned by the existing
FabricStockAssetBrowser. Warehouse, account, search (including the existing
catalogue/loan search aliases), and snapshot refresh apply equally to the list
and summary. The summary is rendered into the existing page-header space,
between title/description and New loan. No independent inventory query or
filter state is introduced. At 1180 px and above all four cards share a row;
smaller widths use two columns. Portal popovers render above the stock list.

## Source inspection, 2026-10-10

Read-only queries were run in the existing Fabric Staging SQL analytics
endpoint. No Fabric/C5 masterdata, permissions or pipelines were modified.

- `C5.INVENTABLE` is the actual item-table spelling. It has COSTPRICE,
  COSTPRICEUNIT, COSTCURRENCY, COSTINGMETHOD, COSTTYPE and LASTMOVEMENTDATE.
  These are item/master facts; their presence alone does not establish the
  carrying value or receipt date of a particular physical stock asset.
- `C5.INVENTORYSUM` has item/location INVENTORY, RESERVED, RECEIVED and
  LASTCHANGED. RECEIVED is a numeric quantity, not a receipt date. This table
  does not expose a verified per-asset monetary field in the inspected schema.
- `C5.INVENTRANS` has QTY, COSTAMOUNT, CURRENCY, DATE_, SERIALNUMBER,
  INVENLOCATION, SETTLEDQTY and transaction/invoice references. It contains
  movements across time and currencies. MIN(DATE_) is not automatically the
  receipt date of the current physical asset, and summing COSTAMOUNT is not
  automatically a validated asset valuation.
- `C5.SALESLINE` PRICE/AMOUNT and CREATED/DELIVERY are sales/order facts,
  not a verified inventory-value or stock-age source.

The physical example RC-751 serial 410040-01-0386 has one matching Lager 2
transaction (quantity 1, COSTAMOUNT 61,908.59, currency DKK, DATE_ 2026-09-21).
This is a useful candidate for further provenance validation, not a value
hardcoded into the Portal. Nonserialized 210100-01 and 210123-00 movements
contain a control-character serial placeholder and multiple historical dates
and currencies. They cannot safely be bound to the current Brik solely by SKU.

The current `fabric_loan_assets_current` table and signed Fabric push contract
expose **neither a validated inventory value/currency/reference nor an actual
receipt date/reference**. `stock_last_changed`, `source_as_of`, `synced_at`,
Configurator prices and sales-stock manual prices are not substituted.

Consequently the production resolver deliberately returns unavailable facts:
the UI shows the missing-value line count and "Lageralder ikke tilgængelig".
It does not claim a complete stock value or invent a top-three ranking. The
current work introduces no database migration, extra data store, browser
Fabric credentials, source writes or changes to reservation/pricing rules.

## Calculation rules and later source integration

- Quantity sums the native `inventory_qty` once per canonical physical group.
  Shared Brik component rows remain separate source rows but share one physical
  count. An 18-piece source line remains one line and contributes 18 pieces.
  Conflicting quantities, serials, warehouses or identity flags are shown as
  unresolved groups, never silently converted to one piece.
- Monetary inputs must be verified **total line values**, with explicit DKK
  currency and economic-line reference. No implicit currency conversion or
  multiplication of an already-total line value is performed. Repeated
  references within one physical group count once; conflicting amounts or
  cross-group references are excluded. Round the aggregate to two decimals.
- Rankings combine documented component line values inside the filtered
  physical group. A group with incomplete value coverage is excluded from the
  expensive ranking, while its documented lines can contribute to the clearly
  labelled partial total. Missing values are never ranked as zero.
- Age requires a verified receipt reference and a valid native date. Conflicting
  group dates, impossible dates and future dates are excluded. Refresh/change
  timestamps do not establish age.

Before enabling numeric values/age in production, extend the **existing**
read-only Fabric projection and signed ingest, retaining one typed column per
business attribute. Validate exact physical identity, ledger settlement/cost
semantics, currency, quantity/line scope, receipt provenance and shared-Brik
component allocation. Only then connect that validated projection to
`currentFabricStockFacts`. Merely exporting the diagnostic SQL results or
copying a master/order cost into an asset is insufficient.

## Reproducible QA

Run focused Fabric stock/summary and sales-stock tests, typecheck, scoped lint,
build and `git diff --check`. The existing isolated browser fixture can be run
with `SALES_STOCK_QA_PORT=5224 node scripts/sales-stock-browser-fixture.mjs`.
`/` tests actual unavailable production facts and the real stock-panel header;
`/summary-qa` supplies explicitly synthetic valuation/receipt facts to the same
summary and browser components to test ranking, popups and Find item. These
facts never enter Supabase, Fabric, commercial cases or exports.
