"""Cells/helpers for the existing nb_transform_fact_sales_order notebook.

Do not replace its C5 cell or reporting_lh.fact.fact_sales. The Portal facts
describe submitted document revisions, not ERP transactions or posted revenue.
"""

from .model import TABLES, ContractError, obj, project_order


def spark_schema(contract):
    from pyspark.sql import types as T
    types = {"string": T.StringType(), "long": T.LongType(), "boolean": T.BooleanType(),
             "timestamp": T.TimestampType(), "date": T.DateType(), "decimal": T.DecimalType(38, 12)}
    return T.StructType([T.StructField(name, types[kind], True) for name, kind in (pair.split(":") for pair in contract.split())])


def project_group(pair):
    _, (configurations, sessions) = pair
    configurations = list(configurations)
    if len(configurations) != 1:
        raise ContractError("Duplicate or missing configuration primary key")
    return project_order(configurations[0], list(sessions))


def build_frames(spark):
    from pyspark.sql import functions as F
    spark.conf.set("spark.sql.session.timeZone", "UTC")
    spark.conf.set("spark.sql.ansi.enabled", "true")
    configurations = spark.table("Staging.Supabase.configurations")
    sessions = spark.table("Staging.Supabase.configurator_order_correction_sessions")
    if sessions.join(configurations, sessions.configuration_id == configurations.id, "left_anti").limit(1).count():
        raise ContractError("Orphan correction session")
    # Spark's Python datetime rows lose timezone metadata; JSON retains UTC offsets
    # and obj parses JSON numbers as Decimal without a binary-float round trip.
    configurations = configurations.toJSON().map(obj).map(lambda r: (r["id"], r))
    sessions = sessions.toJSON().map(obj).map(lambda r: (r["configuration_id"], r))
    projected = configurations.cogroup(sessions).map(project_group).cache()
    frames = {}
    try:
        for name, contract in TABLES.items():
            # Explicit schemas also work when a source/child table is empty.
            frame = spark.createDataFrame(projected.flatMap(lambda rows, n=name: rows[n]), spark_schema(contract)).cache()
            frame.count()
            frames[name] = frame
        validate_frames(frames)
        customers = spark.table("reporting_lh.dim.dim_customer").select("customer_number", "key_customer")
        dealers = spark.table("Staging.Supabase.dealer_accounts").select(F.col("id").alias("dealer_id"), F.col("account_number").alias("customer_number"))
        if dealers.groupBy("dealer_id").count().filter("count > 1").limit(1).count():
            raise ContractError("Duplicate dealer ID")
        # Reuse the EXISTING dimension key. Do not recreate its hash or guess company.
        unique_customers = customers.groupBy("customer_number").agg(F.count("*").alias("matches"), F.first("key_customer").alias("key_customer")).filter("matches = 1").drop("matches")
        enriched = frames["order"].join(dealers, "dealer_id", "left").join(unique_customers, "customer_number", "left")
        if enriched.count() != frames["order"].count():
            raise ContractError("Customer join multiplied orders")
        enriched = enriched.cache()
        enriched.count()
        frames["order"].unpersist()
        frames["order"] = enriched
        return frames
    except Exception:
        for frame in frames.values():
            frame.unpersist()
        raise
    finally:
        projected.unpersist()


def validate_frames(frames):
    keys = {"order": "order_id", "revision": "revision_key", "line": "line_key",
            "machine": "machine_key", "discount": "discount_key", "reference": "reference_key"}
    for name, key in keys.items():
        if frames[name].filter(f"{key} IS NULL").limit(1).count() or frames[name].groupBy(key).count().filter("count <> 1").limit(1).count():
            raise ContractError(f"Invalid primary key: {name}")
    for child in ("revision", "line", "machine", "discount", "reference"):
        if frames[child].join(frames["order"], "order_id", "left_anti").limit(1).count():
            raise ContractError(f"Orphan order: {child}")
    for child in ("line", "machine", "discount", "reference"):
        if frames[child].join(frames["revision"], ["order_id", "revision_key"], "left_anti").limit(1).count():
            raise ContractError(f"Orphan revision: {child}")
    current = frames["revision"].filter("is_current")
    if current.groupBy("order_id").count().filter("count <> 1").limit(1).count():
        raise ContractError("Multiple current revisions")
    if frames["order"].join(current.selectExpr("order_id", "revision_key AS current_revision_key"), ["order_id", "current_revision_key"], "left_anti").limit(1).count():
        raise ContractError("Missing current revision")
    if frames["line"].filter("machine_key IS NOT NULL").join(frames["machine"], ["order_id", "revision_key", "machine_key"], "left_anti").limit(1).count():
        raise ContractError("Orphan machine link")
    if frames["reference"].filter("line_key IS NOT NULL").join(frames["line"], ["order_id", "revision_key", "line_key"], "left_anti").limit(1).count():
        raise ContractError("Orphan reference line")


def publish_frames(frames):
    """Invoke only after ALL frame checks and downstream refresh gating are wired."""
    validate_frames(frames)
    if frames["quality"].filter("code = 'INVALID_SNAPSHOT'").limit(1).count():
        raise ContractError("Invalid financial snapshots: publication blocked")
    for name, frame in frames.items():
        frame.write.format("delta").mode("overwrite").saveAsTable(f"reporting_lh.fact.fact_portal_order_{name}" if name != "order" else "reporting_lh.fact.fact_portal_order")
