# BigQuery Schema Reference

**Project:** `weightagent`  
**Authoritative source of truth** — keep this in sync whenever a schema change is discovered.  
Claude should always read this file at the start of any BigQuery work.

---

## Critical type rules (read first)

| Column | Type | How to use |
|--------|------|-----------|
| `conversions.conversion_at` | INT64 unix **seconds** | `TIMESTAMP_SECONDS(conversion_at)` |
| `visits.entered_at` | INT64 unix **seconds** | `TIMESTAMP_SECONDS(entered_at)` |
| `conversions.value` | STRING | `SAFE_CAST(value AS FLOAT64)` |
| `conversions.affiliate_value` | STRING | `SAFE_CAST(affiliate_value AS FLOAT64)` |
| `conversions.projected_value` | STRING | `SAFE_CAST(projected_value AS FLOAT64)` |
| `visits.campaign_id` | STRING | Raw numeric UTM param — NOT a campaign name |
| GoogleAds `campaign_id` | INTEGER | Join with `ads_Campaign_*` to resolve to name |
| GoogleAds `ad_group_id` | INTEGER | Different type from Bing ad_group_id (STRING) |
| BingAds `campaign_id` | STRING | Compare directly to campaign_name-derived ids |

**Bing and Google are separate ad systems** — never query Google tables for Bing campaign names or vice versa.

---

## Dataset: WeightAgent

### `weightagent.WeightAgent.visits` (~105k rows, session-level)

| Column | Type | Notes |
|--------|------|-------|
| id | STRING | Primary key → joins to conversions.visit_id |
| platform_id | STRING | 'bing' \| 'google' \| 'organic' |
| entered_at | INT64 | Unix seconds — `TIMESTAMP_SECONDS(entered_at)` |
| entered_at_date | DATE | Precomputed date column — use this for date filters |
| campaign_id | STRING | Raw numeric UTM campaign ID, not a name |
| adgroup_id | STRING | Raw numeric UTM ad group ID |
| creative | STRING | Ad ID |
| msclkid | STRING | Bing click ID |
| gclid | STRING | Google click ID |
| device | STRING | c=desktop, m=mobile, t=tablet |
| match_type | STRING | e=exact, p=phrase, b=broad |
| network | STRING | |
| dti | STRING | Landing page variant (r4, j4, c9, i2, t3, u8, c6, a5, q7, q8…) — also extractable from `landing_page` URL param |
| dbi | STRING | Landing page variant (secondary) |
| landing_page | STRING | Full URL with all UTM params |
| user_country | STRING | |
| loc_physical_ms | STRING | |
| is_qa | STRING | |

### `weightagent.WeightAgent.conversions` (~15k rows, funnel events)

| Column | Type | Notes |
|--------|------|-------|
| id | STRING | |
| visit_id | STRING | FK → visits.id |
| conversion_at | INT64 | Unix **seconds** — `TIMESTAMP_SECONDS(conversion_at)` |
| value | STRING | Revenue USD → `SAFE_CAST(value AS FLOAT64)` |
| affiliate_value | STRING | → `SAFE_CAST(affiliate_value AS FLOAT64)` |
| projected_value | STRING | → `SAFE_CAST(projected_value AS FLOAT64)` |
| conversion_type_display_name | STRING | Human label (e.g. 'Purchase', 'Add to Cart', 'Quiz Start', 'Reversed Purchase') |
| funnel_step | STRING | 'other' \| 'step_1' \| 'step_2' \| 'step_3' |
| funnel_step_description | STRING | 'Quiz Start' \| 'Lead' \| NULL |
| brand_display_name | STRING | 'Medvi' \| 'Ro' \| 'SkinnyRX' \| 'Sprout' \| 'Eden' \| 'Hers' \| 'Remedy' |
| is_partner | BOOL | |
| is_first | BOOL | |
| partner_profile | STRING | |
| ga_id | STRING | |

**Funnel step meaning:**
- Quiz Start = `funnel_step='other' AND funnel_step_description='Quiz Start'`
- Goal event = `funnel_step='step_3'`

**Standard joins+funnel query:**
```sql
SELECT v.dti, v.device,
  COUNT(DISTINCT v.id) AS visits,
  COUNT(DISTINCT CASE WHEN c.funnel_step='other' AND c.funnel_step_description='Quiz Start' THEN c.id END) AS quiz_starts,
  COUNT(DISTINCT CASE WHEN c.funnel_step='step_3' THEN c.id END) AS goal_events,
  SUM(SAFE_CAST(c.value AS FLOAT64)) AS revenue
FROM weightagent.WeightAgent.visits v
LEFT JOIN weightagent.WeightAgent.conversions c ON v.id = c.visit_id
WHERE v.entered_at_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY 1, 2 ORDER BY visits DESC LIMIT 20
```

---

## Dataset: BingAds

All IDs in BingAds are **STRING**.

### `weightagent.BingAds.ad_performance` (daily stats, ad-group level)

