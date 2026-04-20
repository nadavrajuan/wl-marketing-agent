/*
 * WL Marketing Google Ads asset sync.
 *
 * Schedule `runDailySync` once per day inside Google Ads Scripts.
 * Run `runHistoricalBackfill` repeatedly until it reaches END_DATE.
 *
 * This script keeps payloads small and date-scoped so we avoid throttling
 * and Ads Scripts execution limits.
 */

var CONFIG = {
  INGEST_URL: "https://wl.rajuan.app/agent/internal/ingest/google-ads",
  INGEST_TOKEN: "replace_me",
  PAYLOAD_VERSION: "2026-04-20",
  LOOKBACK_DAYS: 3,
  BACKFILL_START_DATE: "2025-01-01",
  BACKFILL_END_DATE: "2026-12-31",
  BACKFILL_DAYS_PER_RUN: 1,
  BACKFILL_CURSOR_KEY: "wl_google_backfill_cursor",
};

function runDailySync() {
  for (var offset = 1; offset <= CONFIG.LOOKBACK_DAYS; offset++) {
    var snapshotDate = formatDate(offsetDays(new Date(), -offset));
    ingestOneDay(snapshotDate, "daily_sync");
  }
}

function runHistoricalBackfill() {
  var props = PropertiesService.getScriptProperties();
  var cursor = props.getProperty(CONFIG.BACKFILL_CURSOR_KEY) || CONFIG.BACKFILL_START_DATE;
  var current = parseDate(cursor);
  var endDate = parseDate(CONFIG.BACKFILL_END_DATE);
  var processed = 0;

  while (current <= endDate && processed < CONFIG.BACKFILL_DAYS_PER_RUN) {
    var snapshotDate = formatDate(current);
    ingestOneDay(snapshotDate, "historical_backfill");
    current = offsetDays(current, 1);
    processed++;
  }

  if (current <= endDate) {
    props.setProperty(CONFIG.BACKFILL_CURSOR_KEY, formatDate(current));
  } else {
    props.deleteProperty(CONFIG.BACKFILL_CURSOR_KEY);
  }
}

function ingestOneDay(snapshotDate, jobType) {
  var payload = {
    payload_version: CONFIG.PAYLOAD_VERSION,
    source: "google_ads_scripts",
    job_type: jobType,
    snapshot_date: snapshotDate,
    customer_id: String(AdsApp.currentAccount().getCustomerId()),
    customer_name: AdsApp.currentAccount().getName(),
    metadata: {
      account_timezone: AdsApp.currentAccount().getTimeZone(),
    },
    ads: fetchAds(snapshotDate),
    assets: fetchAssets(snapshotDate),
    asset_performance: fetchAssetPerformance(snapshotDate),
  };

  postPayload(payload);
}

function fetchAds(snapshotDate) {
  var rows = [];
  var query = [
    "SELECT",
    "  segments.date,",
    "  customer.id,",
    "  customer.descriptive_name,",
    "  campaign.id,",
    "  campaign.name,",
    "  campaign.status,",
    "  ad_group.id,",
    "  ad_group.name,",
    "  ad_group.status,",
    "  ad_group_ad.ad.id,",
    "  ad_group_ad.ad.name,",
    "  ad_group_ad.ad.type,",
    "  ad_group_ad.status,",
    "  ad_group_ad.ad.final_urls,",
    "  ad_group_ad.ad.final_mobile_urls,",
    "  ad_group_ad.ad.responsive_search_ad.headlines,",
    "  ad_group_ad.ad.responsive_search_ad.descriptions,",
    "  ad_group_ad.labels,",
    "  ad_group_ad.policy_summary.approval_status",
    "FROM ad_group_ad",
    "WHERE segments.date = '" + snapshotDate + "'",
    "  AND ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD",
  ].join(" ");

  var report = AdsApp.search(query);
  while (report.hasNext()) {
    var row = report.next();
    var ad = row.adGroupAd.ad;
    var rsa = ad.responsiveSearchAd || {};
    var headlines = rsa.headlines || [];
    var descriptions = rsa.descriptions || [];
    rows.push({
      campaign_id: stringifyValue(row.campaign.id),
      campaign_name: row.campaign.name,
      campaign_status: row.campaign.status,
      ad_group_id: stringifyValue(row.adGroup.id),
      ad_group_name: row.adGroup.name,
      ad_group_status: row.adGroup.status,
      ad_id: stringifyValue(ad.id),
      ad_name: ad.name || "",
      ad_type: ad.type,
      ad_status: row.adGroupAd.status,
      policy_summary: row.adGroupAd.policySummary.approvalStatus || "",
      final_url: firstValue(ad.finalUrls),
      mobile_final_url: firstValue(ad.finalMobileUrls),
      labels_json: JSON.stringify(row.adGroupAd.labels || []),
      headline_count: headlines.length,
      description_count: descriptions.length,
      raw_ad_json: JSON.stringify({
        headlines: headlines,
        descriptions: descriptions,
      }),
    });
  }
  return rows;
}

