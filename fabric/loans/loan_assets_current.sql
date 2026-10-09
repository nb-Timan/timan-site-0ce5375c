CREATE OR ALTER VIEW C5.loan_assets_current AS
WITH stock_all AS (
    SELECT s.*,
        NULLIF(TRIM(REPLACE(s.DATASET, CHAR(2), '')), '') AS company,
        NULLIF(TRIM(REPLACE(s.ITEMNUMBER, CHAR(2), '')), '') AS item_number,
        NULLIF(TRIM(REPLACE(s.SERIALNUMBER, CHAR(2), '')), '') AS serial_number,
        NULLIF(TRIM(REPLACE(s.INVENLOCATION, CHAR(2), '')), '') AS location_code
    FROM C5.INVENITEMTRACK s
), serial_identity AS (
    SELECT company, UPPER(serial_number) AS serial_identity,
        COUNT(DISTINCT ITEMNUMBER) AS positive_item_count,
        COUNT(DISTINCT INVENLOCATION) AS positive_location_count,
        COUNT(DISTINCT SERIALNUMBER) AS source_serial_variants
    FROM stock_all
    WHERE INVENTORY > 0 AND serial_number IS NOT NULL
    GROUP BY company, UPPER(serial_number)
), stock_keys AS (
    SELECT DATASET, ITEMNUMBER, SERIALNUMBER, INVENLOCATION, COUNT_BIG(*) AS source_key_count
    FROM stock_all
    GROUP BY DATASET, ITEMNUMBER, SERIALNUMBER, INVENLOCATION
), stock AS (
    SELECT * FROM stock_all WHERE INVENTORY > 0 AND location_code IN ('2', '4')
), items AS (
    SELECT DATASET, ITEMNUMBER, MAX(ITEMNAME1) AS item_name, COUNT_BIG(*) AS item_match_count
    FROM C5.INVENTABLE GROUP BY DATASET, ITEMNUMBER
), locations AS (
    SELECT DATASET, INVENLOCATION, MAX(NAME) AS source_location_name, COUNT_BIG(*) AS location_match_count
    FROM C5.INVENLOCATION GROUP BY DATASET, INVENLOCATION
), sales_links AS (
    SELECT s.DATASET, s.ROWNUMBER AS stock_row_number, l.ROWNUMBER AS sales_line_row_number,
        NULLIF(TRIM(REPLACE(h.ACCOUNT, CHAR(2), '')), '') AS account_number,
        NULLIF(TRIM(REPLACE(l.NUMBER_, CHAR(2), '')), '') AS order_number,
        l.LINENUMBER AS line_number, NULLIF(TRIM(REPLACE(l.TXT, CHAR(2), '')), '') AS line_text,
        l.OPEN_ AS sales_line_open,
        MAX(CASE WHEN l.OPEN_ = 1 THEN 1 ELSE 0 END) OVER
            (PARTITION BY s.DATASET, s.ROWNUMBER) AS has_open_relation
    FROM stock s
    JOIN C5.SALESLINE l
      ON l.DATASET = s.DATASET AND l.ITEMNUMBER = s.ITEMNUMBER AND l.SERIALNUMBER = s.SERIALNUMBER
    JOIN C5.SALESTABLE h ON h.DATASET = l.DATASET AND h.NUMBER_ = l.NUMBER_
), sales_resolved AS (
    SELECT DATASET, stock_row_number, COUNT(DISTINCT account_number) AS account_count,
        SUM(CASE WHEN account_number IS NULL THEN 1 ELSE 0 END) AS missing_account_links,
        COUNT_BIG(*) AS relation_count, COUNT(DISTINCT sales_line_row_number) AS distinct_line_count,
        CASE WHEN COUNT(DISTINCT account_number) = 1 THEN MIN(account_number) END AS account_number,
        CASE WHEN COUNT(DISTINCT order_number) = 1 THEN MIN(order_number) END AS order_number,
        CASE WHEN COUNT_BIG(*) = 1 THEN MIN(line_number) END AS line_number,
        CASE WHEN COUNT_BIG(*) = 1 THEN MIN(line_text) END AS line_text,
        CASE WHEN COUNT_BIG(*) = 1 THEN MIN(sales_line_row_number) END AS sales_line_row_number,
        MAX(CASE WHEN sales_line_open = 1 THEN 1 ELSE 0 END) AS sales_line_open
    FROM sales_links
    WHERE has_open_relation = 0 OR sales_line_open = 1
    GROUP BY DATASET, stock_row_number
), invoices AS (
    SELECT t.DATASET, t.ITEMNUMBER, t.SERIALNUMBER, t.ROWNUMBER, t.DATE_, t.ACCOUNT,
        t.INVOICENUMBER, t.QTY,
        ROW_NUMBER() OVER (PARTITION BY t.DATASET, t.ITEMNUMBER, t.SERIALNUMBER
            ORDER BY t.DATE_ DESC, t.ROWNUMBER DESC) AS invoice_rank
    FROM C5.INVENTRANS t
    WHERE t.MODULE = 5 AND t.INVENTRANSTYPE = 2 AND t.INVENSTATUS = 0 AND t.DELETED = 0
      AND NULLIF(TRIM(REPLACE(t.INVOICENUMBER, CHAR(2), '')), '') IS NOT NULL
      AND NULLIF(TRIM(REPLACE(t.SERIALNUMBER, CHAR(2), '')), '') IS NOT NULL
), invoice_totals AS (
    SELECT DATASET, ITEMNUMBER, SERIALNUMBER, SUM(QTY) AS invoiced_net_qty,
        SUM(CASE WHEN QTY < 0 THEN 1 ELSE 0 END) AS sale_posting_count,
        SUM(CASE WHEN QTY > 0 THEN 1 ELSE 0 END) AS return_posting_count
    FROM invoices GROUP BY DATASET, ITEMNUMBER, SERIALNUMBER
), sale_history AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY DATASET, ITEMNUMBER, SERIALNUMBER
        ORDER BY DATE_ DESC, ROWNUMBER DESC) AS sale_rank
    FROM invoices WHERE QTY < 0
), settlement_refs AS (
    SELECT DATASET, ITEMNUMBER, REFRECID AS posting_row_number
    FROM C5.INVENTRANSSETTLE WHERE CANCELLED = 0 AND REFFILEID = 55
    UNION
    SELECT DATASET, ITEMNUMBER, OFFSETREFRECID AS posting_row_number
    FROM C5.INVENTRANSSETTLE WHERE CANCELLED = 0 AND OFFSETREFFILEID = 55
), evidence AS (
    SELECT s.*, i.item_name, COALESCE(i.item_match_count, 0) AS item_match_count,
        loc.source_location_name, COALESCE(loc.location_match_count, 0) AS location_match_count,
        COALESCE(k.source_key_count, 0) AS source_key_count,
        COALESCE(si.positive_item_count, 0) AS positive_item_count,
        COALESCE(si.positive_location_count, 0) AS positive_location_count,
        COALESCE(si.source_serial_variants, 0) AS source_serial_variants,
        r.account_number, r.order_number, r.line_number, r.line_text,
        r.sales_line_row_number, r.sales_line_open,
        COALESCE(r.account_count, 0) AS account_count,
        COALESCE(r.missing_account_links, 0) AS missing_account_links,
        COALESCE(r.relation_count, 0) AS relation_count,
        COALESCE(r.distinct_line_count, 0) AS distinct_line_count,
        COALESCE(it.sale_posting_count, 0) AS sale_posting_count,
        COALESCE(it.return_posting_count, 0) AS return_posting_count,
        it.invoiced_net_qty, latest.ROWNUMBER AS invoice_source_row_number,
        latest.DATE_ AS invoice_source_date,
        NULLIF(TRIM(REPLACE(latest.INVOICENUMBER, CHAR(2), '')), '') AS invoice_number,
        CASE WHEN it.sale_posting_count > 0 AND it.return_posting_count > 0 AND it.invoiced_net_qty = 0
          AND latest.QTY > 0 AND latest.ACCOUNT = sale.ACCOUNT
          AND (latest.DATE_ > sale.DATE_ OR (latest.DATE_ = sale.DATE_ AND latest.ROWNUMBER > sale.ROWNUMBER))
          THEN 1 ELSE 0 END AS return_proven,
        CASE WHEN sr.posting_row_number IS NOT NULL THEN 1 ELSE 0 END AS return_settlement_found
    FROM stock s
    LEFT JOIN items i ON i.DATASET = s.DATASET AND i.ITEMNUMBER = s.ITEMNUMBER
    LEFT JOIN locations loc ON loc.DATASET = s.DATASET AND loc.INVENLOCATION = s.INVENLOCATION
    LEFT JOIN stock_keys k ON k.DATASET = s.DATASET AND k.ITEMNUMBER = s.ITEMNUMBER
      AND k.SERIALNUMBER = s.SERIALNUMBER AND k.INVENLOCATION = s.INVENLOCATION
    LEFT JOIN serial_identity si ON si.company = s.company AND si.serial_identity = UPPER(s.serial_number)
    LEFT JOIN sales_resolved r ON r.DATASET = s.DATASET AND r.stock_row_number = s.ROWNUMBER
    LEFT JOIN invoice_totals it ON it.DATASET = s.DATASET AND it.ITEMNUMBER = s.ITEMNUMBER
      AND it.SERIALNUMBER = s.SERIALNUMBER
    LEFT JOIN invoices latest ON latest.DATASET = s.DATASET AND latest.ITEMNUMBER = s.ITEMNUMBER
      AND latest.SERIALNUMBER = s.SERIALNUMBER AND latest.invoice_rank = 1
    LEFT JOIN sale_history sale ON sale.DATASET = s.DATASET AND sale.ITEMNUMBER = s.ITEMNUMBER
      AND sale.SERIALNUMBER = s.SERIALNUMBER AND sale.sale_rank = 1
    LEFT JOIN settlement_refs sr ON sr.DATASET = latest.DATASET AND sr.ITEMNUMBER = latest.ITEMNUMBER
      AND sr.posting_row_number = latest.ROWNUMBER
), flags AS (
    SELECT e.*,
        CASE WHEN positive_item_count > 1 OR positive_location_count > 1 OR source_serial_variants > 1
          OR source_key_count > 1 OR item_match_count > 1 THEN 1 ELSE 0 END AS identity_conflict,
        CASE WHEN positive_item_count > 1 THEN 1 ELSE 0 END AS duplicate_serial_item_conflict,
        CASE WHEN account_count = 0 OR missing_account_links > 0 THEN 1 ELSE 0 END AS account_missing,
        CASE WHEN account_count > 1 OR relation_count <> distinct_line_count THEN 1 ELSE 0 END AS account_conflict,
        CASE WHEN sale_posting_count > 0 AND return_proven = 0 THEN 1 ELSE 0 END AS sold_conflict,
        CASE WHEN item_match_count = 0 THEN 1 ELSE 0 END AS item_missing,
        CASE WHEN location_match_count <> 1 THEN 1 ELSE 0 END AS location_unresolved
    FROM evidence e
    WHERE account_number IN ('1010', '1020') OR account_number IS NULL
      OR account_count > 1 OR missing_account_links > 0
), classified AS (
    SELECT f.*,
        CASE WHEN identity_conflict = 1 THEN 'IDENTITY_CONFLICT'
          WHEN account_missing = 1 THEN 'ACCOUNT_NOT_RESOLVED'
          WHEN account_conflict = 1 THEN 'ACCOUNT_RELATION_CONFLICT'
          WHEN serial_number IS NULL THEN 'SERIAL_NOT_RESOLVED'
          WHEN item_missing = 1 THEN 'ITEM_NOT_RESOLVED'
          WHEN location_unresolved = 1 THEN 'LOCATION_NOT_RESOLVED'
          WHEN sold_conflict = 1 THEN 'SOLD_CONFLICT'
        END AS review_reason
    FROM flags f
), serialized_assets AS (
    SELECT company, account_number, order_number, line_number, item_number, item_name, line_text,
        serial_number, location_code AS warehouse_location_code,
        CASE location_code WHEN '2' THEN N'Lager 2 - Nye ubrugte salgslagermaskiner'
          WHEN '4' THEN N'Lager 4 - Brugte salgslagermaskiner' END AS warehouse_location_name,
        source_location_name AS warehouse_source_name, INVENTORY AS inventory_qty,
        RESERVED AS reserved_qty, DELIVERED AS delivered_qty, RECEIVED AS received_qty,
        PULLED AS pulled_qty, ORDERED AS ordered_qty, MARKEDPHYSICAL AS marked_physical_qty,
        OPEN_ AS open_flag, LASTCHANGED AS stock_last_changed, ROWNUMBER AS source_row_number,
        DATASET AS source_dataset, ITEMNUMBER AS source_item_number, SERIALNUMBER AS source_serial_number,
        INVENLOCATION AS source_location_code, sales_line_row_number, sales_line_open,
        CAST(CASE WHEN review_reason IS NOT NULL THEN 1 ELSE 0 END AS bit) AS review_required,
        review_reason, CAST(sold_conflict AS bit) AS sold_conflict,
        CAST(identity_conflict AS bit) AS identity_conflict,
        CAST(duplicate_serial_item_conflict AS bit) AS duplicate_serial_item_conflict,
        CAST(account_missing AS bit) AS account_missing, CAST(account_conflict AS bit) AS account_conflict,
        CAST(item_missing AS bit) AS item_missing, CAST(location_unresolved AS bit) AS location_unresolved,
        CAST(return_proven AS bit) AS return_proven,
        CAST(return_settlement_found AS bit) AS return_settlement_found,
        invoice_source_row_number, invoice_source_date, invoice_number,
        CASE WHEN identity_conflict = 1 THEN 'IDENTITY_CONFLICT'
          WHEN review_reason IS NOT NULL THEN 'REVIEW_REQUIRED' ELSE 'LOAN_CANDIDATE' END AS classification,
        CONCAT('SERIAL|', company, '|', UPPER(serial_number)) AS asset_instance_id,
        CAST(1 AS int) AS instance_ordinal
    FROM classified
), nonserialized_lines AS (
    SELECT NULLIF(TRIM(REPLACE(l.DATASET, CHAR(2), '')), '') AS company,
        NULLIF(TRIM(REPLACE(h.ACCOUNT, CHAR(2), '')), '') AS account_number,
        NULLIF(TRIM(REPLACE(l.NUMBER_, CHAR(2), '')), '') AS order_number,
        l.LINENUMBER AS line_number,
        NULLIF(TRIM(REPLACE(l.ITEMNUMBER, CHAR(2), '')), '') AS item_number,
        i.item_name, NULLIF(TRIM(REPLACE(l.TXT, CHAR(2), '')), '') AS line_text,
        NULLIF(TRIM(REPLACE(l.INVENLOCATION, CHAR(2), '')), '') AS location_code,
        loc.source_location_name, COALESCE(i.item_match_count, 0) AS item_match_count,
        COALESCE(loc.location_match_count, 0) AS location_match_count,
        l.QTY, l.OPEN_, l.LASTCHANGED, l.ROWNUMBER, l.DATASET, l.ITEMNUMBER,
        l.INVENLOCATION, l.ROWNUMBER AS sales_line_row_number
    FROM C5.SALESLINE l
    JOIN C5.SALESTABLE h ON h.DATASET = l.DATASET AND h.NUMBER_ = l.NUMBER_
    LEFT JOIN items i ON i.DATASET = l.DATASET AND i.ITEMNUMBER = l.ITEMNUMBER
    LEFT JOIN locations loc ON loc.DATASET = l.DATASET AND loc.INVENLOCATION = l.INVENLOCATION
    WHERE NULLIF(TRIM(REPLACE(l.SERIALNUMBER, CHAR(2), '')), '') IS NULL
      AND NULLIF(TRIM(REPLACE(l.INVENLOCATION, CHAR(2), '')), '') IN ('2', '4')
      AND NULLIF(TRIM(REPLACE(h.ACCOUNT, CHAR(2), '')), '') IN ('1010', '1020')
      AND l.OPEN_ = 1 AND l.QTY > 0
), nonserialized_assets AS (
    SELECT company, account_number, order_number, line_number, item_number, item_name, line_text,
        CAST(NULL AS nvarchar(255)) AS serial_number, location_code AS warehouse_location_code,
        CASE location_code WHEN '2' THEN N'Lager 2 - Nye ubrugte salgslagermaskiner'
          WHEN '4' THEN N'Lager 4 - Brugte salgslagermaskiner' END AS warehouse_location_name,
        source_location_name AS warehouse_source_name, QTY AS inventory_qty,
        CAST(NULL AS numeric(32,12)) AS reserved_qty, CAST(NULL AS numeric(32,12)) AS delivered_qty,
        CAST(NULL AS numeric(32,12)) AS received_qty, CAST(NULL AS numeric(32,12)) AS pulled_qty,
        CAST(NULL AS numeric(32,12)) AS ordered_qty, CAST(NULL AS numeric(32,12)) AS marked_physical_qty,
        OPEN_ AS open_flag, LASTCHANGED AS stock_last_changed, ROWNUMBER AS source_row_number,
        DATASET AS source_dataset, ITEMNUMBER AS source_item_number,
        CAST(NULL AS nvarchar(255)) AS source_serial_number, INVENLOCATION AS source_location_code,
        sales_line_row_number, OPEN_ AS sales_line_open,
        CAST(CASE WHEN item_match_count <> 1 OR location_match_count <> 1 OR QTY <> FLOOR(QTY)
          THEN 1 ELSE 0 END AS bit) AS review_required,
        CASE WHEN item_match_count <> 1 THEN 'ITEM_NOT_RESOLVED'
          WHEN location_match_count <> 1 THEN 'LOCATION_NOT_RESOLVED'
          WHEN QTY <> FLOOR(QTY) THEN 'NON_INTEGER_QTY' END AS review_reason,
        CAST(0 AS bit) AS sold_conflict, CAST(0 AS bit) AS identity_conflict,
        CAST(0 AS bit) AS duplicate_serial_item_conflict, CAST(0 AS bit) AS account_missing,
        CAST(0 AS bit) AS account_conflict, CAST(CASE WHEN item_match_count <> 1 THEN 1 ELSE 0 END AS bit) AS item_missing,
        CAST(CASE WHEN location_match_count <> 1 THEN 1 ELSE 0 END AS bit) AS location_unresolved,
        CAST(0 AS bit) AS return_proven, CAST(0 AS bit) AS return_settlement_found,
        CAST(NULL AS bigint) AS invoice_source_row_number, CAST(NULL AS datetime2) AS invoice_source_date,
        CAST(NULL AS nvarchar(255)) AS invoice_number,
        CASE WHEN item_match_count <> 1 OR location_match_count <> 1 OR QTY <> FLOOR(QTY)
          THEN 'REVIEW_REQUIRED' ELSE 'LOAN_CANDIDATE' END AS classification,
        CONCAT('LINE|', company, '|', ROWNUMBER, '|', item_number, '|', location_code, '|',
          COALESCE(order_number, ''), '|', COALESCE(CONVERT(varchar(64), line_number), ''), '|1')
          AS asset_instance_id,
        CAST(1 AS int) AS instance_ordinal
    FROM nonserialized_lines
)
SELECT * FROM serialized_assets
UNION ALL
SELECT * FROM nonserialized_assets;
