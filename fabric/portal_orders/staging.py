"""Additive raw ingestion for the existing Staging.Supabase namespace.

Call with the EXISTING authorized JDBC connection. Never store credentials here.
No writes occur on import. CRM leads and app_users are deliberately not selected.
"""

from .model import ContractError


SOURCES = ("configurations", "configuration_items", "configurator_order_correction_sessions", "dealer_accounts")
CONTRACT_TABLE = "Staging.Supabase.portal_order_source_contract"


def check_schema(previous, current):
    """Both dictionaries map (table, column) to exact PostgreSQL format_type."""
    if not current or any(not any(k[0] == t for k in current) for t in SOURCES):
        raise ContractError("Selected source table missing or inaccessible")
    removed = sorted(set(previous) - set(current))
    changed = sorted(k for k in previous if k in current and previous[k] != current[k])
    if removed or changed:
        raise ContractError(f"Destructive schema change: removed={removed}; changed={changed}")
    return sorted(set(current) - set(previous))


def read_metadata(spark, jdbc_url, properties):
    names = ",".join(f"'{name}'" for name in SOURCES)
    query = f"""(SELECT c.relname AS table_name, a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS source_type,
      t.typcategory AS type_category, a.attnum AS ordinal
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
      WHERE n.nspname='public' AND c.relname IN ({names})
      AND a.attnum>0 AND NOT a.attisdropped) AS metadata"""
    return spark.read.jdbc(jdbc_url, query, properties=properties)


def fingerprints(spark, jdbc_url, properties):
    parts = [f"SELECT '{t}' AS table_name, count(*) AS row_count, "
             f"md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' ORDER BY id),'')) AS digest "
             f'FROM public."{t}" s' for t in SOURCES]
    rows = [r.asDict() for r in spark.read.jdbc(jdbc_url, "(" + " UNION ALL ".join(parts) + ") AS hashes", properties=properties).collect()]
    return sorted(rows, key=lambda row: row["table_name"])


def prepare_staging(spark, jdbc_url, properties):
    """Read, cache and validate ALL frames before any Delta writes.

    Full refresh matches the existing Fabric pattern. Source fingerprints before
    and after materialization reject a concurrent source update, not just a
    timestamp watermark (correction confirmations have no updated_at column).
    """
    metadata = read_metadata(spark, jdbc_url, properties).cache()
    rows = metadata.collect()
    current = {(r.table_name, r.column_name): r.source_type for r in rows}
    previous = {(r.table_name, r.column_name): r.source_type for r in spark.table(CONTRACT_TABLE).collect()} if spark.catalog.tableExists(CONTRACT_TABLE) else {}
    check_schema(previous, current)
    before = fingerprints(spark, jdbc_url, properties)
    frames = {}
    try:
        for table in SOURCES:
            columns = []
            for row in sorted((r for r in rows if r.table_name == table), key=lambda r: r.ordinal):
                name = '"' + row.column_name.replace('"', '""') + '"'
                # Preserve arrays/JSON losslessly in RAW. Curated children are relational.
                if row.type_category == 'A':
                    columns.append(f"to_jsonb({name})::text AS {name}")
                elif row.source_type in ('jsonb', 'json', 'uuid'):
                    columns.append(f"{name}::text AS {name}")
                else:
                    columns.append(name)
            frame = spark.read.jdbc(jdbc_url, f'(SELECT {", ".join(columns)} FROM public."{table}") AS source', properties=properties).cache()
            frames[table] = frame
            frame.count()
            target = f"Staging.Supabase.{table}"
            if spark.catalog.tableExists(target):
                old = {f.name: f.dataType for f in spark.table(target).schema.fields}
                new = {f.name: f.dataType for f in frame.schema.fields}
                if any(name not in new or dtype != new[name] for name, dtype in old.items()):
                    raise ContractError(f"Incompatible Delta schema: {target}")
        if before != fingerprints(spark, jdbc_url, properties):
            raise ContractError("Sources changed during extraction; retry the whole order load")
        after = {(r.table_name, r.column_name): r.source_type for r in read_metadata(spark, jdbc_url, properties).collect()}
        if current != after:
            raise ContractError("Source schema changed during extraction; retry")
        return frames, metadata
    except Exception:
        for frame in frames.values():
            frame.unpersist()
        metadata.unpersist()
        raise


def publish_staging(frames, metadata):
    """Run only in the ingestion pipeline; gate downstream on successful completion."""
    if set(frames) != set(SOURCES):
        raise ContractError("Incomplete source batch")
    for table in SOURCES:
        frames[table].write.format("delta").mode("overwrite").option("mergeSchema", "true").saveAsTable(f"Staging.Supabase.{table}")
    metadata.write.format("delta").mode("overwrite").saveAsTable(CONTRACT_TABLE)
