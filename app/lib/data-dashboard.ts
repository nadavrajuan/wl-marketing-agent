import { runBigQuery } from "@/lib/bigquery";

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || "weightagent";
const CORE_DATASET_ID = process.env.BIGQUERY_DATASET || "WeightAgent";
const GOOGLE_ADS_DATASET_ID = process.env.GOOGLE_ADS_DATASET || "GoogleAds";
const BING_ADS_DATASET_ID = process.env.BING_ADS_DATASET || "BingAds";
const ANALYTICS_DATASET_ID = process.env.ANALYTICS_WL_DATASET || "analytics_wl";
const GOOGLE_ADS_CUSTOMER_SUFFIX = process.env.GOOGLE_ADS_CUSTOMER_SUFFIX || "4808949235";
const PURCHASE_VALUE_USD = Number(process.env.DEFAULT_PURCHASE_VALUE_USD || "390");
const ADD_TO_CART_SHARE_OF_PURCHASE = Number(process.env.ADD_TO_CART_SHARE_OF_PURCHASE || "0.25");
const ADD_TO_CART_PROXY_VALUE_USD = PURCHASE_VALUE_USD * ADD_TO_CART_SHARE_OF_PURCHASE;

function coreTable(name: string) {
  return `\`${PROJECT_ID}.${CORE_DATASET_ID}.${name}\``;
}

function googleAdsTable(name: string) {
  return `\`${PROJECT_ID}.${GOOGLE_ADS_DATASET_ID}.${name}_${GOOGLE_ADS_CUSTOMER_SUFFIX}\``;
}

function bingAdsTable(name: string) {
  return `\`${PROJECT_ID}.${BING_ADS_DATASET_ID}.${name}\``;
}

function analyticsEventsWildcard() {
  return `\`${PROJECT_ID}.${ANALYTICS_DATASET_ID}.events_*\``;
}

