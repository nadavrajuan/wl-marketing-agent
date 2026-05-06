# Keyword Deep-Dive — Methodology Guide
**Purpose:** Step-by-step breakdown of how the "weight reduction shots" analysis was run manually. Use this to train/guide the research agent to replicate and improve this investigation.

---

## What this analysis is trying to answer

For any given keyword that our ads target, we want to know:
1. What is the user's real intent?
2. What do competitors show them at every step?
3. What do WE show them at every step?
4. Where is the user journey broken?
5. What's the highest-leverage fix?

---

## Step-by-Step Process (in order of execution)

### Step 1: SERP reconnaissance — understand the playing field
**Tool:** WebSearch  
**Query:** `[keyword]` (plain, no modifiers)  
**What to extract:**
- Who appears (brand pages, editorial, comparison sites, our pages)
- What page types dominate (reviews? brand pages? clinical content?)
- Whether our pages appear and for which URLs specifically

**Query variation:** `[keyword] site:[our domain] OR site:[competitor 1] OR site:[competitor 2]`  
This surfaces which URLs from known domains rank.

**Critical finding from this step:**  
Which of our pages appears in the SERP — because that's the LP the user actually lands on, regardless of what the ad serves.

---

### Step 2: Keyword intent classification
**Tool:** Analysis (no external call needed)  
**Based on:** SERP composition  
**Classify:**
- Informational (what is X?) → user needs education
- Commercial (best X for Y?) → user is comparing providers
- Transactional (buy X, sign up for X) → user wants to convert now

"Weight reduction shots" = **Commercial / mid-funnel**. User knows they want injections, is comparing which provider to use.

**Why it matters:** Commercial intent means the LP needs a comparison table and strong trust signals, NOT a blog article explaining what GLP-1s are.

---

### Step 3: Identify the ad destination (landing page)
**Tool:** BigQuery  
**Query:**
```sql
SELECT
  k.ad_group_criterion_keyword_text,
  k.ad_group_criterion_keyword_match_type,
  ag.ad_group_name,
  c.campaign_name,
  SUM(ks.metrics_clicks) AS clicks,
  SUM(ks.metrics_cost_micros)/1e6 AS spend_usd,
  ROUND(AVG(ks.metrics_ctr)*100, 2) AS ctr_pct,
  SUM(ks.metrics_conversions) AS conversions
FROM weightagent.GoogleAds.ads_SearchQueryStats_4808949235 qs
JOIN weightagent.GoogleAds.ads_Keyword_4808949235 k
  ON qs.ad_group_id = k.ad_group_id
JOIN weightagent.GoogleAds.ads_AdGroup_4808949235 ag
  ON k.ad_group_id = ag.ad_group_id
  AND ag._DATA_DATE = ag._LATEST_DATE
JOIN weightagent.GoogleAds.ads_Campaign_4808949235 c
  ON qs.campaign_id = c.campaign_id
  AND c._DATA_DATE = c._LATEST_DATE
WHERE LOWER(qs.search_term_view_search_term) LIKE '%weight reduction shot%'
  AND qs.segments_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY 1, 2, 3, 4
ORDER BY clicks DESC
LIMIT 20
```
This tells you: which campaign, which ad group, how many clicks, what CTR, what conversions.

**Then get the ad copy:**
```sql
SELECT
  ad.ad_group_id,
  ad.campaign_id,
  ad.ad_group_ad_ad_responsive_search_ad_headlines,
  ad.ad_group_ad_ad_responsive_search_ad_descriptions,
  ad.ad_group_ad_ad_strength
FROM weightagent.GoogleAds.ads_Ad_4808949235 ad
WHERE ad.ad_group_id = [ad_group_id from above]
  AND ad._DATA_DATE = ad._LATEST_DATE
  AND ad.ad_group_ad_status = 'ENABLED'
```

**Also run same for Bing:**
```sql
SELECT
  bp.campaign_name,
  bp.ad_group_name,
  SUM(bp.clicks) AS clicks,
  SUM(bp.spend) AS spend_usd,
  SUM(bp.conversions) AS conversions
FROM weightagent.BingAds.ad_performance bp
WHERE bp.data_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  AND bp.ad_group_name LIKE '%weight%'  -- adjust based on campaign naming pattern
GROUP BY 1, 2
ORDER BY clicks DESC
LIMIT 20
```