| Column | Type |
|--------|------|
| data_date | DATE |
| account_id | STRING |
| account_name | STRING |
| campaign_id | STRING |
| campaign_name | STRING |
| campaign_type | STRING |
| ad_group_id | STRING |
| ad_group_name | STRING |
| ad_id | STRING |
| ad_name | STRING |
| device_type | STRING |
| final_url | STRING |
| impressions | INT64 |
| clicks | INT64 |
| spend | FLOAT64 (USD) |
| conversions | FLOAT64 |

**Note:** Stats are at ad-group level. Multiple keywords share one ad group — never join keyword-level entities to derive per-keyword spend directly.

### `weightagent.BingAds.keywords` (keyword entities — no daily stats)

| Column | Type | Notes |
|--------|------|-------|
| keyword_id | STRING | |
| ad_group_id | STRING | |
| campaign_id | STRING | |
| keyword_text | STRING | |
| match_type | STRING | MatchType.EXACT \| MatchType.PHRASE \| MatchType.BROAD |
| cpc_bid | FLOAT64 | |
| status | STRING | **KeywordStatus.ACTIVE** \| KeywordStatus.PAUSED (NOT 'Active') |

### `weightagent.BingAds.campaigns`

| campaign_id | STRING |
|-------------|--------|
| campaign_name | STRING |
| status | STRING |
| budget_amount | FLOAT64 |
| bid_strategy_type | STRING |

### `weightagent.BingAds.ad_groups`

| ad_group_id | STRING |
|-------------|--------|
| campaign_id | STRING |
| ad_group_name | STRING |
| status | STRING |

**Filter Bing campaign by name:**
```sql
SELECT bp.ad_group_name, SUM(bp.clicks) AS clicks, SUM(bp.spend) AS spend, SUM(bp.conversions) AS convs
FROM weightagent.BingAds.ad_performance bp
WHERE bp.data_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  AND bp.campaign_name = 'Search-generics-[tirzepatide]-en-dt-us-MMA'
GROUP BY 1 ORDER BY spend DESC LIMIT 20
```

**Get keywords for a Bing campaign:**
```sql
SELECT k.keyword_text, k.match_type, k.cpc_bid
FROM weightagent.BingAds.keywords k
WHERE k.campaign_id = (
  SELECT campaign_id FROM weightagent.BingAds.campaigns
  WHERE campaign_name = 'Search-generics-[tirzepatide]-en-dt-us-MMA' LIMIT 1
) AND k.status = 'KeywordStatus.ACTIVE'
LIMIT 50
```

---

## Dataset: GoogleAds

All ID columns (`campaign_id`, `ad_group_id`, `ad_group_criterion_criterion_id`, `ad_group_ad_ad_id`) are **INTEGER**.  
To filter by name, join the entity table first. To join with visits (STRING), cast: `CAST(campaign_id AS STRING)`.

Customer suffix: `4808949235`

### `weightagent.GoogleAds.ads_Campaign_4808949235` (campaign entities)

| Column | Type |
|--------|------|
| campaign_id | INTEGER |
| customer_id | INTEGER |
| campaign_name | STRING |
| campaign_status | STRING |
| campaign_bidding_strategy_type | STRING |
| campaign_start_date | DATE |
| campaign_end_date | DATE |
| _DATA_DATE | DATE |
| _LATEST_DATE | DATE |

Use `WHERE _DATA_DATE = _LATEST_DATE` on this entity table.

### `weightagent.GoogleAds.ads_AdGroup_4808949235` (ad group entities)

| Column | Type |
|--------|------|
| ad_group_id | INTEGER |
| campaign_id | INTEGER |
| ad_group_name | STRING |
| ad_group_status | STRING |
| _DATA_DATE | DATE |
| _LATEST_DATE | DATE |

### `weightagent.GoogleAds.ads_Keyword_4808949235` (keyword entities)

| Column | Type |
|--------|------|
| ad_group_criterion_criterion_id | INTEGER |
| ad_group_id | INTEGER |
| campaign_id | INTEGER |
| ad_group_criterion_keyword_text | STRING |
| ad_group_criterion_keyword_match_type | STRING | EXACT \| PHRASE \| BROAD |
| ad_group_criterion_quality_info_quality_score | INTEGER |
| ad_group_criterion_status | STRING |
| _DATA_DATE | DATE |
| _LATEST_DATE | DATE |

### `weightagent.GoogleAds.ads_KeywordStats_4808949235` (daily keyword stats)

| Column | Type |
|--------|------|
| segments_date | DATE |
| _DATA_DATE | DATE |
| _LATEST_DATE | DATE |
| ad_group_criterion_criterion_id | INTEGER |
| ad_group_id | INTEGER |
| campaign_id | INTEGER |
| segments_device | STRING | DESKTOP \| MOBILE \| TABLET |
| metrics_clicks | INTEGER |
| metrics_impressions | INTEGER |
| metrics_cost_micros | INTEGER | ÷1e6 = USD |
| metrics_conversions | FLOAT64 |
| metrics_conversions_value | FLOAT64 |

