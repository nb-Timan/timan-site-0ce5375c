-- Read-only source acceptance. Same latest-revision choice as the canonical RPC.
WITH orders AS (
  SELECT c.* FROM public.configurations c
  WHERE public.is_submitted_configurator_order(c)
), numbered AS (
  SELECT s.*, row_number() OVER (PARTITION BY configuration_id ORDER BY started_at,id) AS revision_number
  FROM public.configurator_order_correction_sessions s
), selected AS (
  SELECT o.id, o.order_number, o.total_price AS overview_total,
    coalesce(latest.revision_number,0) AS revision_number,
    coalesce(latest.after_snapshot, original.before_snapshot,
      jsonb_build_object('configuration',to_jsonb(o))) AS snapshot
  FROM orders o
  LEFT JOIN LATERAL (SELECT * FROM numbered n WHERE n.configuration_id=o.id
    AND n.status='completed' AND n.completed_at IS NOT NULL AND n.after_snapshot IS NOT NULL
    ORDER BY completed_at DESC,revision_number DESC LIMIT 1) latest ON true
  LEFT JOIN LATERAL (SELECT before_snapshot FROM numbered n WHERE n.configuration_id=o.id
    ORDER BY started_at,id LIMIT 1) original ON true
), financial AS (
  SELECT *,snapshot#>'{configuration,state_json,pricingSnapshot}' AS pricing FROM selected
)
SELECT id,order_number,revision_number,overview_total,
  pricing->>'currency' AS currency,
  jsonb_array_length(pricing->'lines') AS line_count,
  (pricing#>>'{totals,subtotal}')::numeric AS subtotal,
  (pricing#>>'{totals,totalDiscount}')::numeric AS discount,
  (pricing#>>'{totals,finalPrice}')::numeric AS total,
  (SELECT sum((line->>'total')::numeric) FROM jsonb_array_elements(pricing->'lines') line) AS line_sum,
  CASE WHEN pricing->'lines' IS NULL OR pricing->'totals' IS NULL THEN 'MISSING_SNAPSHOT'
       WHEN abs((pricing#>>'{totals,subtotal}')::numeric - (pricing#>>'{totals,totalDiscount}')::numeric
                - (pricing#>>'{totals,finalPrice}')::numeric)<=0.02
         AND abs((SELECT sum((line->>'total')::numeric) FROM jsonb_array_elements(pricing->'lines') line)
                 - (pricing#>>'{totals,subtotal}')::numeric)<=0.02 THEN 'VALID'
       ELSE 'INVALID_SNAPSHOT' END AS financial_status
FROM financial ORDER BY order_number;
