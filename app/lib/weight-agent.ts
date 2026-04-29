import { runBigQuery } from "@/lib/bigquery";
import {
  getGoogleAdCopyDiagnostics,
  getGoogleKeywordOpportunities,
  getGoogleSearchQueryDiagnostics,
  getGoogleTransferInventory,
} from "@/lib/google-ads-transfer";

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || "weightagent";
const DATASET_ID = process.env.BIGQUERY_DATASET || "WeightAgent";
const GOOGLE_ADS_DATASET_ID = process.env.GOOGLE_ADS_DATASET || "GoogleAds";
const GOOGLE_ADS_CUSTOMER_SUFFIX = process.env.GOOGLE_ADS_CUSTOMER_SUFFIX || "4808949235";
export const PURCHASE_VALUE_USD = Number(process.env.DEFAULT_PURCHASE_VALUE_USD || "390");
export const ADD_TO_CART_SHARE_OF_PURCHASE = Number(
  process.env.DEFAULT_ADD_TO_CART_SHARE_OF_PURCHASE || "0.25",
);
export const ADD_TO_CART_VALUE_USD = Number(
  process.env.DEFAULT_ADD_TO_CART_VALUE_USD || String(PURCHASE_VALUE_USD * ADD_TO_CART_SHARE_OF_PURCHASE),
);

function table(name: string) {
  return `\`${PROJECT_ID}.${DATASET_ID}.${name}\``;
}

function googleAdsTable(name: string) {
  return `\`${PROJECT_ID}.${GOOGLE_ADS_DATASET_ID}.${name}_${GOOGLE_ADS_CUSTOMER_SUFFIX}\``;
}

const baseCtes = String.raw`
WITH visits_norm AS (
  SELECT
    id,
    LOWER(COALESCE(platform_id, 'unknown')) AS platform_id,
    TIMESTAMP_SECONDS(entered_at) AS entered_at_ts,
    entered_at_date,
    CAST(campaign_id AS STRING) AS campaign_id,
    CAST(adgroup_id AS STRING) AS adgroup_id,
    CAST(creative AS STRING) AS ad_id,
    LOWER(COALESCE(match_type, 'unknown')) AS match_type,
    LOWER(COALESCE(network, 'unknown')) AS network,
    COALESCE(user_country, 'unknown') AS user_country,
    CASE
      WHEN LOWER(device) IN ('m', 'mobile') THEN 'mobile'
      WHEN LOWER(device) IN ('c', 'computer', 'desktop') THEN 'desktop'
      WHEN LOWER(device) IN ('t', 'tablet') THEN 'tablet'
      ELSE LOWER(COALESCE(device, 'unknown'))
    END AS device_type,
    COALESCE(NULLIF(REGEXP_EXTRACT(landing_page, r'^https?://[^/]+([^?#]*)'), ''), '/') AS landing_page_path,
    REGEXP_EXTRACT(landing_page, r'(?:[?&]dti=)([^&#]+)') AS dti,
    REGEXP_EXTRACT(landing_page, r'(?:[?&](?:dbi|dbi1)=)([^&#]+)') AS dbi,
    REGEXP_EXTRACT(landing_page, r'(?:[?&]utm_campaign=)([^&#]+)') AS utm_campaign,
    REGEXP_EXTRACT(landing_page, r'(?:[?&]utm_term=)([^&#]+)') AS utm_term,
    REGEXP_EXTRACT(landing_page, r'(?:[?&]ap_keyword=)([^&#]+)') AS ap_keyword,
    TRIM(
      REGEXP_REPLACE(
        COALESCE(
          REGEXP_EXTRACT(landing_page, r'(?:[?&]ap_keyword=)([^&#]+)'),
          REGEXP_EXTRACT(landing_page, r'(?:[?&]utm_term=)([^&#]+)'),
          'unknown'
        ),
        r'(%20|\+)',
        ' '
      )
    ) AS keyword,
    landing_page
  FROM ${table("visits")}
),
conversions_norm AS (
  SELECT
    id,
    visit_id,
    TIMESTAMP_SECONDS(conversion_at) AS conversion_at_ts,
    DATE(TIMESTAMP_SECONDS(conversion_at)) AS conversion_date,
    SAFE_CAST(value AS FLOAT64) AS raw_value_usd,
    SAFE_CAST(affiliate_value AS FLOAT64) AS affiliate_value_usd,
    SAFE_CAST(projected_value AS FLOAT64) AS projected_value_usd,
    conversion_type_display_name,
    funnel_step,
    funnel_step_description,
    COALESCE(brand_display_name, 'unknown') AS brand_name,
    is_first,
    is_partner,
    CASE
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%reversed%' THEN 'purchase_reversal'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%purchase%' THEN 'purchase'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%add to cart%' THEN 'add_to_cart'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%lead%' THEN 'lead'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%quiz complete%' THEN 'quiz_complete'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%quiz start%' THEN 'quiz_start'
      WHEN LOWER(COALESCE(funnel_step_description, '')) = 'quiz complete' THEN 'quiz_complete'
      WHEN LOWER(COALESCE(funnel_step_description, '')) = 'quiz start' THEN 'quiz_start'
      ELSE 'other'
    END AS conversion_class,
    CASE
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%reversed%' THEN -COALESCE(
        NULLIF(SAFE_CAST(value AS FLOAT64), 0),
        NULLIF(SAFE_CAST(projected_value AS FLOAT64), 0),
        NULLIF(SAFE_CAST(affiliate_value AS FLOAT64), 0),
        ${PURCHASE_VALUE_USD}
      )
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%purchase%' THEN COALESCE(
        NULLIF(SAFE_CAST(value AS FLOAT64), 0),
        NULLIF(SAFE_CAST(projected_value AS FLOAT64), 0),
        NULLIF(SAFE_CAST(affiliate_value AS FLOAT64), 0),
        ${PURCHASE_VALUE_USD}
      )
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%add to cart%' THEN ${ADD_TO_CART_VALUE_USD}
      ELSE 0
    END AS modeled_value_usd
  FROM ${table("conversions")}
),
joined AS (
  SELECT
    c.*,
    v.platform_id,
    v.entered_at_ts,
    v.entered_at_date,
    v.campaign_id,
    v.adgroup_id,
    v.ad_id,
    v.match_type,
    v.network,
    v.device_type,
    v.user_country,
    v.keyword,
    v.dti,
    v.dbi,
    v.utm_campaign,
    v.landing_page_path,
    TIMESTAMP_DIFF(c.conversion_at_ts, v.entered_at_ts, SECOND) AS cycle_seconds
  FROM conversions_norm c
  LEFT JOIN visits_norm v
    ON c.visit_id = v.id
),
google_campaign_entities AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      CAST(campaign_id AS STRING) AS campaign_id,
      campaign_name,
      ROW_NUMBER() OVER (PARTITION BY CAST(campaign_id AS STRING) ORDER BY _DATA_DATE DESC) AS rn
    FROM ${googleAdsTable("ads_Campaign")}
  )
  WHERE rn = 1
),
google_adgroup_entities AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      CAST(campaign_id AS STRING) AS campaign_id,
      CAST(ad_group_id AS STRING) AS adgroup_id,
      ad_group_name,
      ROW_NUMBER() OVER (
        PARTITION BY CAST(campaign_id AS STRING), CAST(ad_group_id AS STRING)
        ORDER BY _DATA_DATE DESC
      ) AS rn
    FROM ${googleAdsTable("ads_AdGroup")}
  )
  WHERE rn = 1
),
google_ad_entities AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      CAST(campaign_id AS STRING) AS campaign_id,
      CAST(ad_group_id AS STRING) AS adgroup_id,
      CAST(ad_group_ad_ad_id AS STRING) AS ad_id,
      ad_group_ad_ad_final_urls,
      ROW_NUMBER() OVER (
        PARTITION BY CAST(campaign_id AS STRING), CAST(ad_group_id AS STRING), CAST(ad_group_ad_ad_id AS STRING)
        ORDER BY _DATA_DATE DESC
      ) AS rn
    FROM ${googleAdsTable("ads_Ad")}
  )
  WHERE rn = 1
),
media_daily AS (
  SELECT
    segments_date AS data_date,
    'google' AS platform_id,
    CAST(s.campaign_id AS STRING) AS campaign_id,
    CAST(s.ad_group_id AS STRING) AS adgroup_id,
    CAST(s.ad_group_ad_ad_id AS STRING) AS ad_id,
    gce.campaign_name,
    gae.ad_group_name,
    CASE
      WHEN LOWER(s.segments_device) = 'mobile' THEN 'mobile'
      WHEN LOWER(s.segments_device) = 'desktop' THEN 'desktop'
      WHEN LOWER(s.segments_device) = 'tablet' THEN 'tablet'
      ELSE LOWER(COALESCE(s.segments_device, 'unknown'))
    END AS device_type,
    gad.ad_group_ad_ad_final_urls AS final_url_raw,
    CAST(s.metrics_impressions AS INT64) AS impressions,
    CAST(s.metrics_clicks AS INT64) AS clicks,
    ROUND(CAST(s.metrics_cost_micros AS FLOAT64) / 1000000, 2) AS spend,
    CAST(s.metrics_conversions AS FLOAT64) AS uploaded_conversions
  FROM ${googleAdsTable("ads_AdBasicStats")} s
  LEFT JOIN google_campaign_entities gce
    ON gce.campaign_id = CAST(s.campaign_id AS STRING)
  LEFT JOIN google_adgroup_entities gae
    ON gae.campaign_id = CAST(s.campaign_id AS STRING)
   AND gae.adgroup_id = CAST(s.ad_group_id AS STRING)
  LEFT JOIN google_ad_entities gad
    ON gad.campaign_id = CAST(s.campaign_id AS STRING)
   AND gad.adgroup_id = CAST(s.ad_group_id AS STRING)
   AND gad.ad_id = CAST(s.ad_group_ad_ad_id AS STRING)
),
media_daily_norm AS (
  SELECT
    *,
    CASE
      WHEN platform_id = 'google' THEN REGEXP_EXTRACT(final_url_raw, r'https?://[^"\\]\\s]+')
      ELSE final_url_raw
    END AS final_url,
    COALESCE(
      NULLIF(
        REGEXP_EXTRACT(
          CASE
            WHEN platform_id = 'google' THEN REGEXP_EXTRACT(final_url_raw, r'https?://[^"\\]\\s]+')
            ELSE final_url_raw
          END,
          r'^https?://[^/]+([^?#]*)'
        ),
        ''
      ),
      '/'
    ) AS landing_page_path
  FROM media_daily
)
`;

