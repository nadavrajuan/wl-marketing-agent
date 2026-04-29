import { runBigQuery } from "@/lib/bigquery";

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || "weightagent";
const CORE_DATASET_ID = process.env.BIGQUERY_DATASET || "WeightAgent";
const ANALYTICS_DATASET_ID = process.env.ANALYTICS_WL_DATASET || "analytics_wl";

function coreTable(name: string) {
  return `\`${PROJECT_ID}.${CORE_DATASET_ID}.${name}\``;
}

function analyticsEventsWildcard() {
  return `\`${PROJECT_ID}.${ANALYTICS_DATASET_ID}.events_*\``;
}

function buildDateFilter(params: URLSearchParams) {
  const queryParams: Record<string, unknown> = {};
  const clauses: string[] = [];

  const dateFrom = params.get("date_from");
  if (dateFrom) {
    clauses.push("_TABLE_SUFFIX >= @event_date_from");
    queryParams.event_date_from = dateFrom.replaceAll("-", "");
  }

  const dateTo = params.get("date_to");
  if (dateTo) {
    clauses.push("_TABLE_SUFFIX <= @event_date_to");
    queryParams.event_date_to = dateTo.replaceAll("-", "");
  }

  return {
    where: clauses.length ? `AND ${clauses.join(" AND ")}` : "",
    params: queryParams,
  };
}

const outboundBaseCtes = `
WITH visits_norm AS (
  SELECT
    id AS visit_id,
    LOWER(COALESCE(platform_id, 'unknown')) AS platform_id,
    entered_at_date,
    CAST(campaign_id AS STRING) AS campaign_id,
    CAST(adgroup_id AS STRING) AS adgroup_id,
    CAST(creative AS STRING) AS ad_id,
    CASE
      WHEN LOWER(COALESCE(device, '')) IN ('c', 'computer', 'desktop') THEN 'desktop'
      WHEN LOWER(COALESCE(device, '')) IN ('m', 'mobile') THEN 'mobile'
      WHEN LOWER(COALESCE(device, '')) IN ('t', 'tablet') THEN 'tablet'
      ELSE LOWER(COALESCE(device, 'unknown'))
    END AS device_type,
    TRIM(
      REGEXP_REPLACE(
        COALESCE(
          REGEXP_EXTRACT(landing_page, r'(?:[?&]ap_keyword=)([^&#]+)'),
          REGEXP_EXTRACT(landing_page, r'(?:[?&]utm_term=)([^&#]+)'),
          'unknown'
        ),
        r'(%20|\\+)',
        ' '
      )
    ) AS keyword,
    COALESCE(NULLIF(REGEXP_EXTRACT(landing_page, r'^https?://[^/]+([^?#]*)'), ''), '/') AS landing_page_path
  FROM ${coreTable("visits")}
),
conversions_norm AS (
  SELECT
    visit_id,
    COALESCE(brand_display_name, 'unknown') AS brand_name,
    CASE
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%reversed%' THEN 'purchase_reversal'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%purchase%' THEN 'purchase'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%add to cart%' THEN 'add_to_cart'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%lead%' THEN 'lead'
      ELSE 'other'
    END AS conversion_class
  FROM ${coreTable("conversions")}
),
partner_outbound_events AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    TIMESTAMP_MICROS(event_timestamp) AS event_ts,
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'sepunidb') AS visit_id,
    LOWER((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'partner_name')) AS partner_name,
    LOWER((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'brand_name')) AS brand_name,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_path') AS page_path,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'click_url') AS click_url,
    CAST(COALESCE(
      (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'rank'),
      SAFE_CAST((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'rank') AS INT64)
    ) AS INT64) AS rank
  FROM ${analyticsEventsWildcard()}
  WHERE event_name = 'partner_outbound'
)
`;

export async function getPartnerOutboundInsights(params: URLSearchParams, limit = 100) {
  const dateFilter = buildDateFilter(params);

  const sql = `
    ${outboundBaseCtes}
    SELECT
      COALESCE(v.platform_id, 'unknown') AS platform_id,
      COALESCE(v.campaign_id, 'unknown') AS campaign_id,
      COALESCE(v.keyword, 'unknown') AS keyword,
      COALESCE(v.landing_page_path, e.page_path, 'unknown') AS landing_page_path,
      COALESCE(e.partner_name, e.brand_name, 'unknown') AS partner_name,
      COALESCE(e.rank, 0) AS rank,
      COUNT(*) AS outbound_events,
      COUNT(DISTINCT e.visit_id) AS unique_visits,
      COUNTIF(c.conversion_class = 'purchase' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')) AS gross_partner_purchases,
      COUNTIF(c.conversion_class = 'purchase_reversal' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')) AS partner_reversals,
      COUNTIF(c.conversion_class = 'purchase' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown'))
      - COUNTIF(c.conversion_class = 'purchase_reversal' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')) AS net_partner_purchases,
      COUNTIF(c.conversion_class = 'add_to_cart' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')) AS matched_add_to_carts,
      ROUND(
        SAFE_DIVIDE(
          COUNTIF(c.conversion_class = 'purchase' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown'))
          - COUNTIF(c.conversion_class = 'purchase_reversal' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')),
          NULLIF(COUNT(DISTINCT e.visit_id), 0)
        ) * 100,
        2
      ) AS partner_purchase_rate_per_outbound_visit
    FROM partner_outbound_events e
    LEFT JOIN visits_norm v
      ON v.visit_id = e.visit_id
    LEFT JOIN conversions_norm c
      ON c.visit_id = e.visit_id
    WHERE e.visit_id IS NOT NULL
    ${dateFilter.where}
    GROUP BY platform_id, campaign_id, keyword, landing_page_path, partner_name, rank
    ORDER BY outbound_events DESC, net_partner_purchases DESC
    LIMIT ${limit}
  `;

  return runBigQuery(sql, dateFilter.params);
}

export async function getPartnerOutboundSummary(params: URLSearchParams) {
  const dateFilter = buildDateFilter(params);

  const sql = `
    ${outboundBaseCtes}
    SELECT
      COALESCE(e.partner_name, e.brand_name, 'unknown') AS partner_name,
      COUNT(*) AS outbound_events,
      COUNT(DISTINCT e.visit_id) AS unique_visits,
      COUNTIF(c.conversion_class = 'purchase' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')) AS gross_partner_purchases,
      COUNTIF(c.conversion_class = 'purchase_reversal' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')) AS partner_reversals,
      COUNTIF(c.conversion_class = 'purchase' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown'))
      - COUNTIF(c.conversion_class = 'purchase_reversal' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')) AS net_partner_purchases,
      ROUND(
        SAFE_DIVIDE(
          COUNTIF(c.conversion_class = 'purchase' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown'))
          - COUNTIF(c.conversion_class = 'purchase_reversal' AND LOWER(c.brand_name) = COALESCE(e.partner_name, e.brand_name, 'unknown')),
          NULLIF(COUNT(DISTINCT e.visit_id), 0)
        ) * 100,
        2
      ) AS partner_purchase_rate_per_outbound_visit
    FROM partner_outbound_events e
    LEFT JOIN conversions_norm c
      ON c.visit_id = e.visit_id
    WHERE e.visit_id IS NOT NULL
    ${dateFilter.where}
    GROUP BY partner_name
    ORDER BY outbound_events DESC
  `;

  return runBigQuery(sql, dateFilter.params);
}
