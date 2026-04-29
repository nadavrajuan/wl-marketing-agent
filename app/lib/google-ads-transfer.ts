import { runBigQuery } from "@/lib/bigquery";

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || "weightagent";
const CORE_DATASET_ID = process.env.BIGQUERY_DATASET || "WeightAgent";
const GOOGLE_ADS_DATASET_ID = process.env.GOOGLE_ADS_DATASET || "GoogleAds";
const GOOGLE_ADS_CUSTOMER_SUFFIX = process.env.GOOGLE_ADS_CUSTOMER_SUFFIX || "4808949235";

const PURCHASE_VALUE_USD = Number(process.env.DEFAULT_PURCHASE_VALUE_USD || "390");
const ADD_TO_CART_SHARE_OF_PURCHASE = Number(
  process.env.DEFAULT_ADD_TO_CART_SHARE_OF_PURCHASE || "0.25",
);
const ADD_TO_CART_VALUE_USD = Number(
  process.env.DEFAULT_ADD_TO_CART_VALUE_USD || String(PURCHASE_VALUE_USD * ADD_TO_CART_SHARE_OF_PURCHASE),
);

function coreTable(name: string) {
  return `\`${PROJECT_ID}.${CORE_DATASET_ID}.${name}\``;
}

function googleAdsTable(name: string) {
  return `\`${PROJECT_ID}.${GOOGLE_ADS_DATASET_ID}.${name}_${GOOGLE_ADS_CUSTOMER_SUFFIX}\``;
}

