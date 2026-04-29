import { runBigQuery } from "@/lib/bigquery";

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || "weightagent";
const CORE_DATASET_ID = process.env.BIGQUERY_DATASET || "WeightAgent";
const BING_DATASET_ID = process.env.BING_ADS_DATASET || "BingAds";
const PURCHASE_VALUE_USD = Number(process.env.DEFAULT_PURCHASE_VALUE_USD || "390");
const ADD_TO_CART_SHARE_OF_PURCHASE = Number(process.env.DEFAULT_ADD_TO_CART_SHARE_OF_PURCHASE || "0.25");
const ADD_TO_CART_VALUE_USD = Number(
  process.env.DEFAULT_ADD_TO_CART_VALUE_USD || String(PURCHASE_VALUE_USD * ADD_TO_CART_SHARE_OF_PURCHASE),
);

function coreTable(name: string) {
  return `\`${PROJECT_ID}.${CORE_DATASET_ID}.${name}\``;
}

function bingTable(name: string) {
  return `\`${PROJECT_ID}.${BING_DATASET_ID}.${name}\``;
}

function buildWhere(clauses: string[]) {
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildBingFilters(params: URLSearchParams) {
  const visitClauses = ["bv.platform_id = 'bing'"];
  const adClauses = ["TRUE"];
  const queryParams: Record<string, unknown> = {};

  const device = params.get("device");
  if (device) {
    const deviceMap: Record<string, string> = {
      c: "desktop",
      m: "mobile",
      t: "tablet",
      desktop: "desktop",
      mobile: "mobile",
      tablet: "tablet",
    };
    queryParams.device = deviceMap[device.toLowerCase()] || device.toLowerCase();
    visitClauses.push("bv.device_type = @device");
    adClauses.push("LOWER(COALESCE(s.device_type, 'unknown')) = @device");
  }

  const dateFrom = params.get("date_from");
  if (dateFrom) {
    queryParams.date_from = dateFrom;
    visitClauses.push("bv.entered_at_date >= @date_from");
    adClauses.push("s.data_date >= @date_from");
  }

  const dateTo = params.get("date_to");
  if (dateTo) {
    queryParams.date_to = dateTo;
    visitClauses.push("bv.entered_at_date <= @date_to");
    adClauses.push("s.data_date <= @date_to");
  }

  const campaignId = params.get("campaign_id");
  if (campaignId) {
    queryParams.campaign_id = campaignId;
    visitClauses.push("bv.campaign_id = @campaign_id");
    adClauses.push("CAST(s.campaign_id AS STRING) = @campaign_id");
  }

  const keyword = params.get("keyword");
  if (keyword) {
    queryParams.keyword = `%${keyword.toLowerCase()}%`;
    visitClauses.push("LOWER(COALESCE(bv.keyword, '')) LIKE @keyword");
  }

  return {
    visitWhere: buildWhere(visitClauses),
    adWhere: buildWhere(adClauses),
    params: queryParams,
  };
}

const baseCtes = `
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
    TIMESTAMP_SECONDS(conversion_at) AS conversion_at_ts,
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
bing_ad_entities AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      CAST(campaign_id AS STRING) AS campaign_id,
      CAST(ad_group_id AS STRING) AS adgroup_id,
      CAST(ad_id AS STRING) AS ad_id,
      ad_type,
      status,
      headlines_json,
      descriptions_json,
      final_urls,
      final_mobile_urls,
      path1,
      path2,
      ROW_NUMBER() OVER (
        PARTITION BY CAST(campaign_id AS STRING), CAST(ad_group_id AS STRING), CAST(ad_id AS STRING)
        ORDER BY pulled_at DESC
      ) AS rn
    FROM ${bingTable("ads")}
  )
  WHERE rn = 1
)
`;

export async function getBingAdCopyDiagnostics(params: URLSearchParams, limit = 100) {
  const filters = buildBingFilters(params);

  const sql = `
    ${baseCtes},
    bing_visits AS (
      SELECT
        bv.entered_at_date AS data_date,
        bv.campaign_id,
        bv.adgroup_id,
        bv.ad_id,
        bv.device_type,
        bv.visit_id,
        bv.keyword,
        bv.landing_page_path
      FROM visits_norm bv
      ${filters.visitWhere}
    ),
    bing_ad_day_visits AS (
      SELECT
        data_date,
        campaign_id,
        adgroup_id,
        ad_id,
        device_type,
        COUNT(*) AS matched_click_visits,
        STRING_AGG(DISTINCT keyword, ' | ' LIMIT 5) AS sample_keywords,
        STRING_AGG(DISTINCT landing_page_path, ' | ' LIMIT 3) AS sample_landing_pages
      FROM bing_visits
      GROUP BY data_date, campaign_id, adgroup_id, ad_id, device_type
    ),
    bing_ad_day_conversions AS (
      SELECT
        bv.data_date,
        bv.campaign_id,
        bv.adgroup_id,
        bv.ad_id,
        bv.device_type,
        COUNTIF(c.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(c.conversion_class = 'purchase') AS gross_purchases,
        COUNTIF(c.conversion_class = 'purchase_reversal') AS purchase_reversals,
        COUNTIF(c.conversion_class = 'purchase') - COUNTIF(c.conversion_class = 'purchase_reversal') AS net_purchases
      FROM bing_visits bv
      LEFT JOIN conversions_norm c
        ON c.visit_id = bv.visit_id
      GROUP BY bv.data_date, bv.campaign_id, bv.adgroup_id, bv.ad_id, bv.device_type
    ),
    bing_ad_rollup AS (
      SELECT
        'bing' AS platform_id,
        CAST(s.campaign_id AS STRING) AS campaign_id,
        CAST(s.ad_group_id AS STRING) AS adgroup_id,
        CAST(s.ad_id AS STRING) AS ad_id,
        s.campaign_name,
        s.ad_group_name,
        s.ad_name,
        e.ad_type,
        e.status AS ad_status,
        e.headlines_json,
        e.descriptions_json,
        e.final_urls,
        e.final_mobile_urls,
        e.path1,
        e.path2,
        SUM(s.impressions) AS impressions,
        SUM(s.clicks) AS clicks,
        ROUND(SUM(s.spend), 2) AS spend,
        SUM(COALESCE(v.matched_click_visits, 0)) AS matched_click_visits,
        SUM(COALESCE(c.add_to_carts, 0)) AS add_to_carts,
        SUM(COALESCE(c.gross_purchases, 0)) AS gross_purchases,
        SUM(COALESCE(c.purchase_reversals, 0)) AS purchase_reversals,
        SUM(COALESCE(c.net_purchases, 0)) AS net_purchases,
        ROUND(SUM(COALESCE(c.net_purchases, 0)) * ${PURCHASE_VALUE_USD}, 2) AS purchase_revenue,
        ROUND(SUM(COALESCE(c.net_purchases, 0)) * ${PURCHASE_VALUE_USD} - SUM(s.spend), 2) AS purchase_profit,
        ROUND(
          SAFE_DIVIDE(SUM(COALESCE(c.net_purchases, 0)) * ${PURCHASE_VALUE_USD} - SUM(s.spend), NULLIF(SUM(s.spend), 0)) * 100,
          2
        ) AS purchase_roi_pct,
        ARRAY_AGG(v.sample_keywords IGNORE NULLS LIMIT 1)[OFFSET(0)] AS sample_keywords,
        ARRAY_AGG(v.sample_landing_pages IGNORE NULLS LIMIT 1)[OFFSET(0)] AS sample_landing_pages
      FROM ${bingTable("ad_performance")} s
      LEFT JOIN bing_ad_day_visits v
        ON v.data_date = s.data_date
       AND v.campaign_id = CAST(s.campaign_id AS STRING)
       AND v.adgroup_id = CAST(s.ad_group_id AS STRING)
       AND v.ad_id = CAST(s.ad_id AS STRING)
       AND LOWER(v.device_type) = LOWER(COALESCE(s.device_type, 'unknown'))
      LEFT JOIN bing_ad_day_conversions c
        ON c.data_date = s.data_date
       AND c.campaign_id = CAST(s.campaign_id AS STRING)
       AND c.adgroup_id = CAST(s.ad_group_id AS STRING)
       AND c.ad_id = CAST(s.ad_id AS STRING)
       AND LOWER(c.device_type) = LOWER(COALESCE(s.device_type, 'unknown'))
      LEFT JOIN bing_ad_entities e
        ON e.campaign_id = CAST(s.campaign_id AS STRING)
       AND e.adgroup_id = CAST(s.ad_group_id AS STRING)
       AND e.ad_id = CAST(s.ad_id AS STRING)
      ${filters.adWhere}
      GROUP BY
        campaign_id, adgroup_id, ad_id, s.campaign_name, s.ad_group_name, s.ad_name,
        e.ad_type, ad_status, headlines_json, descriptions_json, final_urls, final_mobile_urls, path1, path2
    )
    SELECT *
    FROM bing_ad_rollup
    ORDER BY purchase_profit DESC, net_purchases DESC, spend DESC
    LIMIT ${limit}
  `;

  return runBigQuery(sql, filters.params);
}

export async function getBingKeywordOpportunities(params: URLSearchParams, limit = 200) {
  const filters = buildBingFilters(params);

  const sql = `
    ${baseCtes},
    bing_visits AS (
      SELECT
        bv.entered_at_date AS data_date,
        bv.campaign_id,
        bv.adgroup_id,
        bv.ad_id,
        bv.device_type,
        bv.visit_id,
        bv.keyword,
        bv.landing_page_path
      FROM visits_norm bv
      ${filters.visitWhere}
      AND bv.keyword IS NOT NULL
      AND bv.keyword != 'unknown'
    ),
    bing_keyword_visit_day AS (
      SELECT
        data_date,
        campaign_id,
        adgroup_id,
        ad_id,
        device_type,
        keyword,
        COUNT(*) AS visit_count
      FROM bing_visits
      GROUP BY data_date, campaign_id, adgroup_id, ad_id, device_type, keyword
    ),
    bing_keyword_landing_page_day AS (
      SELECT
        data_date,
        campaign_id,
        adgroup_id,
        ad_id,
        device_type,
        keyword,
        landing_page_path,
        COUNT(*) AS visit_count
      FROM bing_visits
      GROUP BY data_date, campaign_id, adgroup_id, ad_id, device_type, keyword, landing_page_path
    ),
    bing_keyword_top_lp AS (
      SELECT
        data_date,
        campaign_id,
        adgroup_id,
        ad_id,
        device_type,
        keyword,
        ARRAY_AGG(landing_page_path ORDER BY visit_count DESC LIMIT 1)[OFFSET(0)] AS landing_page_path
      FROM bing_keyword_landing_page_day
      GROUP BY data_date, campaign_id, adgroup_id, ad_id, device_type, keyword
    ),
    bing_ad_day_totals AS (
      SELECT
        data_date,
        campaign_id,
        adgroup_id,
        ad_id,
        device_type,
        SUM(visit_count) AS ad_visit_count
      FROM bing_keyword_visit_day
      GROUP BY data_date, campaign_id, adgroup_id, ad_id, device_type
    ),
    bing_keyword_conversion_day AS (
      SELECT
        bv.data_date,
        bv.campaign_id,
        bv.adgroup_id,
        bv.ad_id,
        bv.device_type,
        bv.keyword,
        COUNTIF(c.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(c.conversion_class = 'purchase') AS gross_purchases,
        COUNTIF(c.conversion_class = 'purchase_reversal') AS purchase_reversals,
        COUNTIF(c.conversion_class = 'purchase') - COUNTIF(c.conversion_class = 'purchase_reversal') AS net_purchases
      FROM bing_visits bv
      LEFT JOIN conversions_norm c
        ON c.visit_id = bv.visit_id
      GROUP BY bv.data_date, bv.campaign_id, bv.adgroup_id, bv.ad_id, bv.device_type, bv.keyword
    ),
    bing_keyword_rollup_day AS (
      SELECT
        'bing' AS platform_id,
        kv.keyword,
        kv.data_date,
        kv.campaign_id,
        s.campaign_name,
        tlp.landing_page_path,
        kv.visit_count,
        adt.ad_visit_count,
        COALESCE(kc.add_to_carts, 0) AS add_to_carts,
        COALESCE(kc.gross_purchases, 0) AS gross_purchases,
        COALESCE(kc.purchase_reversals, 0) AS purchase_reversals,
        COALESCE(kc.net_purchases, 0) AS net_purchases,
        s.impressions AS ad_impressions,
        s.clicks AS ad_clicks,
        s.spend AS ad_spend
      FROM bing_keyword_visit_day kv
      JOIN bing_ad_day_totals adt
        ON adt.data_date = kv.data_date
       AND adt.campaign_id = kv.campaign_id
       AND adt.adgroup_id = kv.adgroup_id
       AND adt.ad_id = kv.ad_id
       AND adt.device_type = kv.device_type
      JOIN ${bingTable("ad_performance")} s
        ON s.data_date = kv.data_date
       AND CAST(s.campaign_id AS STRING) = kv.campaign_id
       AND CAST(s.ad_group_id AS STRING) = kv.adgroup_id
       AND CAST(s.ad_id AS STRING) = kv.ad_id
       AND LOWER(COALESCE(s.device_type, 'unknown')) = kv.device_type
      LEFT JOIN bing_keyword_conversion_day kc
        ON kc.data_date = kv.data_date
       AND kc.campaign_id = kv.campaign_id
       AND kc.adgroup_id = kv.adgroup_id
       AND kc.ad_id = kv.ad_id
       AND kc.device_type = kv.device_type
       AND kc.keyword = kv.keyword
      LEFT JOIN bing_keyword_top_lp tlp
        ON tlp.data_date = kv.data_date
       AND tlp.campaign_id = kv.campaign_id
       AND tlp.adgroup_id = kv.adgroup_id
       AND tlp.ad_id = kv.ad_id
       AND tlp.device_type = kv.device_type
       AND tlp.keyword = kv.keyword
    )
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
      ROUND(SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), 2) AS estimated_spend,
      ROUND(SUM(ad_impressions * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), 0) AS estimated_impressions,
      ROUND(SUM(ad_clicks * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), 0) AS estimated_clicks,
      ROUND(SUM(net_purchases) * ${PURCHASE_VALUE_USD}, 2) AS purchase_revenue,
      ROUND(SUM(add_to_carts) * ${ADD_TO_CART_VALUE_USD}, 2) AS add_to_cart_proxy_value,
      ROUND(SUM(net_purchases) * ${PURCHASE_VALUE_USD} - SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), 2) AS purchase_profit,
      ROUND(SUM(net_purchases) * ${PURCHASE_VALUE_USD} + SUM(add_to_carts) * ${ADD_TO_CART_VALUE_USD} - SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), 2) AS proxy_profit,
      ROUND(SAFE_DIVIDE(SUM(net_purchases) * ${PURCHASE_VALUE_USD} - SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), NULLIF(SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), 0)) * 100, 2) AS purchase_roi_pct,
      ROUND(SAFE_DIVIDE(SUM(net_purchases), NULLIF(SUM(visit_count), 0)) * 100, 2) AS purchase_rate_per_visit,
      ROUND(GREATEST(SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))) - SUM(net_purchases) * ${PURCHASE_VALUE_USD}, 0), 2) AS profit_gap_to_break_even,
      'bing_exact_ad_day_allocated_to_keyword' AS spend_confidence,
      CASE
        WHEN SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))) >= 1000 AND SUM(net_purchases) = 0 THEN 'Traffic without purchases'
        WHEN SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))) >= 1000
          AND SUM(net_purchases) * ${PURCHASE_VALUE_USD} - SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))) < 0
          THEN 'Losing money at purchase level'
        WHEN SUM(add_to_carts) > 0 AND SUM(net_purchases) = 0 THEN 'Proxy interest without purchase'
        WHEN SUM(net_purchases) * ${PURCHASE_VALUE_USD} - SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))) > 0
          AND SAFE_DIVIDE(SUM(net_purchases) * ${PURCHASE_VALUE_USD} - SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), NULLIF(SUM(ad_spend * SAFE_DIVIDE(visit_count, NULLIF(ad_visit_count, 0))), 0)) >= 0.25
          THEN 'Profitable keyword'
        WHEN SUM(net_purchases) > 0 THEN 'Converts, but monitor economics'
        ELSE 'Low-signal keyword'
      END AS diagnosis
    FROM bing_keyword_rollup_day
    GROUP BY platform_id, keyword
    ORDER BY purchase_profit DESC, net_purchases DESC, estimated_spend DESC
    LIMIT ${limit}
  `;

  return runBigQuery(sql, filters.params);
}