function buildJoinedFilters({
  params,
  alias = "j",
  dateField = "entered_at_date",
}: {
  params: URLSearchParams;
  alias?: string;
  dateField?: string;
}) {
  const clauses: string[] = [];
  const queryParams: Record<string, unknown> = {};

  const platform = params.get("platform");
  if (platform) {
    clauses.push(`${alias}.platform_id = @platform`);
    queryParams.platform = platform.toLowerCase();
  }

  const device = params.get("device");
  if (device) {
    const deviceMap: Record<string, string> = {
      m: "mobile",
      c: "desktop",
      t: "tablet",
    };
    clauses.push(`${alias}.device_type = @device`);
    queryParams.device = deviceMap[device.toLowerCase()] || device.toLowerCase();
  }

  const matchType = params.get("match_type");
  if (matchType) {
    clauses.push(`${alias}.match_type = @match_type`);
    queryParams.match_type = matchType.toLowerCase();
  }

  const funnelStep = params.get("funnel_step");
  if (funnelStep) {
    const funnelMap: Record<string, string> = {
      "quiz start": "quiz_start",
      quiz_start: "quiz_start",
      "quiz complete": "quiz_complete",
      quiz_complete: "quiz_complete",
      "add to cart": "add_to_cart",
      add_to_cart: "add_to_cart",
      purchase: "purchase",
      "purchase reversal": "purchase_reversal",
      purchase_reversal: "purchase_reversal",
      lead: "lead",
      other: "other",
    };
    const normalizedStep = funnelMap[funnelStep.toLowerCase()];
    if (normalizedStep) {
      clauses.push(`${alias}.conversion_class = @conversion_class`);
      queryParams.conversion_class = normalizedStep;
    }
  }

  const affiliate = params.get("affiliate");
  if (affiliate) {
    clauses.push(`${alias}.brand_name = @brand_name`);
    queryParams.brand_name = affiliate;
  }

  const campaignId = params.get("campaign_id");
  if (campaignId) {
    clauses.push(`${alias}.campaign_id = @campaign_id`);
    queryParams.campaign_id = campaignId;
  }

  const keyword = params.get("keyword");
  if (keyword) {
    clauses.push(`LOWER(${alias}.keyword) LIKE @keyword`);
    queryParams.keyword = `%${keyword.toLowerCase()}%`;
  }

  const dti = params.get("dti");
  if (dti) {
    clauses.push(`${alias}.dti = @dti`);
    queryParams.dti = dti;
  }

  const dateFrom = params.get("date_from");
  if (dateFrom) {
    clauses.push(`${alias}.${dateField} >= @date_from`);
    queryParams.date_from = dateFrom;
  }

  const dateTo = params.get("date_to");
  if (dateTo) {
    clauses.push(`${alias}.${dateField} <= @date_to`);
    queryParams.date_to = dateTo;
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params: queryParams,
  };
}