function buildWhere(clauses: string[]) {
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildGoogleFilters(params: URLSearchParams) {
  const clickClauses = ["gc.click_view_gclid IS NOT NULL"];
  const clickVisitClauses = ["gcv.gclid IS NOT NULL"];
  const statsClauses = ["TRUE"];
  const searchClauses = ["TRUE"];
  const adClauses = ["e.ad_type = 'RESPONSIVE_SEARCH_AD'"];
  const queryParams: Record<string, unknown> = {};

  const device = params.get("device");
  if (device) {
    const deviceMap: Record<string, string> = { c: "DESKTOP", m: "MOBILE", t: "TABLET" };
    queryParams.device = deviceMap[device.toLowerCase()] || device.toUpperCase();
    clickClauses.push("gc.segments_device = @device");
    clickVisitClauses.push("UPPER(gcv.device_type) = @device");
    statsClauses.push("segments_device = @device");
    searchClauses.push("segments_device = @device");
  }

  const dateFrom = params.get("date_from");
  if (dateFrom) {
    queryParams.date_from = dateFrom;
    clickClauses.push("gc.segments_date >= @date_from");
    clickVisitClauses.push("gcv.data_date >= @date_from");
    statsClauses.push("segments_date >= @date_from");
    searchClauses.push("segments_date >= @date_from");
  }

  const dateTo = params.get("date_to");
  if (dateTo) {
    queryParams.date_to = dateTo;
    clickClauses.push("gc.segments_date <= @date_to");
    clickVisitClauses.push("gcv.data_date <= @date_to");
    statsClauses.push("segments_date <= @date_to");
    searchClauses.push("segments_date <= @date_to");
  }

  const campaignId = params.get("campaign_id");
  if (campaignId) {
    queryParams.campaign_id = campaignId;
    clickClauses.push("CAST(gc.campaign_id AS STRING) = @campaign_id");
    clickVisitClauses.push("gcv.campaign_id = @campaign_id");
    statsClauses.push("CAST(campaign_id AS STRING) = @campaign_id");
    searchClauses.push("CAST(campaign_id AS STRING) = @campaign_id");
    adClauses.push("e.campaign_id = @campaign_id");
  }

  const keyword = params.get("keyword");
  if (keyword) {
    queryParams.keyword = `%${keyword.toLowerCase()}%`;
    clickClauses.push("LOWER(COALESCE(gc.click_view_keyword_info_text, '')) LIKE @keyword");
    clickVisitClauses.push("LOWER(COALESCE(gcv.keyword_text, '')) LIKE @keyword");
    statsClauses.push("LOWER(COALESCE(ke.ad_group_criterion_keyword_text, '')) LIKE @keyword");
    searchClauses.push("LOWER(COALESCE(search_term_view_search_term, '')) LIKE @keyword");
  }

  return {
    clickWhere: buildWhere(clickClauses),
    clickVisitWhere: buildWhere(clickVisitClauses),
    statsWhere: buildWhere(statsClauses),
    searchWhere: buildWhere(searchClauses),
    adWhere: buildWhere(adClauses),
    params: queryParams,
  };
}

const baseGoogleCtes = `
WITH visits_lookup AS (
  SELECT
    id,
    gclid,
    entered_at,
    entered_at_date,
    COALESCE(NULLIF(REGEXP_EXTRACT(landing_page, r'^https?://[^/]+([^?#]*)'), ''), '/') AS landing_page_path
  FROM ${coreTable("visits")}
),
visits_by_gclid AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      id AS visit_id,
      gclid,
      entered_at,
      entered_at_date,
      landing_page_path,
      ROW_NUMBER() OVER (PARTITION BY gclid ORDER BY entered_at DESC, id DESC) AS rn
    FROM visits_lookup
    WHERE gclid IS NOT NULL
  )
  WHERE rn = 1
),
conversions_norm AS (
  SELECT
    id,
    visit_id,
    TIMESTAMP_SECONDS(conversion_at) AS conversion_at_ts,
    DATE(TIMESTAMP_SECONDS(conversion_at)) AS conversion_date,
    COALESCE(brand_display_name, 'unknown') AS brand_name,
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
    END AS conversion_class
  FROM ${coreTable("conversions")}
),
google_keyword_entities AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT
      CAST(ad_group_criterion_criterion_id AS STRING) AS keyword_criterion_id,
      CAST(ad_group_id AS STRING) AS adgroup_id,
      CAST(campaign_id AS STRING) AS campaign_id,
      ad_group_criterion_keyword_text,
      ad_group_criterion_keyword_match_type,
      ad_group_criterion_status,
      ad_group_criterion_quality_info_quality_score,
      _DATA_DATE,
      ROW_NUMBER() OVER (
        PARTITION BY CAST(ad_group_criterion_criterion_id AS STRING)
        ORDER BY _DATA_DATE DESC
      ) AS rn
    FROM ${googleAdsTable("ads_Keyword")}
  )
  WHERE rn = 1
),
google_campaign_names AS (
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
google_click_visits AS (
  SELECT
    gc.click_view_gclid AS gclid,
    gc.segments_date AS data_date,
    CAST(gc.campaign_id AS STRING) AS campaign_id,
    CAST(gc.ad_group_id AS STRING) AS adgroup_id,
    CAST(REGEXP_EXTRACT(gc.click_view_ad_group_ad, r'~([0-9]+)$') AS STRING) AS ad_id,
    CAST(REGEXP_EXTRACT(gc.click_view_keyword, r'~([0-9]+)$') AS STRING) AS keyword_criterion_id,
    COALESCE(ke.ad_group_criterion_keyword_text, gc.click_view_keyword_info_text) AS keyword_text,
    COALESCE(ke.ad_group_criterion_keyword_match_type, gc.click_view_keyword_info_match_type) AS keyword_match_type,
    CASE
      WHEN gc.segments_device = 'MOBILE' THEN 'mobile'
      WHEN gc.segments_device = 'DESKTOP' THEN 'desktop'
      WHEN gc.segments_device = 'TABLET' THEN 'tablet'
      ELSE LOWER(COALESCE(gc.segments_device, 'unknown'))
    END AS device_type,
    vb.visit_id,
    vb.entered_at,
    vb.entered_at_date,
    vb.landing_page_path
  FROM ${googleAdsTable("ads_ClickStats")} gc
  LEFT JOIN visits_by_gclid vb
    ON vb.gclid = gc.click_view_gclid
  LEFT JOIN google_keyword_entities ke
    ON ke.keyword_criterion_id = CAST(REGEXP_EXTRACT(gc.click_view_keyword, r'~([0-9]+)$') AS STRING)
   AND ke.adgroup_id = CAST(gc.ad_group_id AS STRING)
   AND ke.campaign_id = CAST(gc.campaign_id AS STRING)
)
`;

export async function getGoogleKeywordOpportunities(params: URLSearchParams, limit = 200) {
  const filters = buildGoogleFilters(params);

  const sql = `
    ${baseGoogleCtes},
    google_keyword_stats AS (
      SELECT
        ks.segments_date AS data_date,
        CAST(ks.campaign_id AS STRING) AS campaign_id,
        CAST(ks.ad_group_id AS STRING) AS adgroup_id,
        CAST(ks.ad_group_criterion_criterion_id AS STRING) AS keyword_criterion_id,
        CASE
          WHEN ks.segments_device = 'MOBILE' THEN 'mobile'
          WHEN ks.segments_device = 'DESKTOP' THEN 'desktop'
          WHEN ks.segments_device = 'TABLET' THEN 'tablet'
          ELSE LOWER(COALESCE(ks.segments_device, 'unknown'))
        END AS device_type,
        SUM(ks.metrics_impressions) AS impressions,
        SUM(ks.metrics_clicks) AS clicks,
        ROUND(SUM(ks.metrics_cost_micros) / 1000000, 2) AS spend
      FROM ${googleAdsTable("ads_KeywordStats")} ks
      LEFT JOIN google_keyword_entities ke
        ON ke.keyword_criterion_id = CAST(ks.ad_group_criterion_criterion_id AS STRING)
       AND ke.adgroup_id = CAST(ks.ad_group_id AS STRING)
       AND ke.campaign_id = CAST(ks.campaign_id AS STRING)
      ${filters.statsWhere}
      GROUP BY 1, 2, 3, 4, 5
    ),
    google_keyword_visits AS (
      SELECT
        gcv.data_date,
        gcv.campaign_id,
        gcv.adgroup_id,
        gcv.keyword_criterion_id,
        COUNT(*) AS matched_click_visits
      FROM google_click_visits gcv
      ${filters.clickVisitWhere}
      GROUP BY gcv.data_date, gcv.campaign_id, gcv.adgroup_id, gcv.keyword_criterion_id
    ),
    google_keyword_landing_pages AS (
      SELECT
        gcv.data_date,
        gcv.campaign_id,
        gcv.adgroup_id,
        gcv.keyword_criterion_id,
        gcv.landing_page_path,
        COUNT(*) AS visits
      FROM google_click_visits gcv
      ${filters.clickVisitWhere}
      GROUP BY gcv.data_date, gcv.campaign_id, gcv.adgroup_id, gcv.keyword_criterion_id, gcv.landing_page_path
    ),
    google_keyword_top_lp AS (
      SELECT
        data_date,
        campaign_id,
        adgroup_id,
        keyword_criterion_id,
        ARRAY_AGG(landing_page_path ORDER BY visits DESC LIMIT 1)[OFFSET(0)] AS landing_page_path
      FROM google_keyword_landing_pages
      GROUP BY data_date, campaign_id, adgroup_id, keyword_criterion_id
    ),
    google_keyword_conversions AS (
      SELECT
        gcv.data_date,
        gcv.campaign_id,
        gcv.adgroup_id,
        gcv.keyword_criterion_id,
        COUNTIF(c.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(c.conversion_class = 'purchase') AS gross_purchases,
        COUNTIF(c.conversion_class = 'purchase_reversal') AS purchase_reversals,
        COUNTIF(c.conversion_class = 'purchase') - COUNTIF(c.conversion_class = 'purchase_reversal') AS net_purchases,
        ROUND(
          AVG(
            CASE
              WHEN c.conversion_class = 'purchase' AND gcv.entered_at IS NOT NULL
              THEN TIMESTAMP_DIFF(c.conversion_at_ts, TIMESTAMP_SECONDS(gcv.entered_at), SECOND)
            END
          ) / 60,
          1
        ) AS avg_purchase_cycle_minutes
      FROM google_click_visits gcv
      LEFT JOIN conversions_norm c
        ON c.visit_id = gcv.visit_id
      ${filters.clickVisitWhere}
      GROUP BY gcv.data_date, gcv.campaign_id, gcv.adgroup_id, gcv.keyword_criterion_id
    ),
    google_keyword_day AS (
      SELECT
        'google' AS platform_id,
        COALESCE(ke.ad_group_criterion_keyword_text, 'unknown') AS keyword,
        gks.campaign_id,
        gks.adgroup_id,
        gks.keyword_criterion_id,
        COALESCE(gcn.campaign_name, gks.campaign_id) AS campaign_name,
        tlp.landing_page_path,
        ke.ad_group_criterion_keyword_match_type AS keyword_match_type,
        ke.ad_group_criterion_status AS keyword_status,
        ke.ad_group_criterion_quality_info_quality_score AS quality_score,
        COALESCE(gv.matched_click_visits, 0) AS visits,
        COALESCE(gkc.add_to_carts, 0) AS add_to_carts,
        COALESCE(gkc.gross_purchases, 0) AS gross_purchases,
        COALESCE(gkc.purchase_reversals, 0) AS purchase_reversals,
        COALESCE(gkc.net_purchases, 0) AS net_purchases,
        COALESCE(gkc.avg_purchase_cycle_minutes, 0) AS avg_purchase_cycle_minutes,
        gks.impressions,
        gks.clicks,
        gks.spend
      FROM google_keyword_stats gks
      LEFT JOIN google_keyword_entities ke
        ON ke.keyword_criterion_id = gks.keyword_criterion_id
       AND ke.adgroup_id = gks.adgroup_id
       AND ke.campaign_id = gks.campaign_id
      LEFT JOIN google_keyword_visits gv
        ON gv.data_date = gks.data_date
       AND gv.campaign_id = gks.campaign_id
       AND gv.adgroup_id = gks.adgroup_id
       AND gv.keyword_criterion_id = gks.keyword_criterion_id
      LEFT JOIN google_keyword_conversions gkc
        ON gkc.data_date = gks.data_date
       AND gkc.campaign_id = gks.campaign_id
       AND gkc.adgroup_id = gks.adgroup_id
       AND gkc.keyword_criterion_id = gks.keyword_criterion_id
      LEFT JOIN google_keyword_top_lp tlp
        ON tlp.data_date = gks.data_date
       AND tlp.campaign_id = gks.campaign_id
       AND tlp.adgroup_id = gks.adgroup_id
       AND tlp.keyword_criterion_id = gks.keyword_criterion_id
      LEFT JOIN google_campaign_names gcn
        ON gcn.campaign_id = gks.campaign_id
      WHERE COALESCE(ke.ad_group_criterion_keyword_text, '') != ''
    )
    SELECT
      platform_id,
      keyword,
      ARRAY_AGG(campaign_name IGNORE NULLS ORDER BY net_purchases DESC, spend DESC LIMIT 1)[OFFSET(0)] AS top_campaign,
      ARRAY_AGG(landing_page_path IGNORE NULLS ORDER BY net_purchases DESC, visits DESC LIMIT 1)[OFFSET(0)] AS top_landing_page,
      SUM(visits) AS visits,
      SUM(add_to_carts) AS add_to_carts,
      SUM(gross_purchases) AS gross_purchases,
      SUM(purchase_reversals) AS purchase_reversals,
      SUM(net_purchases) AS net_purchases,
      ROUND(SUM(spend), 2) AS estimated_spend,
      SUM(impressions) AS estimated_impressions,
      SUM(clicks) AS estimated_clicks,
      ROUND(SUM(net_purchases) * ${PURCHASE_VALUE_USD}, 2) AS purchase_revenue,
      ROUND(SUM(add_to_carts) * ${ADD_TO_CART_VALUE_USD}, 2) AS add_to_cart_proxy_value,
      ROUND(SUM(net_purchases) * ${PURCHASE_VALUE_USD} - SUM(spend), 2) AS purchase_profit,
      ROUND(SUM(net_purchases) * ${PURCHASE_VALUE_USD} + SUM(add_to_carts) * ${ADD_TO_CART_VALUE_USD} - SUM(spend), 2) AS proxy_profit,
      ROUND(SAFE_DIVIDE(SUM(net_purchases) * ${PURCHASE_VALUE_USD} - SUM(spend), NULLIF(SUM(spend), 0)) * 100, 2) AS purchase_roi_pct,
      ROUND(SAFE_DIVIDE(SUM(net_purchases) * ${PURCHASE_VALUE_USD} + SUM(add_to_carts) * ${ADD_TO_CART_VALUE_USD} - SUM(spend), NULLIF(SUM(spend), 0)) * 100, 2) AS proxy_roi_pct,
      ROUND(GREATEST(SUM(spend) - SUM(net_purchases) * ${PURCHASE_VALUE_USD}, 0), 2) AS profit_gap_to_break_even,
      ROUND(SAFE_DIVIDE(SUM(net_purchases), NULLIF(SUM(visits), 0)) * 100, 2) AS purchase_rate_per_visit,
      ROUND(AVG(NULLIF(avg_purchase_cycle_minutes, 0)), 1) AS avg_purchase_cycle_minutes,
      ROUND(SAFE_DIVIDE(SUM(visits), NULLIF(SUM(clicks), 0)) * 100, 2) AS click_to_visit_match_pct,
      'exact_google_keyword_day' AS spend_confidence,
      ARRAY_AGG(keyword_match_type IGNORE NULLS ORDER BY keyword_match_type LIMIT 1)[OFFSET(0)] AS keyword_match_type,
      ARRAY_AGG(keyword_status IGNORE NULLS ORDER BY keyword_status LIMIT 1)[OFFSET(0)] AS keyword_status,
      ARRAY_AGG(CAST(quality_score AS STRING) IGNORE NULLS ORDER BY quality_score DESC LIMIT 1)[OFFSET(0)] AS quality_score
    FROM google_keyword_day
    GROUP BY platform_id, keyword
    ORDER BY purchase_profit DESC, net_purchases DESC, estimated_spend DESC
    LIMIT ${limit}
  `;

  return runBigQuery(sql, filters.params);
}

export async function getGoogleAdCopyDiagnostics(params: URLSearchParams, limit = 100) {
  const filters = buildGoogleFilters(params);

  const sql = `
    ${baseGoogleCtes},
    google_ad_entities AS (
      SELECT * EXCEPT(rn)
      FROM (
        SELECT
          CAST(campaign_id AS STRING) AS campaign_id,
          CAST(ad_group_id AS STRING) AS adgroup_id,
          CAST(ad_group_ad_ad_id AS STRING) AS ad_id,
          ad_group_ad_ad_name,
          ad_group_ad_ad_type,
          ad_group_ad_ad_strength,
          ad_group_ad_policy_summary_approval_status,
          ad_group_ad_status,
          ad_group_ad_ad_final_urls,
          ad_group_ad_ad_final_mobile_urls,
          ad_group_ad_ad_responsive_search_ad_headlines,
          ad_group_ad_ad_responsive_search_ad_descriptions,
          ad_group_ad_ad_responsive_search_ad_path1,
          ad_group_ad_ad_responsive_search_ad_path2,
          _DATA_DATE,
          ROW_NUMBER() OVER (
            PARTITION BY CAST(campaign_id AS STRING), CAST(ad_group_id AS STRING), CAST(ad_group_ad_ad_id AS STRING)
            ORDER BY _DATA_DATE DESC
          ) AS rn
        FROM ${googleAdsTable("ads_Ad")}
      )
      WHERE rn = 1
    ),
    google_ad_stats AS (
      SELECT
        segments_date AS data_date,
        CAST(campaign_id AS STRING) AS campaign_id,
        CAST(ad_group_id AS STRING) AS adgroup_id,
        CAST(ad_group_ad_ad_id AS STRING) AS ad_id,
        SUM(metrics_impressions) AS impressions,
        SUM(metrics_clicks) AS clicks,
        ROUND(SUM(metrics_cost_micros) / 1000000, 2) AS spend
      FROM ${googleAdsTable("ads_AdBasicStats")}
      ${filters.statsWhere}
      GROUP BY data_date, campaign_id, adgroup_id, ad_id
    ),
    google_ad_conversions AS (
      SELECT
        gcv.data_date,
        gcv.campaign_id,
        gcv.adgroup_id,
        gcv.ad_id,
        COUNT(*) AS matched_click_visits,
        COUNTIF(c.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(c.conversion_class = 'purchase') AS gross_purchases,
        COUNTIF(c.conversion_class = 'purchase_reversal') AS purchase_reversals,
        COUNTIF(c.conversion_class = 'purchase') - COUNTIF(c.conversion_class = 'purchase_reversal') AS net_purchases,
        STRING_AGG(DISTINCT gcv.keyword_text, ' | ' LIMIT 5) AS sample_keywords,
        STRING_AGG(DISTINCT gcv.landing_page_path, ' | ' LIMIT 3) AS sample_landing_pages
      FROM google_click_visits gcv
      LEFT JOIN conversions_norm c
        ON c.visit_id = gcv.visit_id
      ${filters.clickVisitWhere}
      GROUP BY gcv.data_date, gcv.campaign_id, gcv.adgroup_id, gcv.ad_id
    ),
    google_ad_rollup AS (
      SELECT
        s.campaign_id,
        s.adgroup_id,
        s.ad_id,
        COALESCE(gcn.campaign_name, s.campaign_id) AS campaign_name,
        e.ad_group_ad_ad_name AS ad_name,
        e.ad_group_ad_ad_type AS ad_type,
        e.ad_group_ad_ad_strength AS ad_strength,
        e.ad_group_ad_policy_summary_approval_status AS approval_status,
        e.ad_group_ad_status AS ad_status,
        e.ad_group_ad_ad_final_urls AS final_urls,
        e.ad_group_ad_ad_final_mobile_urls AS final_mobile_urls,
        e.ad_group_ad_ad_responsive_search_ad_headlines AS headlines_json,
        e.ad_group_ad_ad_responsive_search_ad_descriptions AS descriptions_json,
        e.ad_group_ad_ad_responsive_search_ad_path1 AS path1,
        e.ad_group_ad_ad_responsive_search_ad_path2 AS path2,
        SUM(s.impressions) AS impressions,
        SUM(s.clicks) AS clicks,
        ROUND(SUM(s.spend), 2) AS spend,
        SUM(COALESCE(c.matched_click_visits, 0)) AS matched_click_visits,
        SUM(COALESCE(c.add_to_carts, 0)) AS add_to_carts,
        SUM(COALESCE(c.gross_purchases, 0)) AS gross_purchases,
        SUM(COALESCE(c.purchase_reversals, 0)) AS purchase_reversals,
        SUM(COALESCE(c.net_purchases, 0)) AS net_purchases,
        ROUND(SUM(COALESCE(c.net_purchases, 0)) * ${PURCHASE_VALUE_USD}, 2) AS purchase_revenue,
        ROUND(SUM(COALESCE(c.net_purchases, 0)) * ${PURCHASE_VALUE_USD} - SUM(s.spend), 2) AS purchase_profit,
        ROUND(SAFE_DIVIDE(SUM(COALESCE(c.net_purchases, 0)) * ${PURCHASE_VALUE_USD} - SUM(s.spend), NULLIF(SUM(s.spend), 0)) * 100, 2) AS purchase_roi_pct,
        ARRAY_AGG(c.sample_keywords IGNORE NULLS LIMIT 1)[OFFSET(0)] AS sample_keywords,
        ARRAY_AGG(c.sample_landing_pages IGNORE NULLS LIMIT 1)[OFFSET(0)] AS sample_landing_pages
      FROM google_ad_stats s
      LEFT JOIN google_ad_conversions c
        ON c.data_date = s.data_date
       AND c.campaign_id = s.campaign_id
       AND c.adgroup_id = s.adgroup_id
       AND c.ad_id = s.ad_id
      LEFT JOIN google_ad_entities e
        ON e.campaign_id = s.campaign_id
       AND e.adgroup_id = s.adgroup_id
       AND e.ad_id = s.ad_id
      LEFT JOIN google_campaign_names gcn
        ON gcn.campaign_id = s.campaign_id
      GROUP BY
        s.campaign_id, s.adgroup_id, s.ad_id, campaign_name, ad_name, ad_type, ad_strength,
        approval_status, ad_status, final_urls, final_mobile_urls, headlines_json, descriptions_json, path1, path2
    )
    SELECT
      *
    FROM google_ad_rollup e
    ${filters.adWhere}
    ORDER BY purchase_profit DESC, net_purchases DESC, spend DESC
    LIMIT ${limit}
  `;

  return runBigQuery(sql, filters.params);
}

export async function getGoogleSearchQueryDiagnostics(params: URLSearchParams, limit = 150) {
  const filters = buildGoogleFilters(params);

  const sql = `
    ${baseGoogleCtes},
    google_search_query_stats AS (
      SELECT
        segments_date AS data_date,
        CAST(campaign_id AS STRING) AS campaign_id,
        CAST(ad_group_id AS STRING) AS adgroup_id,
        CAST(ad_group_ad_ad_id AS STRING) AS ad_id,
        CAST(REGEXP_EXTRACT(segments_keyword_ad_group_criterion, r'~([0-9]+)$') AS STRING) AS keyword_criterion_id,
        search_term_view_search_term AS search_query,
        search_term_view_status AS search_query_status,
        segments_search_term_match_type AS search_query_match_type,
        CASE
          WHEN segments_device = 'MOBILE' THEN 'mobile'
          WHEN segments_device = 'DESKTOP' THEN 'desktop'
          WHEN segments_device = 'TABLET' THEN 'tablet'
          ELSE LOWER(COALESCE(segments_device, 'unknown'))
        END AS device_type,
        SUM(metrics_impressions) AS impressions,
        SUM(metrics_clicks) AS clicks,
        ROUND(SUM(metrics_cost_micros) / 1000000, 2) AS spend
      FROM ${googleAdsTable("ads_SearchQueryStats")}
      ${filters.searchWhere}
      GROUP BY
        data_date, campaign_id, adgroup_id, ad_id, keyword_criterion_id, search_query,
        search_query_status, search_query_match_type, device_type
    ),
    google_keyword_day_totals AS (
      SELECT
        gcv.data_date,
        gcv.campaign_id,
        gcv.adgroup_id,
        gcv.keyword_criterion_id,
        gcv.device_type,
        COUNT(*) AS matched_click_visits,
        COUNTIF(c.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(c.conversion_class = 'purchase') AS gross_purchases,
        COUNTIF(c.conversion_class = 'purchase_reversal') AS purchase_reversals,
        COUNTIF(c.conversion_class = 'purchase') - COUNTIF(c.conversion_class = 'purchase_reversal') AS net_purchases,
        STRING_AGG(DISTINCT gcv.landing_page_path, ' | ' LIMIT 3) AS landing_pages
      FROM google_click_visits gcv
      LEFT JOIN conversions_norm c
        ON c.visit_id = gcv.visit_id
      ${filters.clickVisitWhere}
      GROUP BY gcv.data_date, gcv.campaign_id, gcv.adgroup_id, gcv.keyword_criterion_id, gcv.device_type
    ),
    search_query_rollup AS (
      SELECT
        'google' AS platform_id,
        sq.search_query,
        sq.search_query_status,
        sq.search_query_match_type,
        COALESCE(ke.ad_group_criterion_keyword_text, 'unknown') AS keyword,
        ke.ad_group_criterion_keyword_match_type AS keyword_match_type,
        ke.ad_group_criterion_status AS keyword_status,
        ke.ad_group_criterion_quality_info_quality_score AS quality_score,
        COALESCE(gcn.campaign_name, sq.campaign_id) AS campaign_name,
        sq.campaign_id,
        sq.adgroup_id,
        sq.ad_id,
        sq.device_type,
        sq.impressions,
        sq.clicks,
        sq.spend,
        COALESCE(kd.matched_click_visits, 0) AS matched_click_visits,
        COALESCE(kd.add_to_carts, 0) AS keyword_add_to_carts,
        COALESCE(kd.net_purchases, 0) AS keyword_net_purchases,
        COALESCE(kd.landing_pages, '') AS landing_pages,
        ROUND(
          COALESCE(kd.net_purchases, 0) * SAFE_DIVIDE(sq.clicks, NULLIF(SUM(sq.clicks) OVER (
            PARTITION BY sq.data_date, sq.campaign_id, sq.adgroup_id, sq.keyword_criterion_id, sq.device_type
          ), 0)),
          4
        ) AS estimated_net_purchases,
        ROUND(
          COALESCE(kd.add_to_carts, 0) * SAFE_DIVIDE(sq.clicks, NULLIF(SUM(sq.clicks) OVER (
            PARTITION BY sq.data_date, sq.campaign_id, sq.adgroup_id, sq.keyword_criterion_id, sq.device_type
          ), 0)),
          4
        ) AS estimated_add_to_carts
      FROM google_search_query_stats sq
      LEFT JOIN google_keyword_entities ke
        ON ke.keyword_criterion_id = sq.keyword_criterion_id
       AND ke.adgroup_id = sq.adgroup_id
       AND ke.campaign_id = sq.campaign_id
      LEFT JOIN google_keyword_day_totals kd
        ON kd.data_date = sq.data_date
       AND kd.campaign_id = sq.campaign_id
       AND kd.adgroup_id = sq.adgroup_id
       AND kd.keyword_criterion_id = sq.keyword_criterion_id
       AND kd.device_type = sq.device_type
      LEFT JOIN google_campaign_names gcn
        ON gcn.campaign_id = sq.campaign_id
      WHERE COALESCE(sq.search_query, '') != ''
    )
    SELECT
      platform_id,
      search_query,
      ARRAY_AGG(campaign_name IGNORE NULLS ORDER BY spend DESC LIMIT 1)[OFFSET(0)] AS top_campaign,
      ARRAY_AGG(landing_pages IGNORE NULLS ORDER BY spend DESC LIMIT 1)[OFFSET(0)] AS landing_pages,
      ARRAY_AGG(keyword IGNORE NULLS ORDER BY spend DESC LIMIT 1)[OFFSET(0)] AS mapped_keyword,
      ARRAY_AGG(keyword_match_type IGNORE NULLS ORDER BY keyword_match_type LIMIT 1)[OFFSET(0)] AS keyword_match_type,
      ARRAY_AGG(keyword_status IGNORE NULLS ORDER BY keyword_status LIMIT 1)[OFFSET(0)] AS keyword_status,
      ARRAY_AGG(CAST(quality_score AS STRING) IGNORE NULLS ORDER BY quality_score DESC LIMIT 1)[OFFSET(0)] AS quality_score,
      ARRAY_AGG(search_query_match_type IGNORE NULLS ORDER BY search_query_match_type LIMIT 1)[OFFSET(0)] AS search_query_match_type,
      ARRAY_AGG(search_query_status IGNORE NULLS ORDER BY search_query_status LIMIT 1)[OFFSET(0)] AS search_query_status,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      ROUND(SUM(spend), 2) AS spend,
      SUM(matched_click_visits) AS matched_click_visits,
      ROUND(SUM(estimated_add_to_carts), 2) AS estimated_add_to_carts,
      ROUND(SUM(estimated_net_purchases), 2) AS estimated_net_purchases,
      ROUND(SUM(estimated_net_purchases) * ${PURCHASE_VALUE_USD}, 2) AS estimated_purchase_revenue,
      ROUND(SUM(estimated_net_purchases) * ${PURCHASE_VALUE_USD} - SUM(spend), 2) AS estimated_purchase_profit,
      ROUND(
        SAFE_DIVIDE(SUM(estimated_net_purchases) * ${PURCHASE_VALUE_USD} - SUM(spend), NULLIF(SUM(spend), 0)) * 100,
        2
      ) AS estimated_purchase_roi_pct,
      ROUND(
        SAFE_DIVIDE(SUM(matched_click_visits), NULLIF(SUM(clicks), 0)) * 100,
        2
      ) AS click_to_visit_match_pct,
      'estimated_from_search_term_click_share' AS attribution_confidence
    FROM search_query_rollup
    GROUP BY platform_id, search_query
    ORDER BY estimated_purchase_profit DESC, spend DESC, clicks DESC
    LIMIT ${limit}
  `;

  return runBigQuery(sql, filters.params);
}

export async function getGoogleTransferInventory() {
  const sql = `
    SELECT 'ads_ClickStats' AS table_name, COUNT(*) AS row_count, MIN(segments_date) AS min_date, MAX(segments_date) AS max_date
    FROM ${googleAdsTable("ads_ClickStats")}
    UNION ALL
    SELECT 'ads_KeywordStats', COUNT(*), MIN(segments_date), MAX(segments_date)
    FROM ${googleAdsTable("ads_KeywordStats")}
    UNION ALL
    SELECT 'ads_SearchQueryStats', COUNT(*), MIN(segments_date), MAX(segments_date)
    FROM ${googleAdsTable("ads_SearchQueryStats")}
    UNION ALL
    SELECT 'ads_Ad', COUNT(*), MIN(_DATA_DATE), MAX(_DATA_DATE)
    FROM ${googleAdsTable("ads_Ad")}
  `;

  return runBigQuery(sql);
}