function fetchAssets(snapshotDate) {
  var rows = [];
  var query = [
    "SELECT",
    "  segments.date,",
    "  customer.id,",
    "  customer.descriptive_name,",
    "  campaign.id,",
    "  campaign.name,",
    "  ad_group.id,",
    "  ad_group.name,",
    "  ad_group_ad.ad.id,",
    "  asset.id,",
    "  asset.type,",
    "  asset.source,",
    "  asset.text_asset.text,",
    "  ad_group_ad_asset_view.field_type",
    "FROM ad_group_ad_asset_view",
    "WHERE segments.date = '" + snapshotDate + "'",
  ].join(" ");

  var report = AdsApp.search(query);
  while (report.hasNext()) {
    var row = report.next();
    rows.push({
      campaign_id: stringifyValue(row.campaign.id),
      campaign_name: row.campaign.name,
      ad_group_id: stringifyValue(row.adGroup.id),
      ad_group_name: row.adGroup.name,
      ad_id: stringifyValue(row.adGroupAd.ad.id),
      asset_id: stringifyValue(row.asset.id),
      asset_type: row.asset.type || "",
      asset_source: row.asset.source || "",
      field_type: row.adGroupAdAssetView.fieldType || "",
      text: row.asset.textAsset ? row.asset.textAsset.text : "",
      pinned_field: "",
      raw_asset_json: JSON.stringify(row.asset),
    });
  }
  return rows;
}

function fetchAssetPerformance(snapshotDate) {
  var rows = [];
  var query = [
    "SELECT",
    "  segments.date,",
    "  customer.id,",
    "  customer.descriptive_name,",
    "  campaign.id,",
    "  campaign.name,",
    "  ad_group.id,",
    "  ad_group.name,",
    "  ad_group_ad.ad.id,",
    "  asset.id,",
    "  asset.source,",
    "  ad_group_ad_asset_view.field_type,",
    "  ad_group_ad_asset_view.performance_label,",
    "  metrics.impressions,",
    "  metrics.clicks,",
    "  metrics.cost_micros,",
    "  metrics.conversions",
    "FROM ad_group_ad_asset_view",
    "WHERE segments.date = '" + snapshotDate + "'",
  ].join(" ");

  var report = AdsApp.search(query);
  while (report.hasNext()) {
    var row = report.next();
    rows.push({
      campaign_id: stringifyValue(row.campaign.id),
      campaign_name: row.campaign.name,
      ad_group_id: stringifyValue(row.adGroup.id),
      ad_group_name: row.adGroup.name,
      ad_id: stringifyValue(row.adGroupAd.ad.id),
      asset_id: stringifyValue(row.asset.id),
      asset_source: row.asset.source || "",
      field_type: row.adGroupAdAssetView.fieldType || "",
      performance_label: row.adGroupAdAssetView.performanceLabel || "",
      impressions: numberValue(row.metrics.impressions),
      clicks: numberValue(row.metrics.clicks),
      cost_micros: numberValue(row.metrics.costMicros),
      conversions: numberValue(row.metrics.conversions),
      raw_metrics_json: JSON.stringify(row.metrics || {}),
    });
  }
  return rows;
}

function postPayload(payload) {
  var response = UrlFetchApp.fetch(CONFIG.INGEST_URL, {
    method: "post",
    muteHttpExceptions: true,
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + CONFIG.INGEST_TOKEN,
    },
    payload: JSON.stringify(payload),
  });

  if (response.getResponseCode() >= 300) {
    throw new Error("Ingest failed: " + response.getContentText());
  }
}

function stringifyValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  return Number(value);
}

function firstValue(value) {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.length ? value[0] : "";
  }
  return String(value);
}

function formatDate(date) {
  return Utilities.formatDate(date, AdsApp.currentAccount().getTimeZone(), "yyyy-MM-dd");
}

function parseDate(value) {
  var parts = value.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function offsetDays(date, days) {
  var result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}