function buildAttributionFilters({
  params,
  alias,
  dateField,
}: {
  params: URLSearchParams;
  alias: string;
  dateField: string;
}) {
  const clauses: string[] = [];
  const queryParams: Record<string, unknown> = {};

  const platform = params.get("platform");
  if (platform) {
    clauses.push(`${alias}.platform_id = @platform`);
    queryParams.platform = platform.toLowerCase();
  }

  const device = params.get("device");
  if (device) {
    const deviceMap: Record<string, string> = { c: "desktop", m: "mobile", t: "tablet" };
    clauses.push(`${alias}.device_type = @attr_device`);
    queryParams.attr_device = deviceMap[device.toLowerCase()] || device.toLowerCase();
  }

  const matchType = params.get("match_type");
  if (matchType && alias !== "m") {
    clauses.push(`${alias}.match_type = @attr_match_type`);
    queryParams.attr_match_type = matchType.toLowerCase();
  }

  const campaignId = params.get("campaign_id");
  if (campaignId) {
    clauses.push(`${alias}.campaign_id = @attr_campaign_id`);
    queryParams.attr_campaign_id = campaignId;
  }

  const keyword = params.get("keyword");
  if (keyword && alias !== "m") {
    clauses.push(`LOWER(${alias}.keyword) LIKE @attr_keyword`);
    queryParams.attr_keyword = `%${keyword.toLowerCase()}%`;
  }

  const dateFrom = params.get("date_from");
  if (dateFrom) {
    clauses.push(`${alias}.${dateField} >= @attr_date_from`);
    queryParams.attr_date_from = dateFrom;
  }

  const dateTo = params.get("date_to");
  if (dateTo) {
    clauses.push(`${alias}.${dateField} <= @attr_date_to`);
    queryParams.attr_date_to = dateTo;
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params: queryParams,
  };
}

export async function getStats(params: URLSearchParams) {
  const filters = buildJoinedFilters({ params });

  const sql = `
    ${baseCtes}
    SELECT
      COUNT(*) AS total_events,
      COUNTIF(j.conversion_class = 'quiz_start') AS quiz_starts,
      COUNTIF(j.conversion_class = 'quiz_complete') AS quiz_completes,
      COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
      COUNTIF(j.conversion_class = 'lead') AS leads,
      COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
      COUNTIF(j.conversion_class = 'purchase_reversal') AS purchase_reversals,
      COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS net_purchases,
      ROUND(SUM(j.modeled_value_usd), 2) AS modeled_revenue,
      ROUND(AVG(CASE WHEN j.conversion_class = 'purchase' THEN j.modeled_value_usd END), 2) AS avg_order_value,
      COUNT(DISTINCT j.campaign_id) AS unique_campaigns,
      COUNT(DISTINCT CASE WHEN j.keyword != 'unknown' THEN j.keyword END) AS unique_keywords,
      MIN(j.conversion_date) AS date_min,
      MAX(j.conversion_date) AS date_max
    FROM joined j
    ${filters.where}
  `;

  const rows = await runBigQuery<Record<string, unknown>>(sql, filters.params);
  return rows[0];
}

export async function getDaily(params: URLSearchParams) {
  const filters = buildJoinedFilters({ params });
  const sql = `
    ${baseCtes}
    SELECT
      j.entered_at_date AS date,
      COUNT(*) AS total_events,
      COUNTIF(j.conversion_class = 'quiz_start') AS quiz_starts,
      COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS purchases,
      ROUND(SUM(j.modeled_value_usd), 2) AS revenue
    FROM joined j
    ${filters.where}
    GROUP BY j.entered_at_date
    ORDER BY j.entered_at_date
  `;

  return runBigQuery(sql, filters.params);
}

export async function getCampaigns(params: URLSearchParams) {
  const filters = buildJoinedFilters({ params });
  const mediaFilters = buildJoinedFilters({ params, alias: "m", dateField: "data_date" });
  const visitFilters = buildJoinedFilters({ params, alias: "v", dateField: "entered_at_date" });

  const sql = `
    ${baseCtes},
    media_campaigns AS (
      SELECT
        m.platform_id,
        m.campaign_id,
        MAX(m.campaign_name) AS campaign_name,
        SUM(m.impressions) AS impressions,
        SUM(m.clicks) AS clicks,
        ROUND(SUM(m.spend), 2) AS spend,
        COUNT(DISTINCT m.adgroup_id) AS adgroup_count
      FROM media_daily_norm m
      ${mediaFilters.where}
      GROUP BY m.platform_id, m.campaign_id
    ),
    visit_campaigns AS (
      SELECT
        v.platform_id,
        v.campaign_id,
        COUNT(*) AS visits
      FROM visits_norm v
      ${visitFilters.where}
      GROUP BY v.platform_id, v.campaign_id
    ),
    conversion_campaigns AS (
      SELECT
        j.platform_id,
        j.campaign_id,
        MAX(j.utm_campaign) AS utm_campaign,
        COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
        COUNTIF(j.conversion_class = 'purchase_reversal') AS purchase_reversals,
        COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS purchases,
        ROUND(COUNTIF(j.conversion_class = 'purchase') * ${PURCHASE_VALUE_USD}, 2) AS gross_purchase_revenue,
        ROUND((COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal')) * ${PURCHASE_VALUE_USD}, 2) AS purchase_revenue,
        ROUND(COUNTIF(j.conversion_class = 'add_to_cart') * ${ADD_TO_CART_VALUE_USD}, 2) AS add_to_cart_proxy_value,
        ROUND(AVG(CASE WHEN j.conversion_class = 'purchase' THEN TIMESTAMP_DIFF(j.conversion_at_ts, j.entered_at_ts, SECOND) END) / 60, 1) AS avg_purchase_cycle_minutes,
        COUNT(DISTINCT j.keyword) AS keyword_count
      FROM joined j
      ${filters.where}
      GROUP BY j.platform_id, j.campaign_id
    )
    SELECT
      COALESCE(mc.campaign_id, cc.campaign_id) AS campaign_id,
      COALESCE(mc.campaign_name, cc.utm_campaign) AS campaign_name,
      COALESCE(mc.platform_id, cc.platform_id) AS platform,
      COALESCE(vc.visits, 0) AS visits,
      COALESCE(cc.add_to_carts, 0) AS add_to_carts,
      COALESCE(cc.purchases, 0) AS purchases,
      COALESCE(cc.gross_purchases, 0) AS gross_purchases,
      COALESCE(cc.purchase_reversals, 0) AS purchase_reversals,
      COALESCE(cc.purchase_revenue, 0) AS purchase_revenue,
      COALESCE(cc.add_to_cart_proxy_value, 0) AS add_to_cart_proxy_value,
      COALESCE(mc.adgroup_count, 0) AS adgroup_count,
      COALESCE(cc.keyword_count, 0) AS keyword_count,
      COALESCE(mc.impressions, 0) AS impressions,
      COALESCE(mc.clicks, 0) AS clicks,
      COALESCE(mc.spend, 0) AS spend,
      COALESCE(cc.avg_purchase_cycle_minutes, 0) AS avg_purchase_cycle_minutes,
      ROUND(COALESCE(cc.purchase_revenue, 0) - COALESCE(mc.spend, 0), 2) AS purchase_profit,
      ROUND(COALESCE(cc.purchase_revenue, 0) + COALESCE(cc.add_to_cart_proxy_value, 0) - COALESCE(mc.spend, 0), 2) AS proxy_profit,
      ROUND(SAFE_DIVIDE(COALESCE(cc.purchase_revenue, 0) - COALESCE(mc.spend, 0), NULLIF(COALESCE(mc.spend, 0), 0)) * 100, 2) AS purchase_roi_pct,
      ROUND(SAFE_DIVIDE(COALESCE(cc.purchase_revenue, 0) + COALESCE(cc.add_to_cart_proxy_value, 0) - COALESCE(mc.spend, 0), NULLIF(COALESCE(mc.spend, 0), 0)) * 100, 2) AS proxy_roi_pct,
      ROUND(SAFE_DIVIDE(COALESCE(mc.spend, 0), NULLIF(COALESCE(cc.purchases, 0), 0)), 2) AS cost_per_purchase,
      ROUND(SAFE_DIVIDE(COALESCE(cc.purchases, 0), NULLIF(COALESCE(vc.visits, 0), 0)) * 100, 2) AS purchase_rate_per_visit,
      ROUND(SAFE_DIVIDE(COALESCE(vc.visits, 0), NULLIF(COALESCE(mc.clicks, 0), 0)) * 100, 2) AS click_to_visit_match_pct
    FROM media_campaigns mc
    FULL OUTER JOIN conversion_campaigns cc
      ON mc.platform_id = cc.platform_id
     AND mc.campaign_id = cc.campaign_id
    LEFT JOIN visit_campaigns vc
      ON vc.platform_id = COALESCE(mc.platform_id, cc.platform_id)
     AND vc.campaign_id = COALESCE(mc.campaign_id, cc.campaign_id)
    ORDER BY purchase_profit DESC, purchases DESC, spend DESC
  `;

  return runBigQuery(sql, { ...mediaFilters.params, ...filters.params, ...visitFilters.params });
}