**For LP-level performance (visits + CVR):**
```sql
SELECT
  v.dti,
  v.device,
  COUNT(DISTINCT v.id) AS visits,
  COUNT(DISTINCT CASE WHEN c.funnel_step='other' AND c.funnel_step_description='Quiz Start' THEN c.id END) AS quiz_starts,
  COUNT(DISTINCT CASE WHEN c.funnel_step='step_3' THEN c.id END) AS goal_events,
  ROUND(COUNT(DISTINCT CASE WHEN c.funnel_step='step_3' THEN c.id END) * 100.0 /
    NULLIF(COUNT(DISTINCT CASE WHEN c.funnel_step='other' AND c.funnel_step_description='Quiz Start' THEN c.id END), 0), 2) AS cvr_pct,
  SUM(SAFE_CAST(c.value AS FLOAT64)) AS revenue
FROM weightagent.WeightAgent.visits v
LEFT JOIN weightagent.WeightAgent.conversions c ON v.id = c.visit_id
WHERE v.entered_at_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  AND v.platform_id = 'google'
GROUP BY 1, 2
ORDER BY visits DESC
LIMIT 20
```
The `dti` column identifies the LP variant (e.g., "go-dt").

---

### Step 4: Crawl OUR landing page
**Tool:** WebFetch  
**URL:** The LP URL identified in Step 3  
**Extract:**
- Exact page `<title>` tag (not the H1 — the HTML title is what shows in browser and SERP)
- Meta description (if missing, note it explicitly)
- H1 (first heading the user sees)
- Presence/absence of the search keyword anywhere on the page
- Partner list: names, order, scores, prices shown
- CTAs
- Trust signals (testimonials, rating counts, date updated)
- Any language mismatch between keyword and page content

**Key question to answer:** If a user searched "[keyword]" and landed on this page, would they immediately understand they're in the right place?

---