function buildWhere(clauses: string[]) {
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

const campaignTypeSql = (column: string) => `
  CASE
    WHEN REGEXP_CONTAINS(LOWER(COALESCE(${column}, '')), r'brand|brands') THEN 'brand'
    WHEN REGEXP_CONTAINS(LOWER(COALESCE(${column}, '')), r'generic|generics') THEN 'generic'
    WHEN REGEXP_CONTAINS(LOWER(COALESCE(${column}, '')), r'competitor|compare|comparison') THEN 'comparison'
    ELSE 'other'
  END
`;

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
    END AS device_type
  FROM ${coreTable("visits")}
),
conversions_norm AS (
  SELECT
    visit_id,
    DATE(TIMESTAMP_SECONDS(conversion_at)) AS conversion_date,
    COALESCE(brand_display_name, 'unknown') AS brand_name,
    CASE
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%reversed%' THEN 'purchase_reversal'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%purchase%' THEN 'purchase'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%add to cart%' THEN 'add_to_cart'
      WHEN LOWER(COALESCE(conversion_type_display_name, '')) LIKE '%quiz start%' THEN 'quiz_start'
      ELSE 'other'
    END AS conversion_class
  FROM ${coreTable("conversions")}
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
google_media_daily AS (
  SELECT
    segments_date AS data_date,
    'google' AS platform_id,
    CAST(s.campaign_id AS STRING) AS campaign_id,
    CASE
      WHEN LOWER(COALESCE(s.segments_device, 'unknown')) = 'desktop' THEN 'desktop'
      WHEN LOWER(COALESCE(s.segments_device, 'unknown')) = 'mobile' THEN 'mobile'
      WHEN LOWER(COALESCE(s.segments_device, 'unknown')) = 'tablet' THEN 'tablet'
      ELSE LOWER(COALESCE(s.segments_device, 'unknown'))
    END AS device_type,
    gce.campaign_name,
    ROUND(SUM(s.metrics_cost_micros) / 1000000, 2) AS spend,
    SUM(s.metrics_clicks) AS clicks
  FROM ${googleAdsTable("ads_CampaignBasicStats")} s
  LEFT JOIN google_campaign_entities gce
    ON gce.campaign_id = CAST(s.campaign_id AS STRING)
  GROUP BY data_date, platform_id, campaign_id, device_type, campaign_name
),
bing_media_daily AS (
  SELECT
    data_date,
    'bing' AS platform_id,
    CAST(campaign_id AS STRING) AS campaign_id,
    CASE
      WHEN LOWER(COALESCE(device_type, 'unknown')) = 'computer' THEN 'desktop'
      WHEN LOWER(COALESCE(device_type, 'unknown')) = 'smartphone' THEN 'mobile'
      WHEN LOWER(COALESCE(device_type, 'unknown')) = 'tablet' THEN 'tablet'
      ELSE LOWER(COALESCE(device_type, 'unknown'))
    END AS device_type,
    campaign_name,
    ROUND(SUM(spend), 2) AS spend,
    SUM(clicks) AS clicks
  FROM ${bingAdsTable("ad_performance")}
  GROUP BY data_date, platform_id, campaign_id, device_type, campaign_name
),
media_daily AS (
  SELECT * FROM google_media_daily
  UNION ALL
  SELECT * FROM bing_media_daily
),
campaign_lookup AS (
  SELECT
    platform_id,
    campaign_id,
    MAX(campaign_name) AS campaign_name,
    ${campaignTypeSql("campaign_name")} AS campaign_type
  FROM media_daily
  GROUP BY platform_id, campaign_id, campaign_type
),
visits_enriched AS (
  SELECT
    v.*,
    cl.campaign_name,
    cl.campaign_type
  FROM visits_norm v
  LEFT JOIN campaign_lookup cl
    ON cl.platform_id = v.platform_id
   AND cl.campaign_id = v.campaign_id
),
joined_enriched AS (
  SELECT
    c.visit_id,
    c.conversion_date,
    LOWER(COALESCE(c.brand_name, 'unknown')) AS brand_name,
    c.conversion_class,
    v.platform_id,
    v.entered_at_date,
    v.campaign_id,
    v.device_type,
    v.campaign_name,
    v.campaign_type
  FROM conversions_norm c
  LEFT JOIN visits_enriched v
    ON v.visit_id = c.visit_id
),
partner_outbound_events AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'sepunidb') AS visit_id,
    LOWER(COALESCE(
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'partner_name'),
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'brand_name'),
      'unknown'
    )) AS partner_name
  FROM ${analyticsEventsWildcard()}
  WHERE event_name = 'partner_outbound'
),
outbound_enriched AS (
  SELECT
    e.event_date,
    e.visit_id,
    e.partner_name,
    v.platform_id,
    v.entered_at_date,
    v.campaign_id,
    v.device_type,
    v.campaign_name,
    v.campaign_type
  FROM partner_outbound_events e
  LEFT JOIN visits_enriched v
    ON v.visit_id = e.visit_id
)
`;

function buildDashboardFilters(params: URLSearchParams, alias: string, dateField: string, includePartner = false) {
  const clauses: string[] = [];
  const queryParams: Record<string, unknown> = {};

  const channel = params.get("channel");
  if (channel) {
    clauses.push(`${alias}.platform_id = @channel`);
    queryParams.channel = channel.toLowerCase();
  }

  const campaign = params.get("campaign");
  if (campaign) {
    clauses.push(`${alias}.campaign_id = @campaign`);
    queryParams.campaign = campaign;
  }

  const campaignType = params.get("campaign_type");
  if (campaignType) {
    clauses.push(`${alias}.campaign_type = @campaign_type`);
    queryParams.campaign_type = campaignType.toLowerCase();
  }

  const device = params.get("device");
  if (device) {
    clauses.push(`${alias}.device_type = @device`);
    queryParams.device = device.toLowerCase();
  }

  const partner = params.get("partner");
  if (includePartner && partner) {
    clauses.push(`${alias}.partner_name = @partner`);
    queryParams.partner = partner.toLowerCase();
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
    where: buildWhere(clauses),
    params: queryParams,
  };
}

export async function getDataDashboard(params: URLSearchParams) {
  const mediaFilters = buildDashboardFilters(params, "m", "data_date");
  const visitsFilters = buildDashboardFilters(params, "v", "entered_at_date");
  const conversionsFilters = buildDashboardFilters(params, "j", "conversion_date");
  const outboundFilters = buildDashboardFilters(params, "o", "event_date", true);

  const metricsSql = `
    ${baseCtes},
    media_totals AS (
      SELECT
        ROUND(SUM(m.spend), 2) AS cost,
        SUM(m.clicks) AS clicks
      FROM media_daily m
      ${mediaFilters.where}
    ),
    visit_totals AS (
      SELECT COUNT(*) AS visits
      FROM visits_enriched v
      ${visitsFilters.where}
    ),
    conversion_totals AS (
      SELECT
        COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(j.conversion_class = 'quiz_start') AS quiz_starts,
        COUNTIF(j.conversion_class = 'purchase') AS gross_purchases,
        COUNTIF(j.conversion_class = 'purchase_reversal') AS purchase_reversals,
        COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS net_purchases
      FROM joined_enriched j
      ${params.get("partner")
        ? `${conversionsFilters.where ? `${conversionsFilters.where} AND` : "WHERE"} j.brand_name = @partner`
        : conversionsFilters.where}
    ),
    outbound_totals AS (
      SELECT COUNT(*) AS clickouts
      FROM outbound_enriched o
      ${outboundFilters.where}
    ),
    date_bounds AS (
      SELECT
        MIN(data_date) AS media_min_date,
        MAX(data_date) AS media_max_date
      FROM media_daily
    ),
    freshness AS (
      SELECT
        GREATEST(
          (SELECT MAX(entered_at_date) FROM visits_enriched),
          (SELECT MAX(conversion_date) FROM joined_enriched),
          (SELECT MAX(event_date) FROM outbound_enriched)
        ) AS latest_data_date
    )
    SELECT
      COALESCE(mt.cost, 0) AS cost,
      COALESCE(mt.clicks, 0) AS clicks,
      COALESCE(vt.visits, 0) AS visits,
      COALESCE(ot.clickouts, 0) AS clickouts,
      COALESCE(ct.quiz_starts, 0) AS quiz_starts,
      COALESCE(ct.add_to_carts, 0) AS add_to_carts,
      COALESCE(ct.net_purchases, 0) AS net_purchases,
      ROUND(COALESCE(ct.net_purchases, 0) * ${PURCHASE_VALUE_USD}, 2) AS payout,
      ROUND(COALESCE(ct.net_purchases, 0) * ${PURCHASE_VALUE_USD} - COALESCE(mt.cost, 0), 2) AS nmr,
      ROUND((COALESCE(ct.net_purchases, 0) * ${PURCHASE_VALUE_USD}) + (COALESCE(ct.add_to_carts, 0) * ${ADD_TO_CART_PROXY_VALUE_USD}) - COALESCE(mt.cost, 0), 2) AS projected_nmr,
      ROUND(SAFE_DIVIDE(COALESCE(ct.net_purchases, 0) * ${PURCHASE_VALUE_USD} - COALESCE(mt.cost, 0), NULLIF(COALESCE(mt.cost, 0), 0)) * 100, 1) AS roas_pct,
      ROUND(SAFE_DIVIDE(COALESCE(ot.clickouts, 0), NULLIF(COALESCE(mt.clicks, 0), 0)) * 100, 1) AS lp_ctr_pct,
      ROUND(SAFE_DIVIDE(COALESCE(ct.net_purchases, 0) * ${PURCHASE_VALUE_USD}, NULLIF(COALESCE(mt.clicks, 0), 0)), 1) AS epv,
      ROUND(SAFE_DIVIDE(COALESCE(mt.cost, 0), NULLIF(COALESCE(ot.clickouts, 0), 0)), 1) AS cpco,
      ROUND(SAFE_DIVIDE(COALESCE(mt.cost, 0), NULLIF(COALESCE(vt.visits, 0), 0)), 1) AS cpv,
      ROUND(SAFE_DIVIDE(COALESCE(mt.cost, 0), NULLIF(COALESCE(ct.add_to_carts, 0), 0)), 1) AS cpatc,
      ROUND(SAFE_DIVIDE(COALESCE(mt.cost, 0), NULLIF(COALESCE(ct.net_purchases, 0), 0)), 1) AS cpa,
      db.media_min_date,
      db.media_max_date,
      f.latest_data_date
    FROM media_totals mt
    CROSS JOIN visit_totals vt
    CROSS JOIN conversion_totals ct
    CROSS JOIN outbound_totals ot
    CROSS JOIN date_bounds db
    CROSS JOIN freshness f
  `;

  const channelBreakdownSql = `
    ${baseCtes},
    channel_media AS (
      SELECT
        m.platform_id AS channel,
        ROUND(SUM(m.spend), 2) AS cost,
        SUM(m.clicks) AS clicks
      FROM media_daily m
      ${mediaFilters.where}
      GROUP BY m.platform_id
    ),
    channel_visits AS (
      SELECT
        v.platform_id AS channel,
        COUNT(*) AS visits
      FROM visits_enriched v
      ${visitsFilters.where}
      GROUP BY v.platform_id
    ),
    channel_outbound AS (
      SELECT
        o.platform_id AS channel,
        COUNT(*) AS clickouts
      FROM outbound_enriched o
      ${outboundFilters.where}
      GROUP BY o.platform_id
    ),
    channel_conversions AS (
      SELECT
        j.platform_id AS channel,
        COUNTIF(j.conversion_class = 'add_to_cart') AS add_to_carts,
        COUNTIF(j.conversion_class = 'quiz_start') AS quiz_starts,
        COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS net_purchases
      FROM joined_enriched j
      ${params.get("partner")
        ? `${conversionsFilters.where ? `${conversionsFilters.where} AND` : "WHERE"} j.brand_name = @partner`
        : conversionsFilters.where}
      GROUP BY j.platform_id
    ),
    all_channels AS (
      SELECT channel FROM channel_media
      UNION DISTINCT
      SELECT channel FROM channel_visits
      UNION DISTINCT
      SELECT channel FROM channel_outbound
      UNION DISTINCT
      SELECT channel FROM channel_conversions
    )
    SELECT
      ac.channel,
      COALESCE(cm.cost, 0) AS cost,
      COALESCE(cm.clicks, 0) AS clicks,
      COALESCE(co.clickouts, 0) AS clickouts,
      COALESCE(cv.visits, 0) AS visits,
      COALESCE(cc.add_to_carts, 0) AS add_to_carts,
      COALESCE(cc.quiz_starts, 0) AS quiz_starts,
      COALESCE(cc.net_purchases, 0) AS net_purchases,
      ROUND(COALESCE(cc.net_purchases, 0) * ${PURCHASE_VALUE_USD}, 2) AS payout,
      ROUND((COALESCE(cc.net_purchases, 0) * ${PURCHASE_VALUE_USD}) - COALESCE(cm.cost, 0), 2) AS nmr,
      ROUND((COALESCE(cc.net_purchases, 0) * ${PURCHASE_VALUE_USD}) + (COALESCE(cc.add_to_carts, 0) * ${ADD_TO_CART_PROXY_VALUE_USD}) - COALESCE(cm.cost, 0), 2) AS projected_nmr,
      ROUND(SAFE_DIVIDE((COALESCE(cc.net_purchases, 0) * ${PURCHASE_VALUE_USD}) - COALESCE(cm.cost, 0), NULLIF(COALESCE(cm.cost, 0), 0)) * 100, 1) AS roas_pct,
      ROUND(SAFE_DIVIDE(COALESCE(co.clickouts, 0), NULLIF(COALESCE(cm.clicks, 0), 0)) * 100, 1) AS lp_ctr_pct,
      ROUND(SAFE_DIVIDE(COALESCE(cm.cost, 0), NULLIF(COALESCE(co.clickouts, 0), 0)), 1) AS cpco,
      ROUND(SAFE_DIVIDE(COALESCE(cm.cost, 0), NULLIF(COALESCE(cv.visits, 0), 0)), 1) AS cost_per_step1,
      ROUND(SAFE_DIVIDE(COALESCE(cm.cost, 0), NULLIF(COALESCE(cc.add_to_carts, 0), 0)), 1) AS cost_per_step2,
      ROUND(SAFE_DIVIDE(COALESCE(cm.cost, 0), NULLIF(COALESCE(cc.net_purchases, 0), 0)), 1) AS cost_per_step3
    FROM all_channels ac
    LEFT JOIN channel_media cm ON cm.channel = ac.channel
    LEFT JOIN channel_visits cv ON cv.channel = ac.channel
    LEFT JOIN channel_outbound co ON co.channel = ac.channel
    LEFT JOIN channel_conversions cc ON cc.channel = ac.channel
    WHERE ac.channel IS NOT NULL
    ORDER BY CASE ac.channel WHEN 'bing' THEN 1 WHEN 'google' THEN 2 ELSE 99 END, ac.channel
  `;

  const partnerBreakdownSql = `
    ${baseCtes},
    overall_media AS (
      SELECT
        COALESCE(SUM(m.clicks), 0) AS total_clicks
      FROM media_daily m
      ${mediaFilters.where}
    ),
    partner_click_stats AS (
      SELECT
        o.partner_name,
        COUNT(*) AS clickouts
      FROM outbound_enriched o
      ${outboundFilters.where}
      GROUP BY o.partner_name
    ),
    partner_visit_map AS (
      SELECT DISTINCT
        o.partner_name,
        o.visit_id
      FROM outbound_enriched o
      ${outboundFilters.where}
    ),
    partner_conversion_stats AS (
      SELECT
        p.partner_name,
        COUNTIF(j.conversion_class = 'add_to_cart') AS step1,
        COUNTIF(j.conversion_class = 'purchase') - COUNTIF(j.conversion_class = 'purchase_reversal') AS step2
      FROM partner_visit_map p
      LEFT JOIN joined_enriched j
        ON j.visit_id = p.visit_id
       AND j.brand_name = p.partner_name
      ${conversionsFilters.where ? conversionsFilters.where.replaceAll("j.", "j.") : ""}
      GROUP BY p.partner_name
    ),
    clickout_totals AS (
      SELECT COALESCE(SUM(clickouts), 0) AS total_clickouts
      FROM partner_click_stats
    )
    SELECT
      pcs.partner_name,
      pcs.clickouts,
      COALESCE(pcs2.step1, 0) AS step1,
      COALESCE(pcs2.step2, 0) AS step2,
      ROUND(COALESCE(pcs2.step2, 0) * ${PURCHASE_VALUE_USD}, 2) AS payout,
      ROUND(SAFE_DIVIDE(COALESCE(pcs2.step2, 0) * ${PURCHASE_VALUE_USD}, NULLIF(pcs.clickouts, 0)), 1) AS epc,
      ROUND(SAFE_DIVIDE(COALESCE(pcs2.step2, 0) * ${PURCHASE_VALUE_USD}, NULLIF(om.total_clicks, 0)), 1) AS epv,
      ROUND(SAFE_DIVIDE(pcs.clickouts, NULLIF(ct.total_clickouts, 0)) * 100, 1) AS clickshare_pct
    FROM partner_click_stats pcs
    LEFT JOIN partner_conversion_stats pcs2
      ON pcs2.partner_name = pcs.partner_name
    CROSS JOIN overall_media om
    CROSS JOIN clickout_totals ct
    WHERE pcs.partner_name IS NOT NULL
    ORDER BY payout DESC, clickouts DESC
    LIMIT 25
  `;

  const optionsSql = `
    ${baseCtes}
    SELECT
      ARRAY(
        SELECT DISTINCT AS STRUCT platform_id AS value, INITCAP(platform_id) AS label
        FROM media_daily
        ORDER BY label
      ) AS channels,
      ARRAY(
        SELECT DISTINCT AS STRUCT campaign_id AS value, campaign_name AS label
        FROM campaign_lookup
        WHERE campaign_name IS NOT NULL
        ORDER BY label
        LIMIT 200
      ) AS campaigns,
      ARRAY(
        SELECT DISTINCT AS STRUCT campaign_type AS value, INITCAP(campaign_type) AS label
        FROM campaign_lookup
        ORDER BY label
      ) AS campaign_types,
      ARRAY(
        SELECT DISTINCT AS STRUCT device_type AS value, INITCAP(device_type) AS label
        FROM media_daily
        ORDER BY label
      ) AS devices,
      ARRAY(
        SELECT DISTINCT AS STRUCT partner_name AS value, partner_name AS label
        FROM outbound_enriched
        WHERE partner_name IS NOT NULL
        ORDER BY label
        LIMIT 50
      ) AS partners,
      (SELECT MIN(data_date) FROM media_daily) AS media_min_date,
      (SELECT MAX(data_date) FROM media_daily) AS media_max_date
  `;

  const [metricsRows, optionsRows, channelRows, partnerRows] = await Promise.all([
    runBigQuery<Record<string, unknown>>(metricsSql, {
      ...mediaFilters.params,
      ...visitsFilters.params,
      ...conversionsFilters.params,
      ...outboundFilters.params,
    }),
    runBigQuery<Record<string, unknown>>(optionsSql),
    runBigQuery<Record<string, unknown>>(channelBreakdownSql, {
      ...mediaFilters.params,
      ...visitsFilters.params,
      ...conversionsFilters.params,
      ...outboundFilters.params,
    }),
    runBigQuery<Record<string, unknown>>(partnerBreakdownSql, {
      ...mediaFilters.params,
      ...visitsFilters.params,
      ...conversionsFilters.params,
      ...outboundFilters.params,
    }),
  ]);

  const metrics = metricsRows[0] || {};
  const options = optionsRows[0] || {};
  const mediaMinDate = String(metrics.media_min_date || options.media_min_date || "");
  const latestDataDate = String(metrics.latest_data_date || metrics.media_max_date || "");
  const breakdownRows = channelRows.map((row) => ({
    channel: String(row.channel || "unknown"),
    cost: Number(row.cost || 0),
    payout: Number(row.payout || 0),
    nmr: Number(row.nmr || 0),
    projected_nmr: Number(row.projected_nmr || 0),
    roas_pct: row.roas_pct == null ? null : Number(row.roas_pct),
    clicks: Number(row.clicks || 0),
    clickouts: Number(row.clickouts || 0),
    cpco: row.cpco == null ? null : Number(row.cpco),
    lp_ctr_pct: row.lp_ctr_pct == null ? null : Number(row.lp_ctr_pct),
    step1: Number(row.visits || 0),
    cost_per_step1: row.cost_per_step1 == null ? null : Number(row.cost_per_step1),
    step2: Number(row.add_to_carts || 0),
    cost_per_step2: row.cost_per_step2 == null ? null : Number(row.cost_per_step2),
    step3: Number(row.net_purchases || 0),
    cost_per_step3: row.cost_per_step3 == null ? null : Number(row.cost_per_step3),
  }));
  const totalBreakdown = {
    channel: "total",
    cost: Number(metrics.cost || 0),
    payout: Number(metrics.payout || 0),
    nmr: Number(metrics.nmr || 0),
    projected_nmr: Number(metrics.projected_nmr || 0),
    roas_pct: metrics.roas_pct == null ? null : Number(metrics.roas_pct),
    clicks: Number(metrics.clicks || 0),
    clickouts: Number(metrics.clickouts || 0),
    cpco: metrics.cpco == null ? null : Number(metrics.cpco),
    lp_ctr_pct: metrics.lp_ctr_pct == null ? null : Number(metrics.lp_ctr_pct),
    step1: Number(metrics.visits || 0),
    cost_per_step1: metrics.cpv == null ? null : Number(metrics.cpv),
    step2: Number(metrics.add_to_carts || 0),
    cost_per_step2: metrics.cpatc == null ? null : Number(metrics.cpatc),
    step3: Number(metrics.net_purchases || 0),
    cost_per_step3: metrics.cpa == null ? null : Number(metrics.cpa),
  };
  const partnerBreakdownRows = partnerRows.map((row) => ({
    partner: String(row.partner_name || "unknown"),
    payout: Number(row.payout || 0),
    epc: row.epc == null ? null : Number(row.epc),
    epv: row.epv == null ? null : Number(row.epv),
    clickouts: Number(row.clickouts || 0),
    clickshare_pct: row.clickshare_pct == null ? null : Number(row.clickshare_pct),
    step1: Number(row.step1 || 0),
    step2: Number(row.step2 || 0),
  }));
  const partnerTotal = {
    partner: "total",
    payout: Number(
      partnerBreakdownRows.reduce((sum, row) => sum + row.payout, 0),
    ),
    epc:
      partnerBreakdownRows.reduce((sum, row) => sum + row.clickouts, 0) > 0
        ? Number(
            (
              partnerBreakdownRows.reduce((sum, row) => sum + row.payout, 0) /
              partnerBreakdownRows.reduce((sum, row) => sum + row.clickouts, 0)
            ).toFixed(1),
          )
        : null,
    epv:
      Number(metrics.clicks || 0) > 0
        ? Number(
            (
              partnerBreakdownRows.reduce((sum, row) => sum + row.payout, 0) /
              Number(metrics.clicks || 0)
            ).toFixed(1),
          )
        : null,
    clickouts: partnerBreakdownRows.reduce((sum, row) => sum + row.clickouts, 0),
    clickshare_pct: partnerBreakdownRows.length ? 100 : null,
    step1: partnerBreakdownRows.reduce((sum, row) => sum + row.step1, 0),
    step2: partnerBreakdownRows.reduce((sum, row) => sum + row.step2, 0),
  };

  return {
    filters: {
      account: "Top 5 Weight Choices",
      defaults: {
        date_from: params.get("date_from") || mediaMinDate,
        date_to: params.get("date_to") || latestDataDate,
      },
      channel_options: Array.isArray(options.channels) ? options.channels : [],
      campaign_options: Array.isArray(options.campaigns) ? options.campaigns : [],
      campaign_type_options: Array.isArray(options.campaign_types) ? options.campaign_types : [],
      device_options: Array.isArray(options.devices) ? options.devices : [],
      partner_options: Array.isArray(options.partners) ? options.partners : [],
    },
    latest_data_date: latestDataDate,
    metrics: {
      cost: Number(metrics.cost || 0),
      payout: Number(metrics.payout || 0),
      nmr: Number(metrics.nmr || 0),
      projected_nmr: Number(metrics.projected_nmr || 0),
      roas_pct: metrics.roas_pct == null ? null : Number(metrics.roas_pct),
      lp_ctr_pct: metrics.lp_ctr_pct == null ? null : Number(metrics.lp_ctr_pct),
      clicks: Number(metrics.clicks || 0),
      epv: metrics.epv == null ? null : Number(metrics.epv),
      clickouts: Number(metrics.clickouts || 0),
      cpco: metrics.cpco == null ? null : Number(metrics.cpco),
      visits: Number(metrics.visits || 0),
      cpv: metrics.cpv == null ? null : Number(metrics.cpv),
      add_to_carts: Number(metrics.add_to_carts || 0),
      cpatc: metrics.cpatc == null ? null : Number(metrics.cpatc),
      net_purchases: Number(metrics.net_purchases || 0),
      cpa: metrics.cpa == null ? null : Number(metrics.cpa),
      quiz_starts: Number(metrics.quiz_starts || 0),
    },
    channel_breakdown: [totalBreakdown, ...breakdownRows],
    partner_breakdown: [partnerTotal, ...partnerBreakdownRows],
  };
}