export async function getKeywords(params: URLSearchParams, limit = 100) {
  return getKeywordOpportunities(params, limit);
}

export async function getSegments(params: URLSearchParams, groupBy: string) {
  const GROUP_MAP: Record<string, string> = {
    platform_id: "j.platform_id",
    device: "j.device_type",
    match_type: "j.match_type",
    affiliate: "j.brand_name",
    funnel_step: "j.conversion_class",
    utm_campaign: "j.utm_campaign",
    keyword: "j.keyword",
    dti: "j.dti",
    network: "j.network",
    user_country: "j.user_country",
  };

  const groupExpr = GROUP_MAP[groupBy] || GROUP_MAP.platform_id;
  const filters = buildJoinedFilters({ params });

  const sql = `
    ${baseCtes}
    SELECT
      COALESCE(CAST(${groupExpr} AS STRING), 'unknown') AS segment,
      COUNT(*) AS total_events,
      COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
      COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
      COUNTIF(j.conversion_class = 'purchase_reversal') AS purchase_reversals,
      COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS purchases,
      ROUND(SUM(j.modeled_value_usd), 2) AS modeled_revenue,
      ROUND(COUNTIF(j.conversion_class = 'purchase') * ${PURCHASE_VALUE_USD}, 2) AS gross_purchase_revenue,
      ROUND((COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal')) * ${PURCHASE_VALUE_USD}, 2) AS purchase_revenue
    FROM joined j
    ${filters.where}
    GROUP BY segment
    ORDER BY total_events DESC
    LIMIT 50
  `;

  return runBigQuery(sql, filters.params);
}

export async function getSearchQueries(params: URLSearchParams, limit = 100) {
  return getGoogleSearchQueryDiagnostics(params, limit);
}