**⚠️ Do NOT filter `_DATA_DATE = _LATEST_DATE` on this table** — `segments_date` is always < `_LATEST_DATE` by design. Filter by `segments_date >= DATE_SUB(...)` instead.

### `weightagent.GoogleAds.ads_AdBasicStats_4808949235` (daily per-ad stats)

Primary table for ad-level spend analysis (used by the dashboard).

| Column | Type |
|--------|------|
| segments_date | DATE |
| ad_group_id | INTEGER |
| campaign_id | INTEGER |
| ad_group_ad_ad_id | INTEGER |
| segments_device | STRING |
| metrics_impressions | INTEGER |
| metrics_clicks | INTEGER |
| metrics_cost_micros | INTEGER | ÷1e6 = USD |
| metrics_conversions | FLOAT64 |

### `weightagent.GoogleAds.ads_SearchQueryStats_4808949235` (actual search terms)

| Column | Type |
|--------|------|
| segments_date | DATE |
| search_term_view_search_term | STRING |
| segments_search_term_match_type | STRING |
| ad_group_id | INTEGER |
| campaign_id | INTEGER |
| metrics_clicks | INTEGER |
| metrics_impressions | INTEGER |
| metrics_cost_micros | INTEGER | ÷1e6 = USD |
| metrics_conversions | FLOAT64 |
| metrics_ctr | FLOAT64 |

⚠️ Same as KeywordStats — do NOT filter `_DATA_DATE = _LATEST_DATE`. Use `segments_date`.

### `weightagent.GoogleAds.ads_Ad_4808949235` (RSA ad entities)

⚠️ Column names use Google's long prefix — use these exact names:

| Column | Type |
|--------|------|
| ad_group_ad_ad_id | INTEGER |
| ad_group_id | INTEGER |
| campaign_id | INTEGER |
| ad_group_ad_status | STRING | ENABLED \| PAUSED \| REMOVED |
| ad_group_ad_ad_type | STRING | RESPONSIVE_SEARCH_AD \| EXPANDED_TEXT_AD |
| ad_group_ad_ad_strength | STRING | EXCELLENT \| GOOD \| AVERAGE \| POOR |
| ad_group_ad_ad_responsive_search_ad_headlines | STRING | Serialised JSON array |
| ad_group_ad_ad_responsive_search_ad_descriptions | STRING | Serialised JSON array |
| ad_group_ad_ad_responsive_search_ad_path1 | STRING |
| ad_group_ad_ad_responsive_search_ad_path2 | STRING |
| ad_group_ad_ad_final_urls | STRING |
| _DATA_DATE | DATE |
| _LATEST_DATE | DATE |

Use `WHERE _DATA_DATE = _LATEST_DATE` on this entity table.

**Google keyword+spend filtered by campaign name:**
```sql
SELECT k.ad_group_criterion_keyword_text,
  SUM(ks.metrics_clicks) AS clicks,
  SUM(ks.metrics_cost_micros)/1e6 AS spend_usd,
  SUM(ks.metrics_conversions) AS convs
FROM weightagent.GoogleAds.ads_KeywordStats_4808949235 ks
JOIN weightagent.GoogleAds.ads_Keyword_4808949235 k
  ON ks.ad_group_criterion_criterion_id = k.ad_group_criterion_criterion_id
  AND ks.ad_group_id = k.ad_group_id
JOIN weightagent.GoogleAds.ads_Campaign_4808949235 c
  ON ks.campaign_id = c.campaign_id AND c._DATA_DATE = c._LATEST_DATE
WHERE ks.segments_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  AND c.campaign_name = 'Brands-US-en-Desktop'
GROUP BY 1 ORDER BY spend_usd DESC LIMIT 20
```

---

## General rules

- Always use full table paths: `weightagent.DatasetName.table_name`
- No INSERT/UPDATE/DELETE/MERGE/DROP — read-only
- LIMIT 50 on exploratory queries
- `metrics_cost_micros ÷ 1e6 = USD`
- `visits.campaign_id` contains raw numeric UTM IDs (STRING) — join with Bing/Google entity tables to resolve names
- Bing campaign names follow pattern: `Search-[keyword-type]-en-[device]-us[-suffix]`
- Google campaign names follow pattern: `Brands-US-en-Desktop`, `GLP-1 medications-US-en-desktop`, etc.

---

## What the Next.js dashboard uses

`app/lib/weight-agent.ts` builds a large CTE (`baseCtes`) that normalises these tables:
- `visits_norm` — normalises device, extracts dti/keyword from URL params
- `conversions_norm` — normalises conversion_type, computes modeled_value_usd
- `joined` — LEFT JOIN conversions → visits
- `google_campaign_entities` — `ads_Campaign_4808949235` (latest date)
- `google_adgroup_entities` — `ads_AdGroup_4808949235` (latest date)
- `google_ad_entities` — `ads_Ad_4808949235` (latest date)
- `media_daily` — UNION of `ads_AdBasicStats_4808949235` (Google) + `BingAds.ad_performance` (Bing)

All dashboard queries build on top of these CTEs. The research agent queries BigQuery directly without these CTEs.