### Step 5: Crawl competitor pages from the SERP
**Tool:** WebFetch (for each competitor URL found in Step 1)  
**For each competitor page, extract:**
- Page title and meta description
- H1 and main heading structure
- Whether they use the exact keyword phrase ("weight reduction shots")
- What language they DO use for the concept
- Partner ranking (who is #1, #2, #3)
- Lead price advertised
- Trust signals
- CTA copy

**Priority pages to crawl:**
1. The #1 organic result for the keyword (not an ad)
2. The strongest editorial comparison site (Forbes, Top10, Yahoo Health)
3. Direct competitors in the same business model (other comparison sites)
4. The brand pages for providers we rank highly (Ro, MEDVi, etc.)

---

### Step 6: Check competitor landscape (PostgreSQL)
**Tool:** PostgreSQL query  
**Tables:** `competitor_landscape_snapshots`, `competitor_landscape_sources`  
**Query:**
```sql
SELECT 
  src.name,
  snap.page_title,
  snap.meta_description,
  jsonb_array_elements(snap.extracted_json->'partners')->>'rank' AS rank,
  jsonb_array_elements(snap.extracted_json->'partners')->>'canonical_name' AS partner,
  jsonb_array_elements(snap.extracted_json->'partners')->>'score' AS score
FROM competitor_landscape_snapshots snap
JOIN competitor_landscape_sources src ON src.slug = snap.source_slug
WHERE snap.snapshot_date = (SELECT MAX(snapshot_date) FROM competitor_landscape_snapshots)
ORDER BY src.name, (jsonb_array_elements(snap.extracted_json->'partners')->>'rank')::int
LIMIT 100;
```

**What to look for:**
- Where does each of our partners (MEDVi, Ro, Eden, etc.) rank on competitor sites?
- Is our #1 (MEDVi) also the market consensus #1, or are we misaligned?
- What do competitor sites show as the lead price for each partner?
- What meta description language do competitor comparison sites use?

**Warning:** The `extracted_json` parser produces noise rows (nav items, dates, etc.) mixed in with real partner names. Filter by known canonical names: Ro, MEDVi, Medvi, Eden, Sprout, Shed, Hims, Hers, Noom, TrimRX, WeightWatchers, Remedy.

---

### Step 7: Crawl the #1 partner page
**Tool:** WebFetch  
**URL:** The actual website of the partner ranked #1 on our LP (e.g., medvi.org, ro.co)  
**Extract:**
- Their H1 and key marketing claims
- Pricing (first month AND recurring month)
- What medications they offer
- Trust signals they use (patient count, media mentions, certifications)
- Language they use for the service
- What the "Get Started" flow looks like

**Cross-reference with our table:**
- Do we accurately represent their price? (Watch for intro price vs recurring)
- Are we showing their strongest trust signals?
- Do we hide anything that might affect user expectations negatively?

---

### Step 8: Map the full user journey and find friction
After all the above, map the journey:

```
[Search query]
  → [SERP click: our ad or organic result]
    → [Landing page: title, meta, keyword match, partner order, pricing]
      → [Partner click: which partner, what we show vs what's real]
        → [Partner page: does it match what we promised?]
          → [Conversion: BigQuery funnel data]
```

For each arrow, ask: what causes a user to drop off here?

**Friction types:**
- **Relevance gap**: Page content doesn't match keyword intent
- **Trust gap**: Page looks spam/generic, no proof signals
- **Price shock**: We show a low intro price; partner shows higher recurring price
- **Intent mismatch**: We're comparing "medications" but user wants "shots/injections" specifically
- **Credibility bug**: Technical issues like "Google Desktop" in page title

---

### Step 9: Recommendations — prioritize by impact vs effort

| Priority | What | Why | Effort |
|---|---|---|---|
| P0 | Fix LP title bugs | Credibility kill, affects all campaigns | 5 min |
| P0 | Add meta descriptions | Missing on all LPs, affects CTR | 30 min |
| P1 | Switch ad destination for "shots" queries to injections LP | Intent match | 1 day |
| P1 | Add "shots" language to injections LP | Keyword relevance | 1 hour |
| P2 | Show partner recurring prices, not just intro | Trust / churn | 2 hours |
| P2 | Surface partner trust signals on our table | CVR improvement | 1 day |
| P3 | Create dedicated "weight reduction shots" page | SEO capture | 3 days |

---

## What the Agent Should Do Differently (vs. what it does now)

### Problems with current agent behavior:
1. **Too broad at start** — Agent queries all campaigns and broad keyword data instead of drilling into the specific keyword first
2. **Doesn't crawl its own LPs** — The agent queries BigQuery but rarely crawls the actual landing pages being served
3. **Doesn't cross-reference** — Agent finds BQ data but doesn't verify claims against what the partner page actually says
4. **Skips user journey mapping** — Agent finds data points but doesn't connect them into a sequential friction map
5. **Misses the "our table" angle** — Agent doesn't compare our rankings to competitor comparison site rankings

### What the agent should do for a keyword investigation:
1. Query BigQuery: get exact keyword match stats (CTR, clicks, conversions), ad group → campaign, ad copy
2. Identify LP (dti): from BQ visit data filtered by campaign/ad group
3. crawl_url: Crawl our own LP — check title, meta, keyword presence, partner list
4. crawl_url: Crawl SERP top-3 competitors for the same keyword
5. crawl_url: Crawl the #1 partner's actual page — verify our claims
6. Query PostgreSQL (via query_data): Pull competitor landscape rankings for this partner set
7. Map friction: explicit friction map from search → LP → partner → conversion
8. Record findings: Only specific numbers + specific fixes

### Prompting guidance for this investigation type:
When the starting point is a keyword:
- First query: `ads_SearchQueryStats` for that keyword — get raw CTR/conv numbers
- Second: identify the campaign and ad group from keyword entities
- Third: get the ad copy from `ads_Ad` for that ad group
- Fourth: identify the dti (LP variant) from visit data filtered to that campaign
- Fifth: crawl_url the LP
- Sixth: crawl_url 2-3 SERP competitors
- Seventh: crawl_url the top partner page
- Eighth: record_finding for each gap found with a specific number

---

## Data Sources Reference

| What | Where | How |
|---|---|---|
| Google keyword performance | `weightagent.GoogleAds.ads_SearchQueryStats_4808949235` | JOIN ads_Keyword, ads_AdGroup, ads_Campaign |
| Google ad copy | `weightagent.GoogleAds.ads_Ad_4808949235` | Filter by ad_group_id, _DATA_DATE = _LATEST_DATE |
| Bing campaign performance | `weightagent.BingAds.ad_performance` | Filter by campaign_name |
| LP performance / CVR | `weightagent.WeightAgent.visits` + `conversions` | JOIN on visit_id, group by dti |
| Competitor rankings | PostgreSQL `competitor_landscape_snapshots` | JOIN competitor_landscape_sources, parse extracted_json |
| Competitor alerts | PostgreSQL `competitor_landscape_alerts` | Filter by snapshot_date |
| Live page content | crawl_url tool | Crawl LP, partner page, SERP competitors |
| SERP landscape | WebSearch | Search for keyword, look for who appears |