export async function getConversions(params: URLSearchParams) {
  const filters = buildJoinedFilters({ params, dateField: "conversion_date" });
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(100, Number(params.get("limit") || 50));
  const offset = (page - 1) * limit;

  const countSql = `
    ${baseCtes}
    SELECT COUNT(*) AS total
    FROM joined j
    ${filters.where}
  `;

  const dataSql = `
    ${baseCtes}
    SELECT
      j.id,
      j.conversion_at_ts AS conversion_at,
      j.conversion_class AS funnel_step,
      j.brand_name AS affiliate,
      j.modeled_value_usd AS value,
      j.platform_id,
      j.device_type AS device,
      j.match_type,
      j.keyword,
      j.utm_campaign,
      j.campaign_id,
      j.adgroup_id,
      j.dti,
      j.landing_page_path,
      j.user_country
    FROM joined j
    ${filters.where}
    ORDER BY j.conversion_at_ts DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const [countRows, dataRows] = await Promise.all([
    runBigQuery<Record<string, unknown>>(countSql, filters.params),
    runBigQuery(dataSql, filters.params),
  ]);

  return {
    total: Number(countRows[0]?.total || 0),
    page,
    limit,
    rows: dataRows,
  };
}

export async function getMeasurementTruth(params: URLSearchParams) {
  const filters = buildJoinedFilters({ params });
  const sql = `
    ${baseCtes},
    media_window_bounds AS (
      SELECT
        platform_id,
        MIN(data_date) AS media_min_date,
        MAX(data_date) AS media_max_date
      FROM media_daily_norm
      GROUP BY platform_id
    ),
    media_exact_keys AS (
      SELECT DISTINCT
        platform_id,
        data_date,
        campaign_id,
        adgroup_id,
        ad_id,
        device_type
      FROM media_daily_norm
    ),
    media_partial_keys AS (
      SELECT DISTINCT
        platform_id,
        data_date,
        campaign_id
      FROM media_daily_norm
    )
    SELECT
      (SELECT COUNT(*) FROM conversions_norm) AS total_conversions_all_time,
      COUNT(*) AS conversions_in_scope,
      COUNTIF(j.entered_at_ts IS NOT NULL) AS conversions_with_visit_join,
      ROUND(SAFE_DIVIDE(COUNTIF(j.entered_at_ts IS NOT NULL), COUNT(*)) * 100, 2) AS join_rate_pct,
      COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
      COUNTIF(j.conversion_class = 'purchase_reversal') AS purchase_reversals,
      COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS net_purchases,
      COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
      COUNTIF(j.conversion_class = 'lead') AS leads,
      COUNTIF(j.conversion_class = 'quiz_complete') AS quiz_completes,
      COUNTIF(j.conversion_class = 'quiz_start') AS quiz_starts,
      ROUND(SUM(j.modeled_value_usd), 2) AS modeled_value_usd
    FROM joined j
    ${filters.where}
  `;

  const taxonomySql = `
    ${baseCtes}
    SELECT
      j.brand_name,
      j.conversion_type_display_name,
      j.conversion_class,
      COUNT(*) AS events
    FROM joined j
    ${filters.where}
    GROUP BY j.brand_name, j.conversion_type_display_name, j.conversion_class
    ORDER BY events DESC
    LIMIT 25
  `;

  const inventorySql = `
    ${baseCtes}
    SELECT 'visits' AS table_name, COUNT(*) AS row_count, MIN(entered_at_date) AS min_date, MAX(entered_at_date) AS max_date
    FROM visits_norm
    UNION ALL
    SELECT 'conversions', COUNT(*), MIN(conversion_date), MAX(conversion_date)
    FROM conversions_norm
    UNION ALL
    SELECT 'google_ads_native_media', COUNT(*), MIN(data_date), MAX(data_date)
    FROM media_daily_norm
  `;

  const coverageSql = `
    ${baseCtes},
    media_window_bounds AS (
      SELECT
        platform_id,
        MIN(data_date) AS media_min_date,
        MAX(data_date) AS media_max_date
      FROM media_daily_norm
      GROUP BY platform_id
    ),
    media_exact_keys AS (
      SELECT DISTINCT
        platform_id,
        data_date,
        campaign_id,
        adgroup_id,
        ad_id,
        device_type
      FROM media_daily_norm
    ),
    media_partial_keys AS (
      SELECT DISTINCT
        platform_id,
        data_date,
        campaign_id
      FROM media_daily_norm
    )
    SELECT
      j.platform_id,
      COUNT(*) AS conversions_in_scope,
      COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
      COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS net_purchases,
      COUNTIF(j.entered_at_date BETWEEN wb.media_min_date AND wb.media_max_date) AS conversions_in_media_window,
      COUNTIF(j.conversion_class = 'purchase' AND j.entered_at_date BETWEEN wb.media_min_date AND wb.media_max_date) AS purchases_in_media_window,
      COUNTIF(exact_match.campaign_id IS NOT NULL) AS exact_media_matches,
      COUNTIF(j.conversion_class = 'purchase' AND exact_match.campaign_id IS NOT NULL) AS purchase_exact_media_matches,
      COUNTIF(partial_match.campaign_id IS NOT NULL) AS partial_media_matches,
      COUNTIF(j.conversion_class = 'purchase' AND partial_match.campaign_id IS NOT NULL) AS purchase_partial_media_matches,
      wb.media_min_date,
      wb.media_max_date
    FROM joined j
    LEFT JOIN media_window_bounds wb
      ON wb.platform_id = j.platform_id
    LEFT JOIN media_exact_keys exact_match
      ON exact_match.platform_id = j.platform_id
     AND exact_match.data_date = j.entered_at_date
     AND exact_match.campaign_id = j.campaign_id
     AND exact_match.adgroup_id = j.adgroup_id
     AND exact_match.ad_id = j.ad_id
     AND exact_match.device_type = j.device_type
    LEFT JOIN media_partial_keys partial_match
      ON partial_match.platform_id = j.platform_id
     AND partial_match.data_date = j.entered_at_date
     AND partial_match.campaign_id = j.campaign_id
    ${filters.where}
    GROUP BY j.platform_id, wb.media_min_date, wb.media_max_date
    ORDER BY conversions_in_scope DESC
  `;

  const [summary, taxonomy, inventory, coverage, googleTransferInventory] = await Promise.all([
    runBigQuery<Record<string, unknown>>(sql, filters.params).then((rows) => rows[0]),
    runBigQuery(taxonomySql, filters.params),
    runBigQuery(inventorySql),
    runBigQuery(coverageSql, filters.params),
    getGoogleTransferInventory(),
  ]);

  const warnings: string[] = [];
  const joinRate = Number(summary?.join_rate_pct || 0);
  if (joinRate < 95) {
    warnings.push(`Visit join coverage is only ${joinRate.toFixed(2)}%, so attribution gaps may distort downstream analysis.`);
  }

  for (const row of coverage) {
    const platform = String(row.platform_id || "unknown");
    const mediaMinDate = row.media_min_date ? String(row.media_min_date) : null;
    const mediaMaxDate = row.media_max_date ? String(row.media_max_date) : null;
    if (!mediaMinDate || !mediaMaxDate) {
      continue;
    }

    const exactCoverage = Number(row.purchases_in_media_window || 0)
      ? (Number(row.purchase_exact_media_matches || 0) / Number(row.purchases_in_media_window || 1)) * 100
      : 0;
    const partialCoverage = Number(row.purchases_in_media_window || 0)
      ? (Number(row.purchase_partial_media_matches || 0) / Number(row.purchases_in_media_window || 1)) * 100
      : 0;

    row.exact_purchase_match_rate_pct = Number(exactCoverage.toFixed(2));
    row.partial_purchase_match_rate_pct = Number(partialCoverage.toFixed(2));

    if (Number(row.net_purchases || 0) > Number(row.purchases_in_media_window || 0)) {
      warnings.push(
        `${platform} has purchases outside the available ad-spend window (${mediaMinDate} to ${mediaMaxDate}), so full-history CPA is not fully reliable.`,
      );
    }
    if (Number(row.purchases_in_media_window || 0) > 0 && exactCoverage < 70) {
      warnings.push(
        `${platform} exact media matching is only ${exactCoverage.toFixed(1)}% of in-window purchases; campaign-level spend analysis should be treated as directional until joins improve.`,
      );
    } else if (Number(row.purchases_in_media_window || 0) > 0 && partialCoverage < 85) {
      warnings.push(
        `${platform} only partially matches ${partialCoverage.toFixed(1)}% of in-window purchases at the campaign level, so some campaign spend attribution remains incomplete.`,
      );
    }
  }

  const clickInventory = (googleTransferInventory as Record<string, unknown>[]).find(
    (row) => String(row.table_name) === "ads_ClickStats",
  );
  if (clickInventory) {
    warnings.push(
      `Google exact click-level attribution is available from ${String(clickInventory.min_date)} to ${String(clickInventory.max_date)} via the GoogleAds transfer dataset.`,
    );
  }

  return {
    summary,
    taxonomy,
    inventory: [...inventory, ...(googleTransferInventory as Record<string, unknown>[])],
    coverage,
    warnings,
  };
}

export async function getPartners(params: URLSearchParams) {
  const filters = buildJoinedFilters({ params });
  const sql = `
    ${baseCtes}
    SELECT
      j.brand_name AS partner,
      COUNT(*) AS total_events,
      COUNTIF(j.conversion_class = 'quiz_start') AS quiz_starts,
      COUNTIF(j.conversion_class = 'quiz_complete') AS quiz_completes,
      COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
      COUNTIF(j.conversion_class = 'lead') AS leads,
      COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
      COUNTIF(j.conversion_class = 'purchase_reversal') AS purchase_reversals,
      COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS net_purchases,
      ROUND(SUM(j.modeled_value_usd), 2) AS modeled_value_usd,
      ROUND(SAFE_DIVIDE(COUNTIF(j.conversion_class = 'add_to_cart'), NULLIF(COUNTIF(j.conversion_class = 'quiz_start'), 0)) * 100, 2) AS add_to_cart_rate,
      ROUND(
        SAFE_DIVIDE(
          COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal'),
          NULLIF(COUNTIF(j.conversion_class = 'quiz_start'), 0)
        ) * 100,
        2
      ) AS purchase_rate
    FROM joined j
    ${filters.where}
    GROUP BY j.brand_name
    ORDER BY net_purchases DESC, modeled_value_usd DESC
  `;

  return runBigQuery(sql, filters.params);
}

export async function getLandingPages(params: URLSearchParams, limit = 100) {
  const filters = buildJoinedFilters({ params });
  const sql = `
    ${baseCtes}
    SELECT
      j.platform_id,
      j.landing_page_path,
      COUNT(*) AS total_events,
      COUNTIF(j.conversion_class = 'quiz_start') AS quiz_starts,
      COUNTIF(j.conversion_class = 'quiz_complete') AS quiz_completes,
      COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
      COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
      COUNTIF(j.conversion_class = 'purchase_reversal') AS purchase_reversals,
      COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS net_purchases,
      ROUND(SUM(j.modeled_value_usd), 2) AS modeled_value_usd,
      ROUND(
        SAFE_DIVIDE(
          COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal'),
          NULLIF(COUNTIF(j.conversion_class = 'quiz_start'), 0)
        ) * 100,
        2
      ) AS purchase_rate,
      ROUND(AVG(CASE WHEN j.conversion_class = 'purchase' THEN j.cycle_seconds END) / 60, 1) AS avg_purchase_cycle_minutes,
      ROUND(APPROX_QUANTILES(CASE WHEN j.conversion_class = 'purchase' THEN j.cycle_seconds END, 100)[OFFSET(50)] / 60, 1) AS p50_purchase_cycle_minutes
    FROM joined j
    ${filters.where}
    GROUP BY j.platform_id, j.landing_page_path
    ORDER BY net_purchases DESC, purchase_rate DESC, quiz_starts DESC
    LIMIT ${limit}
  `;

  return runBigQuery(sql, filters.params);
}

export async function getCycleTime(params: URLSearchParams, groupBy: string) {
  const GROUP_MAP: Record<string, string> = {
    platform: "j.platform_id",
    partner: "j.brand_name",
    device: "j.device_type",
    landing_page: "j.landing_page_path",
    keyword: "j.keyword",
    campaign: "j.utm_campaign",
  };

  const groupExpr = GROUP_MAP[groupBy] || GROUP_MAP.platform;
  const filters = buildJoinedFilters({ params, dateField: "conversion_date" });
  const sql = `
    ${baseCtes}
    SELECT
      COALESCE(CAST(${groupExpr} AS STRING), 'unknown') AS segment,
      COUNT(*) AS purchase_events,
      ROUND(AVG(j.cycle_seconds) / 60, 1) AS avg_cycle_minutes,
      ROUND(APPROX_QUANTILES(j.cycle_seconds, 100)[OFFSET(25)] / 60, 1) AS p25_cycle_minutes,
      ROUND(APPROX_QUANTILES(j.cycle_seconds, 100)[OFFSET(50)] / 60, 1) AS p50_cycle_minutes,
      ROUND(APPROX_QUANTILES(j.cycle_seconds, 100)[OFFSET(90)] / 60, 1) AS p90_cycle_minutes
    FROM joined j
    ${filters.where ? `${filters.where} AND` : "WHERE"} j.conversion_class = 'purchase' AND j.cycle_seconds IS NOT NULL
    GROUP BY segment
    HAVING purchase_events > 0
    ORDER BY purchase_events DESC, p50_cycle_minutes ASC
    LIMIT 50
  `;

  return runBigQuery(sql, filters.params);
}

export async function getKeywordOpportunities(params: URLSearchParams, limit = 25) {
  const googleRows = await getGoogleKeywordOpportunities(params, limit * 8);
  const platformParam = params.get("platform")?.toLowerCase();
  const includeBing = !platformParam || platformParam === "bing";

  if (!includeBing) {
    return (googleRows as Record<string, unknown>[])
      .sort((a, b) => Number(b.purchase_profit || 0) - Number(a.purchase_profit || 0))
      .slice(0, limit);
  }

  const visitFilters = buildAttributionFilters({ params, alias: "v", dateField: "entered_at_date" });
  const joinedFilters = buildAttributionFilters({ params, alias: "j", dateField: "entered_at_date" });
  const mediaFilters = buildAttributionFilters({ params, alias: "m", dateField: "data_date" });

  const sql = `
    ${baseCtes},
    keyword_visit_day AS (
      SELECT
        v.platform_id,
        v.entered_at_date,
        v.campaign_id,
        v.keyword,
        COUNT(*) AS visit_count
      FROM visits_norm v
      ${visitFilters.where ? `${visitFilters.where} AND` : "WHERE"}
        v.platform_id = 'bing'
        AND v.keyword IS NOT NULL
        AND v.keyword != 'unknown'
      GROUP BY v.platform_id, v.entered_at_date, v.campaign_id, v.keyword
    ),
    keyword_landing_page_day AS (
      SELECT
        v.platform_id,
        v.entered_at_date,
        v.campaign_id,
        v.keyword,
        v.landing_page_path,
        COUNT(*) AS visit_count
      FROM visits_norm v
      ${visitFilters.where ? `${visitFilters.where} AND` : "WHERE"}
        v.platform_id = 'bing'
        AND v.keyword IS NOT NULL
        AND v.keyword != 'unknown'
      GROUP BY v.platform_id, v.entered_at_date, v.campaign_id, v.keyword, v.landing_page_path
    ),
    keyword_top_landing_page_day AS (
      SELECT
        platform_id,
        entered_at_date,
        campaign_id,
        keyword,
        ARRAY_AGG(landing_page_path ORDER BY visit_count DESC LIMIT 1)[OFFSET(0)] AS landing_page_path
      FROM keyword_landing_page_day
      GROUP BY platform_id, entered_at_date, campaign_id, keyword
    ),
    campaign_day_visits AS (
      SELECT
        platform_id,
        entered_at_date,
        campaign_id,
        SUM(visit_count) AS campaign_visit_count
      FROM keyword_visit_day
      GROUP BY platform_id, entered_at_date, campaign_id
    ),
    keyword_conversion_day AS (
      SELECT
        j.platform_id,
        j.entered_at_date,
        j.campaign_id,
        j.keyword,
        COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
        COUNTIF(j.conversion_class = 'purchase_reversal') AS purchase_reversals,
        COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS net_purchases,
        ROUND(AVG(CASE WHEN j.conversion_class = 'purchase' THEN j.cycle_seconds END) / 60, 1) AS avg_purchase_cycle_minutes,
        ROUND(APPROX_QUANTILES(CASE WHEN j.conversion_class = 'purchase' THEN j.cycle_seconds END, 100)[OFFSET(50)] / 60, 1) AS p50_purchase_cycle_minutes
      FROM joined j
      ${joinedFilters.where ? `${joinedFilters.where} AND` : "WHERE"}
        j.platform_id = 'bing'
        AND j.keyword IS NOT NULL
        AND j.keyword != 'unknown'
      GROUP BY j.platform_id, j.entered_at_date, j.campaign_id, j.keyword
    ),
    media_campaign_day AS (
      SELECT
        m.platform_id,
        m.data_date,
        m.campaign_id,
        MAX(m.campaign_name) AS campaign_name,
        ROUND(SUM(m.spend), 2) AS spend,
        SUM(m.impressions) AS impressions,
        SUM(m.clicks) AS clicks
      FROM media_daily_norm m
      ${mediaFilters.where ? `${mediaFilters.where} AND` : "WHERE"}
        m.platform_id = 'bing'
      GROUP BY m.platform_id, m.data_date, m.campaign_id
    ),
    keyword_day AS (
      SELECT
        kv.platform_id,
        kv.keyword,
        kv.entered_at_date,
        kv.campaign_id,
        mc.campaign_name,
        lp.landing_page_path,
        kv.visit_count,
        cd.campaign_visit_count,
        COALESCE(kc.add_to_carts, 0) AS add_to_carts,
        COALESCE(kc.gross_purchases, 0) AS gross_purchases,
        COALESCE(kc.purchase_reversals, 0) AS purchase_reversals,
        COALESCE(kc.net_purchases, 0) AS net_purchases,
        kc.avg_purchase_cycle_minutes,
        kc.p50_purchase_cycle_minutes,
        mc.spend AS campaign_spend,
        mc.impressions AS campaign_impressions,
        mc.clicks AS campaign_clicks
      FROM keyword_visit_day kv
      JOIN campaign_day_visits cd
        ON cd.platform_id = kv.platform_id
       AND cd.entered_at_date = kv.entered_at_date
       AND cd.campaign_id = kv.campaign_id
      JOIN media_campaign_day mc
        ON mc.platform_id = kv.platform_id
       AND mc.data_date = kv.entered_at_date
       AND mc.campaign_id = kv.campaign_id
      LEFT JOIN keyword_conversion_day kc
        ON kc.platform_id = kv.platform_id
       AND kc.entered_at_date = kv.entered_at_date
       AND kc.campaign_id = kv.campaign_id
       AND kc.keyword = kv.keyword
      LEFT JOIN keyword_top_landing_page_day lp
        ON lp.platform_id = kv.platform_id
       AND lp.entered_at_date = kv.entered_at_date
       AND lp.campaign_id = kv.campaign_id
       AND lp.keyword = kv.keyword
    ),
    keyword_rollup AS (
      SELECT
        platform_id,
        keyword,
        ARRAY_AGG(campaign_name IGNORE NULLS ORDER BY net_purchases DESC, visit_count DESC LIMIT 1)[OFFSET(0)] AS top_campaign,
        ARRAY_AGG(landing_page_path IGNORE NULLS ORDER BY net_purchases DESC, visit_count DESC LIMIT 1)[OFFSET(0)] AS top_landing_page,
        SUM(visit_count) AS visits,
        SUM(add_to_carts) AS add_to_carts,
        SUM(gross_purchases) AS gross_purchases,
        SUM(purchase_reversals) AS purchase_reversals,
        SUM(net_purchases) AS net_purchases,
        ROUND(SUM(campaign_spend * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))), 2) AS estimated_spend,
        ROUND(SUM(campaign_impressions * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))), 0) AS estimated_impressions,
        ROUND(SUM(campaign_clicks * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))), 0) AS estimated_clicks,
        ROUND(SUM(net_purchases) * ${PURCHASE_VALUE_USD}, 2) AS purchase_revenue,
        ROUND(SUM(add_to_carts) * ${ADD_TO_CART_VALUE_USD}, 2) AS add_to_cart_proxy_value,
        ROUND(
          SUM(net_purchases) * ${PURCHASE_VALUE_USD}
          - SUM(campaign_spend * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))),
          2
        ) AS purchase_profit,
        ROUND(
          SUM(net_purchases) * ${PURCHASE_VALUE_USD}
          + SUM(add_to_carts) * ${ADD_TO_CART_VALUE_USD}
          - SUM(campaign_spend * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))),
          2
        ) AS proxy_profit,
        ROUND(
          SAFE_DIVIDE(
            SUM(net_purchases) * ${PURCHASE_VALUE_USD}
            - SUM(campaign_spend * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))),
            NULLIF(SUM(campaign_spend * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))), 0)
          ) * 100,
          2
        ) AS purchase_roi_pct,
        ROUND(
          SAFE_DIVIDE(
            SUM(net_purchases) * ${PURCHASE_VALUE_USD}
            + SUM(add_to_carts) * ${ADD_TO_CART_VALUE_USD}
            - SUM(campaign_spend * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))),
            NULLIF(SUM(campaign_spend * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0))), 0)
          ) * 100,
          2
        ) AS proxy_roi_pct,
        ROUND(
          GREATEST(
            SUM(campaign_spend * SAFE_DIVIDE(visit_count, NULLIF(campaign_visit_count, 0)))
            - SUM(net_purchases) * ${PURCHASE_VALUE_USD},
            0
          ),
          2
        ) AS profit_gap_to_break_even,
        ROUND(SAFE_DIVIDE(SUM(net_purchases), NULLIF(SUM(visit_count), 0)) * 100, 2) AS purchase_rate_per_visit,
        ROUND(AVG(avg_purchase_cycle_minutes), 1) AS avg_purchase_cycle_minutes,
        ROUND(AVG(p50_purchase_cycle_minutes), 1) AS p50_purchase_cycle_minutes,
        'inferred_campaign_day_spend' AS spend_confidence
      FROM keyword_day
      GROUP BY platform_id, keyword
    )
    SELECT
      *,
      CASE
        WHEN estimated_spend >= 1000 AND net_purchases = 0 THEN 'Traffic without purchases'
        WHEN estimated_spend >= 1000 AND purchase_profit < 0 THEN 'Losing money at purchase level'
        WHEN add_to_carts > 0 AND net_purchases = 0 THEN 'Proxy interest without purchase'
        WHEN purchase_profit > 0 AND purchase_roi_pct >= 25 THEN 'Profitable keyword'
        WHEN net_purchases > 0 THEN 'Converts, but monitor economics'
        ELSE 'Low-signal keyword'
      END AS diagnosis
    FROM keyword_rollup
    ORDER BY purchase_profit DESC, net_purchases DESC, estimated_spend DESC
    LIMIT ${limit * 8}
  `;

  const bingRows = await runBigQuery<Record<string, unknown>>(sql, {
    ...visitFilters.params,
    ...joinedFilters.params,
    ...mediaFilters.params,
  });

  return [...(googleRows as Record<string, unknown>[]), ...bingRows]
    .sort((a, b) => Number(b.purchase_profit || 0) - Number(a.purchase_profit || 0))
    .slice(0, limit);
}

export async function getOptimizationFlow(params: URLSearchParams) {
  const [truth, keywordRows, landingPages, partners, googleAdCopy] = await Promise.all([
    getMeasurementTruth(params),
    getKeywordOpportunities(params, 500),
    getLandingPages(params, 200),
    getPartners(params),
    getGoogleAdCopyDiagnostics(params, 120),
  ]);

  const rows = (keywordRows as Record<string, unknown>[]).map((row) => ({
    platform: String(row.platform_id || "unknown"),
    keyword: String(row.keyword || "unknown"),
    top_campaign: String(row.top_campaign || "unknown"),
    top_landing_page: String(row.top_landing_page || "unknown"),
    visits: Number(row.visits || 0),
    add_to_carts: Number(row.add_to_carts || 0),
    net_purchases: Number(row.net_purchases || 0),
    estimated_spend: Number(row.estimated_spend || 0),
    purchase_revenue: Number(row.purchase_revenue || 0),
    add_to_cart_proxy_value: Number(row.add_to_cart_proxy_value || 0),
    purchase_profit: Number(row.purchase_profit || 0),
    proxy_profit: Number(row.proxy_profit || 0),
    purchase_roi_pct: row.purchase_roi_pct == null ? null : Number(row.purchase_roi_pct),
    proxy_roi_pct: row.proxy_roi_pct == null ? null : Number(row.proxy_roi_pct),
    purchase_rate_per_visit: row.purchase_rate_per_visit == null ? null : Number(row.purchase_rate_per_visit),
    profit_gap_to_break_even: Number(row.profit_gap_to_break_even || 0),
    diagnosis: String(row.diagnosis || ""),
    spend_confidence: String(row.spend_confidence || "unknown"),
    click_to_visit_match_pct: row.click_to_visit_match_pct == null ? null : Number(row.click_to_visit_match_pct),
    keyword_match_type: row.keyword_match_type ? String(row.keyword_match_type) : null,
    keyword_status: row.keyword_status ? String(row.keyword_status) : null,
    quality_score: row.quality_score ? String(row.quality_score) : null,
  }));

  const googleAds = (googleAdCopy as Record<string, unknown>[]).map((row) => ({
    ad_id: String(row.ad_id || "unknown"),
    campaign_name: String(row.campaign_name || "unknown"),
    ad_name: row.ad_name ? String(row.ad_name) : null,
    ad_type: String(row.ad_type || "unknown"),
    ad_strength: row.ad_strength ? String(row.ad_strength) : null,
    approval_status: row.approval_status ? String(row.approval_status) : null,
    ad_status: row.ad_status ? String(row.ad_status) : null,
    spend: Number(row.spend || 0),
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    matched_click_visits: Number(row.matched_click_visits || 0),
    add_to_carts: Number(row.add_to_carts || 0),
    net_purchases: Number(row.net_purchases || 0),
    purchase_profit: Number(row.purchase_profit || 0),
    purchase_roi_pct: row.purchase_roi_pct == null ? null : Number(row.purchase_roi_pct),
  }));

  const winningKeywords = rows
    .filter((row) => row.net_purchases > 0 && row.purchase_profit > 0)
    .sort((a, b) => b.purchase_profit - a.purchase_profit || b.net_purchases - a.net_purchases)
    .slice(0, 12);

  const wastedKeywords = rows
    .filter((row) => row.estimated_spend >= 500 && (row.purchase_profit < 0 || row.net_purchases === 0))
    .sort((a, b) => b.profit_gap_to_break_even - a.profit_gap_to_break_even || b.estimated_spend - a.estimated_spend)
    .slice(0, 12);

  const landingPageAlerts = (landingPages as Record<string, unknown>[])
    .map((row) => ({
      platform: String(row.platform_id || "unknown"),
      landing_page_path: String(row.landing_page_path || "unknown"),
      quiz_starts: Number(row.quiz_starts || 0),
      net_purchases: Number(row.net_purchases || 0),
      purchase_rate: row.purchase_rate == null ? null : Number(row.purchase_rate),
    }))
    .filter((row) => row.quiz_starts >= 50 && ((row.purchase_rate || 0) < 4 || row.net_purchases <= 0))
    .sort((a, b) => (a.purchase_rate || 0) - (b.purchase_rate || 0) || b.quiz_starts - a.quiz_starts)
    .slice(0, 10);

  const partnerAlerts = (partners as Record<string, unknown>[])
    .map((row) => ({
      partner: String(row.partner || "unknown"),
      net_purchases: Number(row.net_purchases || 0),
      purchase_rate: row.purchase_rate == null ? null : Number(row.purchase_rate),
      modeled_value_usd: Number(row.modeled_value_usd || 0),
    }))
    .filter((row) => row.net_purchases <= 0)
    .slice(0, 5);

  const estimatedSpend = rows.reduce((sum, row) => sum + row.estimated_spend, 0);
  const purchaseRevenue = rows.reduce((sum, row) => sum + row.purchase_revenue, 0);
  const proxyValue = rows.reduce((sum, row) => sum + row.add_to_cart_proxy_value, 0);
  const purchaseProfit = rows.reduce((sum, row) => sum + row.purchase_profit, 0);
  const proxyProfit = rows.reduce((sum, row) => sum + row.proxy_profit, 0);

  const recommendations: string[] = [];
  const topWinner = winningKeywords[0];
  if (topWinner) {
    recommendations.push(
      `Scale ${topWinner.keyword} on ${topWinner.platform} where it wins in ${topWinner.top_campaign}; purchase profit is $${topWinner.purchase_profit.toFixed(0)} with ${topWinner.net_purchases} net purchases.`,
    );
  }
  const topWaste = wastedKeywords[0];
  if (topWaste) {
    recommendations.push(
      `Cut or isolate ${topWaste.keyword} on ${topWaste.platform}; it is burning about $${topWaste.profit_gap_to_break_even.toFixed(0)} before break-even in ${topWaste.top_campaign}.`,
    );
  }
  const weakestPage = landingPageAlerts[0];
  if (weakestPage) {
    recommendations.push(
      `Review ${weakestPage.landing_page_path} first; it absorbs ${weakestPage.quiz_starts} high-intent entries with only ${weakestPage.net_purchases} net purchases.`,
    );
  }
  if (partnerAlerts.some((row) => row.partner === "Sprout")) {
    recommendations.push("Keep Sprout out of growth decisions until reversals are fixed; it is currently destroying purchase economics.");
  }
  const weakGoogleAd = googleAds
    .filter((row) => row.spend >= 250 && row.net_purchases <= 0)
    .sort((a, b) => b.spend - a.spend)[0];
  if (weakGoogleAd) {
    recommendations.push(
      `Rewrite or pause the weak Google RSA in ${weakGoogleAd.campaign_name}; it spent about $${weakGoogleAd.spend.toFixed(0)} with no net purchases.`,
    );
  }
  const strongGoogleAd = googleAds
    .filter((row) => row.net_purchases > 0 && row.purchase_profit > 0)
    .sort((a, b) => b.purchase_profit - a.purchase_profit)[0];
  if (strongGoogleAd) {
    recommendations.push(
      `Use ${strongGoogleAd.campaign_name} as a copy donor on Google; this RSA is positive on purchase profit and already has usable in-market proof.`,
    );
  }

  return {
    flow: [
      "1. Measurement truth",
      "2. Keyword economics",
      "3. Google click + ad copy layer",
      "4. Landing-page mismatch",
      "5. Partner risk",
      "6. Action recommendations",
    ],
    assumptions: {
      purchase_value_usd: PURCHASE_VALUE_USD,
      add_to_cart_share_of_purchase: ADD_TO_CART_SHARE_OF_PURCHASE,
      add_to_cart_proxy_value_usd: ADD_TO_CART_VALUE_USD,
      spend_allocation_method:
        "Google uses exact keyword-day spend from the GoogleAds transfer. Bing still allocates campaign-day spend to keyword by share of visits within the same platform/date/campaign.",
      spend_confidence: "hybrid_exact_google__inferred_bing",
    },
    measurement_truth: truth,
    summary: {
      spend_covered_keyword_rows: rows.length,
      estimated_spend: Number(estimatedSpend.toFixed(2)),
      purchase_revenue: Number(purchaseRevenue.toFixed(2)),
      add_to_cart_proxy_value: Number(proxyValue.toFixed(2)),
      purchase_profit: Number(purchaseProfit.toFixed(2)),
      proxy_profit: Number(proxyProfit.toFixed(2)),
      profitable_keyword_count: winningKeywords.length,
      waste_keyword_count: wastedKeywords.length,
      google_rsa_ads_analyzed: googleAds.length,
    },
    winning_keywords: winningKeywords,
    wasted_keywords: wastedKeywords,
    google_ad_copy_alerts: googleAds
      .filter((row) => row.spend >= 250)
      .sort((a, b) => a.purchase_profit - b.purchase_profit)
      .slice(0, 8),
    landing_page_alerts: landingPageAlerts,
    partner_alerts: partnerAlerts,
    recommendations,
  };
}
