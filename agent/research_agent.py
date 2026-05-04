"""
WL Research Agent — LangGraph ReAct tool-calling agent.

Phases:
  1. Select starting point  (plain function)
  2. Build research plan    (plain function)
  3. ReAct loop             (LangGraph: agent ⇄ tools via conditional edge)
  4. Generate slides        (plain function)
  5. Append notes           (plain function)
"""
import json
import os
import random
import re
import urllib.request
import html.parser
from datetime import datetime
from typing import Annotated, Any

from langchain_core.messages import (
    BaseMessage, HumanMessage, SystemMessage, ToolMessage,
)
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from db_client import run_query as pg_query
from llm_factory import create_llm

try:
    import bigquery_client as bq
    _BQ_AVAILABLE = True
except Exception:
    _BQ_AVAILABLE = False


# ─── Depth → iteration budget ─────────────────────────────────────────────────

DEPTH_ITERATIONS = {
    "quick":    6,
    "standard": 14,
    "deep":     22,
    "extreme":  35,
}


# ─── Domain + schema context ──────────────────────────────────────────────────

DOMAIN_CONTEXT = """You are a senior performance marketing researcher for top5weightchoices.com —
a comparison site for GLP-1 / weight loss medication programs.

BUSINESS: Traffic comes from Bing Ads + Google Ads. The funnel is:
  Keyword → Ad copy → Landing page (dti variant) → Partner comparison table → Partner brand page → Goal event

PARTNERS (brand_display_name in data): Medvi (largest), Ro, SkinnyRX, Sprout, Eden, Hers, Remedy
TOP KEYWORDS: tirzepatide, semaglutide for weight loss, zepbound, wegovy, compounded tirzepatide, GLP-1 pills
KEY METRICS:
  Quiz Start = funnel_step='other' AND funnel_step_description='Quiz Start' (top-of-funnel)
  Goal event = funnel_step='step_3' (bottom-of-funnel, closest to purchase)
  CVR = goal_events / quiz_starts
  EPV = revenue / visits,  EPC = revenue / clicks,  LPCTR = landing page click-through rate

IMPORTANT PRINCIPLES:
- EPC alone is misleading — always consider EPV, click share, volume, and table position together
- RSA ads are already testing systems — prefer soft optimization (replace weak lines, keep strong ones)
- Never copy competitors blindly — describe what was observed and what it may suggest
- Distinguish: evidence | hypothesis | recommendation | open_question
- ALL analytics data is in BigQuery. The PostgreSQL database holds only app config — do NOT query it for marketing analytics.
"""

# PostgreSQL holds app config only — no marketing analytics data there.
PG_SCHEMA = """
── PostgreSQL ────────────────────────────────────────────────────────────────────
NOTE: The PostgreSQL database contains only application configuration (prompts, settings).
      It has NO marketing analytics data. Do NOT use query_postgres for any analytics.
      Use query_bigquery for all funnel, keyword, spend, and conversion analysis.
"""

BQ_SCHEMA = """
── BigQuery (ALL marketing analytics data lives here) ────────────────────────────
Project: weightagent

CRITICAL TYPE RULES (read before writing any query):
- GoogleAds: campaign_id, ad_group_id, ad_group_criterion_criterion_id are all INTEGER
  → NEVER compare them to a string campaign name; use ads_Campaign_4808949235 to map name→id
- Bing campaigns are named like "Search-generics-[tirzepatide]-en-dt-us-MMA" — look them up in
  BingAds.ad_performance or BingAds.campaigns by campaign_name (STRING)
- Bing vs Google are SEPARATE ad systems; do NOT try to find Bing campaign names in Google tables
- WeightAgent.visits.campaign_id is STRING containing raw numeric IDs (UTM param), NOT names

DATASET WeightAgent ─────────────────────────────────────────────────────────────

TABLE weightagent.WeightAgent.visits  (~105k rows, session-level)
  id (STRING, PK → conversions.visit_id),
  platform_id (STRING: 'bing' | 'google' | 'organic'),
  entered_at_date (DATE), entered_at (INT64 unix SECONDS — use TIMESTAMP_SECONDS()),
  campaign_id (STRING, raw numeric UTM campaign ID — NOT a campaign name),
  adgroup_id (STRING, raw numeric UTM ad group ID),
  creative (STRING, ad id), msclkid (STRING, Bing click id), gclid (STRING, Google click id),
  device (STRING: c=desktop, m=mobile, t=tablet),
  match_type (STRING: e=exact, p=phrase, b=broad), network (STRING),
  dti (STRING, landing page variant: r4, j4, c9, i2, t3, u8, c6, a5, q7, q8 …),
  landing_page (STRING, full URL with all UTM params), user_country (STRING)

TABLE weightagent.WeightAgent.conversions  (~15k rows, funnel events)
  id (STRING), visit_id (STRING → joins to visits.id),
  conversion_at (INT64, Unix SECONDS — use TIMESTAMP_SECONDS(conversion_at) to convert),
  value (STRING → SAFE_CAST(value AS FLOAT64) for math; USD revenue),
  affiliate_value (STRING), projected_value (STRING),
  conversion_type_display_name (STRING: 'Purchase' | 'Add to Cart' | 'Quiz Start' | 'Reversed Purchase' | ...),
  funnel_step (STRING: 'other' | 'step_1' | 'step_2' | 'step_3'),
  funnel_step_description (STRING: 'Quiz Start' | 'Lead' | NULL),
  brand_display_name (STRING: 'Medvi' | 'Ro' | 'SkinnyRX' | 'Sprout' | 'Eden' | 'Hers' | 'Remedy'),
  is_partner (BOOL), is_first (BOOL)

FUNNEL STEP MEANING:
  Quiz Start = funnel_step='other' AND funnel_step_description='Quiz Start'
  Goal event = funnel_step='step_3'

VISITS + CONVERSIONS JOIN EXAMPLE:
  SELECT v.dti, v.device,
    COUNT(DISTINCT v.id) AS visits,
    COUNT(DISTINCT CASE WHEN c.funnel_step='other' AND c.funnel_step_description='Quiz Start' THEN c.id END) AS quiz_starts,
    COUNT(DISTINCT CASE WHEN c.funnel_step='step_3' THEN c.id END) AS goal_events,
    SUM(SAFE_CAST(c.value AS FLOAT64)) AS revenue
  FROM weightagent.WeightAgent.visits v
  LEFT JOIN weightagent.WeightAgent.conversions c ON v.id = c.visit_id
  WHERE v.entered_at_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY 1, 2 ORDER BY visits DESC LIMIT 20

DATASET BingAds ─────────────────────────────────────────────────────────────────

TABLE weightagent.BingAds.ad_performance  (daily stats by ad group)
  data_date (DATE), account_id, account_name,
  campaign_id (STRING), campaign_name (STRING), campaign_type (STRING),
  ad_group_id (STRING), ad_group_name (STRING), ad_id (STRING), ad_name (STRING),
  device_type (STRING), final_url (STRING),
  impressions (INT64), clicks (INT64), spend (FLOAT64 USD), conversions (FLOAT64)

TABLE weightagent.BingAds.keywords  (keyword entities — no daily stats here)
  account_id, keyword_id, ad_group_id (STRING), campaign_id (STRING),
  keyword_text (STRING), match_type (STRING: MatchType.EXACT | MatchType.PHRASE | MatchType.BROAD),
  cpc_bid (FLOAT64), status (STRING: KeywordStatus.ACTIVE | KeywordStatus.PAUSED)

TABLE weightagent.BingAds.campaigns
  account_id, campaign_id (STRING), campaign_name (STRING), status (STRING),
  budget_amount (FLOAT64), bid_strategy_type (STRING)

TABLE weightagent.BingAds.ad_groups
  ad_group_id (STRING), campaign_id (STRING), ad_group_name (STRING), status (STRING)

BING CAMPAIGN ANALYSIS EXAMPLE — look up by campaign_name (STRING):
  SELECT bp.campaign_name, bp.ad_group_name,
    SUM(bp.clicks) AS clicks, SUM(bp.spend) AS spend, SUM(bp.conversions) AS convs
  FROM weightagent.BingAds.ad_performance bp
  WHERE bp.data_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    AND bp.campaign_name = 'Search-generics-[tirzepatide]-en-dt-us-MMA'
  GROUP BY 1, 2 ORDER BY spend DESC LIMIT 20

BING KEYWORDS IN A CAMPAIGN:
  SELECT k.keyword_text, k.match_type, k.cpc_bid, k.status
  FROM weightagent.BingAds.keywords k
  WHERE k.campaign_id = (
    SELECT campaign_id FROM weightagent.BingAds.campaigns
    WHERE campaign_name = 'Search-generics-[tirzepatide]-en-dt-us-MMA' LIMIT 1
  ) AND k.status = 'KeywordStatus.ACTIVE'
  LIMIT 50

DATASET GoogleAds ───────────────────────────────────────────────────────────────

IMPORTANT: All GoogleAds id columns are INTEGER, not STRING.
To filter by Google campaign name, join ads_Campaign_4808949235 first.

TABLE weightagent.GoogleAds.ads_Campaign_4808949235  (campaign entities)
  campaign_id (INTEGER, PK), customer_id (INTEGER),
  campaign_name (STRING), campaign_status (STRING),
  campaign_bidding_strategy_type (STRING),
  campaign_start_date (DATE), campaign_end_date (DATE),
  _DATA_DATE (DATE), _LATEST_DATE (DATE)

TABLE weightagent.GoogleAds.ads_KeywordStats_4808949235  (daily keyword stats)
  segments_date (DATE), _DATA_DATE (DATE), _LATEST_DATE (DATE),
  ad_group_criterion_criterion_id (INTEGER), ad_group_id (INTEGER), campaign_id (INTEGER),
  segments_device (STRING: DESKTOP | MOBILE | TABLET),
  metrics_clicks (INTEGER), metrics_impressions (INTEGER),
  metrics_cost_micros (INTEGER, ÷1e6 = USD), metrics_conversions (FLOAT64),
  metrics_conversions_value (FLOAT64)

TABLE weightagent.GoogleAds.ads_Keyword_4808949235  (keyword entities)
  ad_group_criterion_criterion_id (INTEGER), ad_group_id (INTEGER), campaign_id (INTEGER),
  ad_group_criterion_keyword_text (STRING),
  ad_group_criterion_keyword_match_type (STRING: EXACT | PHRASE | BROAD),
  ad_group_criterion_quality_info_quality_score (INTEGER),
  ad_group_criterion_status (STRING)

GOOGLE KEYWORD+SPEND EXAMPLE (no campaign filter):
  SELECT k.ad_group_criterion_keyword_text, SUM(ks.metrics_clicks) AS clicks,
    SUM(ks.metrics_cost_micros)/1e6 AS spend_usd, SUM(ks.metrics_conversions) AS convs
  FROM weightagent.GoogleAds.ads_KeywordStats_4808949235 ks
  JOIN weightagent.GoogleAds.ads_Keyword_4808949235 k
    ON ks.ad_group_criterion_criterion_id = k.ad_group_criterion_criterion_id
    AND ks.ad_group_id = k.ad_group_id
  WHERE ks.segments_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY 1 ORDER BY spend_usd DESC LIMIT 20

GOOGLE KEYWORD+SPEND FILTERED BY CAMPAIGN NAME:
  SELECT k.ad_group_criterion_keyword_text, SUM(ks.metrics_clicks) AS clicks,
    SUM(ks.metrics_cost_micros)/1e6 AS spend_usd, SUM(ks.metrics_conversions) AS convs
  FROM weightagent.GoogleAds.ads_KeywordStats_4808949235 ks
  JOIN weightagent.GoogleAds.ads_Keyword_4808949235 k
    ON ks.ad_group_criterion_criterion_id = k.ad_group_criterion_criterion_id
    AND ks.ad_group_id = k.ad_group_id
  JOIN weightagent.GoogleAds.ads_Campaign_4808949235 c
    ON ks.campaign_id = c.campaign_id AND c._DATA_DATE = c._LATEST_DATE
  WHERE ks.segments_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    AND c.campaign_name = 'Brands-US-en-Desktop'
  GROUP BY 1 ORDER BY spend_usd DESC LIMIT 20

NOTE: For KeywordStats/SearchQueryStats do NOT filter _DATA_DATE = _LATEST_DATE —
      segments_date is always < _LATEST_DATE by design. Just filter by segments_date.

TABLE weightagent.GoogleAds.ads_AdGroup_4808949235  (ad group entities)
  ad_group_id (INTEGER), campaign_id (INTEGER),
  ad_group_name (STRING), ad_group_status (STRING),
  _DATA_DATE (DATE), _LATEST_DATE (DATE)
  → Use WHERE _DATA_DATE = _LATEST_DATE to get current entities

TABLE weightagent.GoogleAds.ads_AdBasicStats_4808949235  (daily per-ad stats, used by dashboard)
  segments_date (DATE), _DATA_DATE (DATE), _LATEST_DATE (DATE),
  ad_group_id (INTEGER), campaign_id (INTEGER),
  ad_group_ad_ad_id (INTEGER),
  segments_device (STRING: DESKTOP | MOBILE | TABLET),
  metrics_impressions (INTEGER), metrics_clicks (INTEGER),
  metrics_cost_micros (INTEGER, ÷1e6 = USD), metrics_conversions (FLOAT64)
  → Do NOT filter _DATA_DATE = _LATEST_DATE on this stats table — filter by segments_date

TABLE weightagent.GoogleAds.ads_SearchQueryStats_4808949235  (actual search terms)
  segments_date (DATE), _DATA_DATE (DATE), _LATEST_DATE (DATE),
  search_term_view_search_term (STRING), segments_search_term_match_type (STRING),
  ad_group_id (INTEGER), campaign_id (INTEGER),
  metrics_clicks (INTEGER), metrics_impressions (INTEGER),
  metrics_cost_micros (INTEGER, ÷1e6 = USD), metrics_conversions (FLOAT64), metrics_ctr (FLOAT64)

TABLE weightagent.GoogleAds.ads_Ad_4808949235  (RSA ad entities)
  NOTE: Actual column names use the long Google Ads prefix — use these exact names:
  ad_group_ad_ad_id (INTEGER), ad_group_id (INTEGER), campaign_id (INTEGER),
  ad_group_ad_status (STRING: ENABLED | PAUSED | REMOVED),
  ad_group_ad_ad_strength (STRING: EXCELLENT | GOOD | AVERAGE | POOR),
  ad_group_ad_ad_type (STRING: RESPONSIVE_SEARCH_AD | EXPANDED_TEXT_AD),
  ad_group_ad_ad_responsive_search_ad_headlines (STRING, serialised array of headline objects),
  ad_group_ad_ad_responsive_search_ad_descriptions (STRING, serialised array of description objects),
  ad_group_ad_ad_responsive_search_ad_path1 (STRING),
  ad_group_ad_ad_responsive_search_ad_path2 (STRING),
  _DATA_DATE (DATE), _LATEST_DATE (DATE)

RSA AD QUERY EXAMPLE (use _DATA_DATE = _LATEST_DATE here — it IS an entity table):
  SELECT ad_group_id, campaign_id,
    ad_group_ad_ad_strength,
    ad_group_ad_ad_responsive_search_ad_headlines,
    ad_group_ad_ad_responsive_search_ad_descriptions
  FROM weightagent.GoogleAds.ads_Ad_4808949235
  WHERE _DATA_DATE = _LATEST_DATE
    AND ad_group_ad_status = 'ENABLED'
  LIMIT 20

General rules:
- ALWAYS use full table paths: weightagent.DatasetName.table_name
- conversion_at AND entered_at are INT64 unix SECONDS — use TIMESTAMP_SECONDS() (NOT MILLIS)
- value/affiliate_value/projected_value in conversions are STRING — SAFE_CAST(value AS FLOAT64)
- LIMIT 50 on all queries; no INSERT/UPDATE/DELETE/MERGE
- cost_micros ÷ 1e6 = USD
- For KeywordStats/SearchQueryStats/AdBasicStats: do NOT filter _DATA_DATE = _LATEST_DATE — use segments_date
- For entity tables (Campaign, AdGroup, Keyword, Ad): use WHERE _DATA_DATE = _LATEST_DATE
"""


# ─── Notes helpers ────────────────────────────────────────────────────────────

NOTES_CONFIG_KEY = "research_notes"

DEFAULT_NOTES = """# Research Agent Notes

This file is written by the Research Agent and can be edited by you.
New findings are appended after each completed run.
The agent reads these notes at the start of every run as persistent memory.

## Recurring Patterns
_none yet_

## Open Questions
_none yet_

## Key Decisions Made
_none yet_
"""


def _load_research_notes(db_session) -> str:
    if db_session is None:
        return ""
    try:
        from database import get_config
        return get_config(db_session, NOTES_CONFIG_KEY) or DEFAULT_NOTES
    except Exception:
        return ""


def _save_research_notes(db_session, new_section: str):
    if db_session is None or not new_section.strip():
        return
    try:
        from database import get_config, set_config
        current = get_config(db_session, NOTES_CONFIG_KEY) or DEFAULT_NOTES
        set_config(db_session, NOTES_CONFIG_KEY, current.rstrip() + "\n\n" + new_section.strip())
    except Exception as exc:
        print(f"[research_notes save error] {exc}")


# ─── Prompt helpers ───────────────────────────────────────────────────────────

def _load_prompts(db_session) -> dict[str, str]:
    from database import DEFAULT_PROMPTS
    if db_session is None:
        return {k: DEFAULT_PROMPTS[k]["content"] for k in ("research_system", "research_step_human")}
    from database import get_prompt
    return {
        "research_system":     get_prompt(db_session, "research_system"),
        "research_step_human": get_prompt(db_session, "research_step_human"),
    }


# ─── HTML stripper ────────────────────────────────────────────────────────────

class _HTMLStripper(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer", "noscript"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer", "noscript"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if t:
                self._parts.append(t)

    def get_text(self):
        return " ".join(self._parts)


def _crawl_url(url: str, max_chars: int = 4000) -> str:
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)"}
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        s = _HTMLStripper()
        s.feed(raw)
        text = re.sub(r"\s+", " ", s.get_text()).strip()
        return text[:max_chars]
    except Exception as exc:
        return f"[Crawl failed: {exc}]"


def _parse_json(text: str) -> Any:
    text = text.strip()
    if "```" in text:
        text = re.sub(r"```(?:json)?\s*", "", text)
    return json.loads(text.strip())


# ─── Formatting helpers ───────────────────────────────────────────────────────

def _fmt_actions(actions: list[dict]) -> str:
    if not actions:
        return "None yet."
    parts = []
    for a in actions[-12:]:
        line = f"[{a.get('action_type', '?')}] {a.get('title', '')}"
        if a.get("result_preview"):
            line += f"\n  → {str(a['result_preview'])[:150]}"
        parts.append(line)
    return "\n".join(parts)


def _fmt_actions_for_report(actions: list[dict]) -> str:
    """Full result data for report generation — includes actual query output."""
    if not actions:
        return "None."
    parts = []
    for a in actions:
        atype = a.get("action_type", "?")
        title = a.get("title", "")
        result = str(a.get("result_preview", ""))
        if atype in ("query_bigquery", "query_postgres"):
            sql = str(a.get("data_source", ""))[:400]
            parts.append(f"[QUERY] {title}\nSQL: {sql}\nRESULT:\n{result[:2000]}")
        elif atype == "crawl_url":
            parts.append(f"[CRAWL] {title}\n{result[:600]}")
        elif atype == "record_finding":
            parts.append(f"[FINDING] {title}: {result[:400]}")
        elif atype in ("build_plan", "select_starting_point"):
            pass  # skip meta-actions from report
        else:
            parts.append(f"[{atype}] {title}")
    return "\n\n---\n\n".join(p for p in parts if p)


def _fmt_findings(findings: list[dict]) -> str:
    if not findings:
        return "No findings yet."
    parts = []
    for f in findings[-20:]:
        parts.append(
            f"[{f.get('finding_type','finding').upper()}] {f.get('title','')}\n"
            f"  {str(f.get('content',''))[:250]} (confidence: {f.get('confidence','?')})"
        )
    return "\n\n".join(parts)


# ─── Auto-extract observations from query results ─────────────────────────────

def _auto_observations(rows, result_str, purpose, sql, ctx: dict) -> list[dict]:
    try:
        llm = create_llm(model=ctx["model"], temperature=0.2)
        resp = llm.invoke([
            SystemMessage(content=DOMAIN_CONTEXT + "\nRespond ONLY with a JSON array."),
            HumanMessage(content=f"""Query: {purpose}
Result ({len(rows)} rows):
{result_str[:1800]}

Research context: investigating [{ctx.get('starting_point_type')}] "{ctx.get('starting_point_value')}"

Extract 1-3 specific observations. Be concrete with numbers.
JSON array: [{{"finding_type":"evidence|hypothesis|open_question","title":"...","content":"...","confidence":"low|medium|high"}}]"""),
        ])
        obs = _parse_json(resp.content)
        return obs if isinstance(obs, list) else ([obs] if isinstance(obs, dict) else [])
    except Exception:
        return []


def _crawl_observations(page_text, url, purpose, ctx: dict) -> list[dict]:
    try:
        llm = create_llm(model=ctx["model"], temperature=0.3)
        resp = llm.invoke([
            SystemMessage(content=DOMAIN_CONTEXT + "\nRespond ONLY with a JSON array."),
            HumanMessage(content=f"""Crawled: {url}
Purpose: {purpose}
Content: {page_text[:2500]}

Research context: [{ctx.get('starting_point_type')}] "{ctx.get('starting_point_value')}"

Extract 1-4 marketing observations: messaging, trust signals, CTA, pricing, positioning.
JSON array: [{{"finding_type":"evidence|hypothesis|recommendation|open_question","title":"...","content":"...","confidence":"low|medium|high"}}]"""),
        ])
        obs = _parse_json(resp.content)
        return obs if isinstance(obs, list) else ([obs] if isinstance(obs, dict) else [])
    except Exception:
        return []


# ─── I Feel Lucky ─────────────────────────────────────────────────────────────

def _get_lucky_candidates() -> list[dict]:
    """Build a pool of interesting marketing assets from BigQuery."""
    if not _BQ_AVAILABLE:
        return []
    candidates = []

    # ── Top Bing ad groups by spend (last 30 days) ─────────────────────────────
    try:
        rows = bq.run_query("""
            SELECT campaign_name, ad_group_name,
              SUM(clicks) AS clicks, SUM(spend) AS spend, SUM(conversions) AS convs
            FROM weightagent.BingAds.ad_performance
            WHERE data_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
            GROUP BY 1, 2 ORDER BY spend DESC LIMIT 20
        """, max_rows=20)
        pool = rows[3:] if len(rows) > 3 else rows  # skip top 3 to avoid always biggest
        for r in random.sample(pool, min(5, len(pool))):
            candidates.append({
                "type": "campaign",
                "value": r["campaign_name"],
                "ad_group": r["ad_group_name"],
                "clicks": r["clicks"], "spend": float(r["spend"] or 0),
                "convs": float(r["convs"] or 0),
                "note": f"Bing campaign (ad group: {r['ad_group_name']})",
            })
    except Exception:
        pass

    # ── Top Bing campaigns ────────────────────────────────────────────────────
    try:
        rows = bq.run_query("""
            SELECT campaign_name, SUM(clicks) AS clicks, SUM(spend) AS spend, SUM(conversions) AS convs
            FROM weightagent.BingAds.ad_performance
            WHERE data_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
            GROUP BY 1 ORDER BY spend DESC LIMIT 12
        """, max_rows=12)
        for r in random.sample(rows, min(3, len(rows))):
            candidates.append({
                "type": "campaign",
                "value": r["campaign_name"],
                "clicks": r["clicks"], "spend": float(r["spend"] or 0), "convs": float(r["convs"] or 0),
                "note": "Bing campaign",
            })
    except Exception:
        pass

    # ── Keyword texts from Bing keywords table ────────────────────────────────
    try:
        rows = bq.run_query("""
            SELECT DISTINCT keyword_text FROM weightagent.BingAds.keywords
            WHERE status = 'KeywordStatus.ACTIVE' LIMIT 60
        """, max_rows=60)
        for r in random.sample(rows, min(6, len(rows))):
            candidates.append({
                "type": "keyword",
                "value": r["keyword_text"],
                "note": "Bing keyword entity",
            })
    except Exception:
        pass

    # ── Top landing page variants (DTI) from visits ───────────────────────────
    try:
        rows = bq.run_query("""
            SELECT dti, COUNT(*) AS visits, COUNT(DISTINCT campaign_id) AS campaigns
            FROM weightagent.WeightAgent.visits
            WHERE entered_at_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
              AND dti IS NOT NULL AND dti != ''
            GROUP BY dti ORDER BY visits DESC LIMIT 10
        """, max_rows=10)
        for r in random.sample(rows, min(4, len(rows))):
            candidates.append({
                "type": "landing_page",
                "value": r["dti"],
                "visits": r["visits"], "campaigns": r["campaigns"],
                "note": "Landing page variant",
            })
    except Exception:
        pass

    # ── Partners by revenue from conversions ──────────────────────────────────
    try:
        rows = bq.run_query("""
            SELECT brand_display_name,
              COUNT(CASE WHEN funnel_step='other' AND funnel_step_description='Quiz Start' THEN 1 END) AS quiz_starts,
              COUNT(CASE WHEN funnel_step='step_3' THEN 1 END) AS goal_events,
              SUM(SAFE_CAST(value AS FLOAT64)) AS revenue
            FROM weightagent.WeightAgent.conversions
            WHERE brand_display_name IS NOT NULL
            GROUP BY 1 HAVING COUNT(*) > 5 ORDER BY revenue DESC LIMIT 8
        """, max_rows=8)
        for r in random.sample(rows, min(3, len(rows))):
            candidates.append({
                "type": "partner",
                "value": r["brand_display_name"],
                "quiz_starts": r["quiz_starts"], "goal_events": r["goal_events"],
                "revenue": float(r["revenue"] or 0),
                "note": "Partner/affiliate",
            })
    except Exception:
        pass

    random.shuffle(candidates)
    return candidates


# ─── Phase 1: Select starting point ──────────────────────────────────────────

def _select_starting_point(state: dict, db_session, cb) -> dict:
    if cb:
        cb(state["run_id"], 0, "select_starting_point", "Choosing starting point…", "", "", 0)

    sp_type  = state["starting_point_type"]
    sp_value = state["starting_point_value"]
    model    = state["model"]

    if sp_type == "lucky" or not sp_value:
        candidates = _get_lucky_candidates()
        if not candidates:
            # Hard-coded seed list when BigQuery unavailable
            candidates = [
                {"type": "keyword", "value": "compounded tirzepatide", "note": "high-volume GLP-1"},
                {"type": "keyword", "value": "ro weight loss", "note": "brand competitor"},
                {"type": "landing_page", "value": "r4", "note": "top traffic DTI"},
                {"type": "partner", "value": "Medvi", "note": "largest affiliate"},
                {"type": "campaign", "value": "Search-brands-general-en-dt-us", "note": "brand campaign"},
            ]
        llm = create_llm(model=model, temperature=1.0)
        resp = llm.invoke([
            SystemMessage(content=DOMAIN_CONTEXT),
            HumanMessage(content=f"""Here are marketing assets from the live database. Pick ONE interesting starting point.
Do NOT always pick the highest-spend or highest-volume item.
Favor something surprising, ambiguous, strategic, or that shows an interesting pattern worth investigating.
Consider: high spend but low conversions, unusual device mix, newer campaigns, underdog partners.

Candidates (randomised order):
{json.dumps(candidates, indent=2, default=str)}

Respond ONLY with valid JSON:
{{"starting_point_type":"keyword|landing_page|campaign|partner","starting_point_value":"exact value from candidates","starting_point_reason":"2-3 sentences on why this specific item is worth investigating now"}}"""),
        ])
        try:
            r = _parse_json(resp.content)
            sp_type   = r.get("starting_point_type", "keyword")
            sp_value  = r.get("starting_point_value", candidates[0]["value"])
            sp_reason = r.get("starting_point_reason", "Selected for research.")
        except Exception:
            chosen    = random.choice(candidates)
            sp_type   = chosen["type"]
            sp_value  = chosen["value"]
            sp_reason = f"Auto-selected: {chosen.get('note', 'interesting asset')}"
    else:
        llm = create_llm(model=model, temperature=0.3)
        resp = llm.invoke([
            SystemMessage(content=DOMAIN_CONTEXT),
            HumanMessage(content=f"The user chose to research [{sp_type}] '{sp_value}'. Write 2-3 sentences explaining what makes this interesting to investigate from a marketing funnel perspective. Plain text, no JSON."),
        ])
        sp_reason = resp.content.strip()

    state["starting_point_type"]   = sp_type
    state["starting_point_value"]  = sp_value
    state["starting_point_reason"] = sp_reason
    state["current_focus"]         = f"Investigating {sp_type}: {sp_value}"

    if cb:
        cb(state["run_id"], 0, "select_starting_point",
           f"Starting: [{sp_type}] {sp_value}", "", "", 0)
    return state


# ─── Phase 2: Initial angle ───────────────────────────────────────────────────

def _build_plan(state: dict, db_session, cb) -> dict:
    """Set a minimal initial investigation angle — NOT a rigid multi-step plan."""
    if cb:
        cb(state["run_id"], 0, "build_plan", "Choosing initial investigation angle…", "", "", 0)

    llm = create_llm(model=state["model"], temperature=0.3)
    resp = llm.invoke([
        SystemMessage(content=DOMAIN_CONTEXT),
        HumanMessage(content=f"""Starting point: [{state['starting_point_type']}] "{state['starting_point_value']}"
Why interesting: {state['starting_point_reason']}
Budget: {state['max_iterations']} investigation steps available.

Previous run notes:
{state.get('notes', 'none')[:600]}

Write ONE sentence: what is the single most interesting question to answer first about this asset?
Do NOT write a step-by-step plan. Just the first question to answer with data. Plain text."""),
    ])

    angle = resp.content.strip()
    state["research_plan"] = angle
    state["current_focus"] = angle

    if cb:
        cb(state["run_id"], 0, "build_plan", angle, "", "", 0)
    return state


# ─── LangGraph: state ────────────────────────────────────────────────────────

class ResearchState(TypedDict):
    messages:          Annotated[list[BaseMessage], add_messages]
    findings:          list[dict]
    actions_taken:     list[dict]
    direction_changes: list[str]
    current_focus:     str
    iteration:         int
    done:              bool
    error_log:         list[str]


# ─── LangGraph: tool schemas (for bind_tools — execution is in tools_node) ───

@tool
def query_postgres(sql: str, purpose: str) -> str:
    """Run a SELECT query against the PostgreSQL app database.
    NOTE: This database contains only app configuration — NO marketing analytics data.
    Use query_bigquery for all funnel, keyword, spend, and conversion analysis.
    sql: valid PostgreSQL SELECT.
    purpose: one sentence describing what you want to learn."""
    return "executed"

@tool
def query_bigquery(sql: str, purpose: str) -> str:
    """Run a SELECT query against BigQuery — the primary analytics database.
    Datasets: weightagent.WeightAgent (visits, conversions), weightagent.BingAds (ad_performance, keywords, campaigns),
    weightagent.GoogleAds (ads_Campaign_4808949235, ads_KeywordStats_4808949235, ads_Keyword_4808949235,
    ads_SearchQueryStats_4808949235, ads_Ad_4808949235).
    Always use full table paths. GoogleAds id fields (campaign_id, ad_group_id) are INTEGER — never compare
    to string campaign names; join ads_Campaign_4808949235 to filter by name.
    Bing campaigns are looked up by campaign_name (STRING) in BingAds tables.
    sql: valid BigQuery SQL with full table paths.
    purpose: one sentence describing what you want to learn."""
    return "executed"

@tool
def crawl_url(url: str, purpose: str) -> str:
    """Fetch and extract text content from a URL.
    url: full URL to crawl.
    purpose: what to look for on the page."""
    return "executed"

@tool
def record_finding(finding_type: str, title: str, content: str, confidence: str) -> str:
    """Record a key insight worth surfacing in the final report.
    finding_type: evidence | hypothesis | recommendation | open_question
    title: short descriptive title.
    content: detailed finding with concrete numbers where available.
    confidence: low | medium | high"""
    return "recorded"

@tool
def change_direction(new_focus: str, reason: str) -> str:
    """Pivot the research to a different focus area.
    new_focus: description of the new direction.
    reason: brief justification for the pivot."""
    return "pivoted"

@tool
def finish(reason: str) -> str:
    """End the research loop when sufficient findings have been gathered or steps are exhausted.
    reason: 1-2 sentences summarising what was found."""
    return "done"


_TOOLS = [query_bigquery, crawl_url, record_finding, change_direction, finish]


# ─── LangGraph: graph builder ─────────────────────────────────────────────────

def _build_research_graph(
    run_id: str,
    model: str,
    max_iterations: int,
    db_session,
    step_callback,
    sp_type: str,
    sp_value: str,
    sp_reason: str,
    research_plan: str,
):
    cb  = step_callback
    llm = create_llm(model=model, temperature=0.4).bind_tools(_TOOLS)

    prompts     = _load_prompts(db_session)
    system_text = (
        prompts["research_system"] + "\n\n"
        + DOMAIN_CONTEXT + "\n\n"
        + BQ_SCHEMA
    )
    system_msg = SystemMessage(content=system_text)

    # context shared by tool callbacks
    ctx = {"model": model, "starting_point_type": sp_type, "starting_point_value": sp_value}

    # ── agent node ─────────────────────────────────────────────────────────────

    def agent_node(state: ResearchState) -> dict:
        iteration = state["iteration"]

        if state["done"] or iteration >= max_iterations:
            return {"done": True}

        if cb:
            cb(run_id, iteration + 1, "research_step",
               f"Step {iteration + 1}/{max_iterations}: thinking…", "", "", 0)

        messages = [system_msg] + list(state["messages"])

        # Inject a wrap-up nudge near the end
        if max_iterations - iteration <= 2:
            messages = messages + [HumanMessage(
                content=f"Only {max_iterations - iteration} step(s) left. "
                        "Record any remaining findings and call `finish`."
            )]

        try:
            response = llm.invoke(messages)
        except Exception as exc:
            err = f"LLM error at step {iteration + 1}: {exc}"
            return {
                "messages": [SystemMessage(content=err)],
                "iteration": iteration + 1,
                "error_log": state["error_log"] + [err],
                "done": True,
            }

        return {"messages": [response], "iteration": iteration + 1}

    # ── tools node (custom — also updates findings/actions state) ─────────────

    def tools_node(state: ResearchState) -> dict:
        last_msg = state["messages"][-1]
        if not getattr(last_msg, "tool_calls", None):
            return {}

        tool_messages    = []
        new_findings     = list(state["findings"])
        new_actions      = list(state["actions_taken"])
        new_dir          = list(state["direction_changes"])
        current_focus    = state["current_focus"]
        done             = state["done"]
        iteration        = state["iteration"]
        new_errors       = list(state["error_log"])

        for tc in last_msg.tool_calls:
            name = tc["name"]
            args = tc["args"]
            tid  = tc["id"]

            try:
                # ── query_postgres ──────────────────────────────────────────
                if name == "query_postgres":
                    sql     = args.get("sql", "").strip().strip("```sql").strip("```").strip()
                    purpose = args.get("purpose", "")
                    if cb:
                        cb(run_id, iteration, "query_postgres", f"PostgreSQL: {purpose}", sql, "", 0)

                    rows, result_str, row_count = [], "(no result)", 0
                    try:
                        rows = pg_query(sql, max_rows=50)
                        from tabulate import tabulate
                        result_str = tabulate(rows, headers="keys", tablefmt="pipe", floatfmt=".2f") if rows else "(no rows)"
                        row_count  = len(rows)
                    except Exception as exc:
                        result_str = f"Query error: {exc}"
                        new_errors.append(result_str)

                    if cb:
                        cb(run_id, iteration, "query_postgres",
                           f"Returned {row_count} rows", sql, result_str[:400], row_count)

                    new_actions.append({
                        "action_type": "query_postgres", "title": purpose or f"PG query {iteration}",
                        "data_source": sql, "result_preview": result_str[:400],
                    })
                    current_focus = purpose or current_focus
                    if rows:
                        new_findings.extend(_auto_observations(rows, result_str, purpose, sql, ctx))
                    tool_messages.append(ToolMessage(content=result_str[:1200], tool_call_id=tid))

                # ── query_bigquery ──────────────────────────────────────────
                elif name == "query_bigquery":
                    if not _BQ_AVAILABLE:
                        tool_messages.append(ToolMessage(content="BigQuery unavailable.", tool_call_id=tid))
                        continue

                    sql     = args.get("sql", "").strip().strip("```sql").strip("```").strip()
                    purpose = args.get("purpose", "")
                    if cb:
                        cb(run_id, iteration, "query_bigquery", f"BigQuery: {purpose}", sql, "", 0)

                    rows, result_str, row_count = [], "(no result)", 0
                    try:
                        rows = bq.run_query(sql, max_rows=50)
                        from tabulate import tabulate
                        result_str = tabulate(rows, headers="keys", tablefmt="pipe", floatfmt=".2f") if rows else "(no rows)"
                        row_count  = len(rows)
                    except Exception as exc:
                        result_str = f"BQ error: {exc}"
                        new_errors.append(result_str)

                    if cb:
                        cb(run_id, iteration, "query_bigquery",
                           f"Returned {row_count} rows", sql, result_str[:400], row_count)

                    new_actions.append({
                        "action_type": "query_bigquery", "title": purpose or f"BQ query {iteration}",
                        "data_source": sql, "result_preview": result_str[:2000],
                    })
                    current_focus = purpose or current_focus
                    if rows:
                        new_findings.extend(_auto_observations(rows, result_str, purpose, sql, ctx))
                    tool_messages.append(ToolMessage(content=result_str[:1200], tool_call_id=tid))

                # ── crawl_url ───────────────────────────────────────────────
                elif name == "crawl_url":
                    url     = args.get("url", "").strip()
                    purpose = args.get("purpose", "")
                    if cb:
                        cb(run_id, iteration, "crawl_url", f"Crawling: {url}", url, "", 0)

                    page_text = _crawl_url(url)
                    if cb:
                        cb(run_id, iteration, "crawl_url",
                           f"Got {len(page_text)} chars from {url}", url, page_text[:300], 0)

                    new_actions.append({
                        "action_type": "crawl_url", "title": f"Crawled: {url}",
                        "data_source": url, "result_preview": page_text[:300],
                    })
                    current_focus = purpose or current_focus
                    new_findings.extend(_crawl_observations(page_text, url, purpose, ctx))
                    tool_messages.append(ToolMessage(content=page_text[:1200], tool_call_id=tid))

                # ── record_finding ──────────────────────────────────────────
                elif name == "record_finding":
                    finding = {
                        "finding_type": args.get("finding_type", "evidence"),
                        "title":        args.get("title", f"Finding {iteration}"),
                        "content":      args.get("content", ""),
                        "confidence":   args.get("confidence", "medium"),
                    }
                    if cb:
                        cb(run_id, iteration, "record_finding",
                           f"[{finding['finding_type'].upper()}] {finding['title']}", "", "", 0)
                    new_actions.append({
                        "action_type": "record_finding", "title": finding["title"],
                        "result_preview": finding["content"][:200],
                    })
                    new_findings.append(finding)
                    tool_messages.append(ToolMessage(
                        content=f"Recorded: {finding['title']}", tool_call_id=tid
                    ))

                # ── change_direction ────────────────────────────────────────
                elif name == "change_direction":
                    new_focus_val = args.get("new_focus", "")
                    reason        = args.get("reason", "")
                    if cb:
                        cb(run_id, iteration, "change_direction", f"Pivoting: {new_focus_val}", "", "", 0)
                    new_dir.append(f"Step {iteration}: {reason} → {new_focus_val}")
                    current_focus = new_focus_val
                    new_actions.append({
                        "action_type": "change_direction", "title": f"Pivot: {new_focus_val}",
                        "result_preview": reason[:200],
                    })
                    tool_messages.append(ToolMessage(
                        content=f"Direction → {new_focus_val}", tool_call_id=tid
                    ))

                # ── finish ──────────────────────────────────────────────────
                elif name == "finish":
                    reason = args.get("reason", "Research complete")
                    if cb:
                        cb(run_id, iteration, "finish", reason, "", "", 0)
                    new_actions.append({
                        "action_type": "finish", "title": "Research complete",
                        "result_preview": reason[:200],
                    })
                    done = True
                    tool_messages.append(ToolMessage(content=reason, tool_call_id=tid))

                else:
                    tool_messages.append(ToolMessage(
                        content=f"Unknown tool: {name}", tool_call_id=tid
                    ))

            except Exception as exc:
                err = f"Tool {name} error: {exc}"
                new_errors.append(err)
                tool_messages.append(ToolMessage(content=err, tool_call_id=tid))

        return {
            "messages":          tool_messages,
            "findings":          new_findings,
            "actions_taken":     new_actions,
            "direction_changes": new_dir,
            "current_focus":     current_focus,
            "done":              done,
            "error_log":         new_errors,
        }

    # ── routing ────────────────────────────────────────────────────────────────

    def should_continue(state: ResearchState) -> str:
        if state.get("done") or state["iteration"] >= max_iterations:
            return END
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return END

    # ── compile ────────────────────────────────────────────────────────────────

    graph = StateGraph(ResearchState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tools_node)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue)
    graph.add_edge("tools", "agent")

    return graph.compile()


# ─── Phase 4: Generate data-first report ──────────────────────────────────────

def _generate_slides(state: dict, db_session, cb) -> dict:
    if cb:
        cb(state["run_id"], state["iteration"], "generate_slides",
           "Compiling report…", "", "", 0)

    llm  = create_llm(model=state["model"], temperature=0.2)
    resp = llm.invoke([
        SystemMessage(content=DOMAIN_CONTEXT + "\nRespond ONLY with a JSON array. No prose outside the array."),
        HumanMessage(content=f"""Research complete. Write a data-first report.

Starting point: [{state['starting_point_type']}] "{state['starting_point_value']}"
Steps taken: {state['iteration']} | Direction changes: {'; '.join(state['direction_changes']) or 'none'}

All queries and crawls (with actual results):
{_fmt_actions_for_report(state['actions_taken'])}

All findings:
{_fmt_findings(state['findings'])}

Write as a JSON array — exactly these 5 sections in this order:

[
  {{
    "type": "data",
    "title": "Data Found",
    "content": "Paste the actual query results as markdown tables. Use pipe | tables. Include exact numbers — rows, clicks, spend, CVR, etc. This section MUST contain real data from the queries above, not summaries."
  }},
  {{
    "type": "findings",
    "title": "Key Findings",
    "content": "Numbered list. Each finding MUST cite a specific number from the data above. No finding without evidence."
  }},
  {{
    "type": "analysis",
    "title": "Analysis",
    "content": "What the pattern means. Root causes. What is driving the numbers. What's surprising and why."
  }},
  {{
    "type": "recommendations",
    "title": "Recommendations",
    "content": "Numbered list of specific actions. Each must name: which keyword / ad group / campaign, what to change, by how much. No vague advice."
  }},
  {{
    "type": "open_questions",
    "title": "Still Unknown",
    "content": "What to investigate next. Specific queries to run. What data would change the conclusions."
  }}
]

STRICT RULES:
- data section must contain actual tables copied from query results above
- every finding must reference a number
- recommendations must be specific (name the asset, give a number)
- return ONLY the JSON array"""),
    ])

    try:
        slides = _parse_json(resp.content)
        if not isinstance(slides, list):
            slides = []
    except Exception:
        slides = []

    # Always ensure at least the data section exists
    if not slides:
        slides = [
            {"type": "data", "title": "Data Found",
             "content": _fmt_actions_for_report(state["actions_taken"])[:3000]},
            {"type": "findings", "title": "Key Findings",
             "content": _fmt_findings(state["findings"])},
        ]

    # Add id field for compatibility
    for i, s in enumerate(slides):
        s.setdefault("id", f"section-{i+1}")

    exec_summary = next(
        (s.get("content", "") for s in slides if s.get("type") in ("findings", "data")), ""
    )
    state["slides"]            = slides
    state["executive_summary"] = exec_summary[:500]

    if cb:
        cb(state["run_id"], state["iteration"], "generate_slides",
           f"Report compiled — {len(slides)} sections.", "", "", 0)
    return state


# ─── Phase 5: Append to persistent notes ──────────────────────────────────────

def _append_notes(state: dict, db_session):
    if not state["findings"] or db_session is None:
        return
    try:
        llm  = create_llm(model=state["model"], temperature=0.3)
        resp = llm.invoke([
            SystemMessage(content="You write concise research memory notes in markdown. Be specific."),
            HumanMessage(content=f"""A research run just completed on [{state['starting_point_type']}] "{state['starting_point_value']}".

Executive summary: {state.get('executive_summary','')[:500]}

Key findings:
{_fmt_findings(state['findings'][-10:])}

Write a SHORT memory note (3-8 bullet points) to append to the research notes file.
Format:
## Run: [{state['starting_point_type']}] {state['starting_point_value']} — {datetime.utcnow().strftime('%Y-%m-%d')}
- bullet finding 1
- bullet finding 2
...
Only include genuinely useful recurring insights or open questions. No generic observations."""),
        ])
        _save_research_notes(db_session, resp.content.strip())
    except Exception as exc:
        print(f"[notes append error] {exc}")


# ─── Main entrypoint ──────────────────────────────────────────────────────────

def run_research(
    run_id: str,
    starting_point_type: str = "lucky",
    starting_point_value: str = "",
    depth: str = "standard",
    model: str = None,
    db_session=None,
    step_callback=None,
    max_iterations: int = 0,
) -> dict:
    cb    = step_callback
    model = model or os.getenv("OPENAI_MODEL", "gpt-4o")

    # Shared state dict for pre/post-graph phases
    state: dict = {
        "run_id":                run_id,
        "depth":                 depth,
        "model":                 model,
        "starting_point_type":   starting_point_type,
        "starting_point_value":  starting_point_value,
        "starting_point_reason": "",
        "research_plan":         "",
        "current_focus":         "",
        "actions_taken":         [],
        "findings":              [],
        "direction_changes":     [],
        "iteration":             0,
        "max_iterations":        max_iterations if max_iterations > 0 else DEPTH_ITERATIONS.get(depth, 14),
        "done":                  False,
        "slides":                [],
        "executive_summary":     "",
        "error_log":             [],
        "notes":                 _load_research_notes(db_session),
    }

    # Phase 1 & 2
    state = _select_starting_point(state, db_session, cb)
    state = _build_plan(state, db_session, cb)

    # Phase 3 — LangGraph ReAct loop
    app = _build_research_graph(
        run_id=run_id,
        model=model,
        max_iterations=state["max_iterations"],
        db_session=db_session,
        step_callback=cb,
        sp_type=state["starting_point_type"],
        sp_value=state["starting_point_value"],
        sp_reason=state["starting_point_reason"],
        research_plan=state["research_plan"],
    )

    notes_ctx = (state.get("notes") or "")[:1000]
    initial_human = HumanMessage(content=f"""Research brief:

Starting point: [{state['starting_point_type']}] "{state['starting_point_value']}"
Why: {state['starting_point_reason']}
Depth: {depth} | Steps available: {state['max_iterations']}

Research plan:
{state['research_plan']}

Previous run notes (your memory from past runs):
{notes_ctx or 'No notes yet.'}

Use the tools to investigate. Query data, crawl pages, record findings.
Call `finish` when you have sufficient findings or when steps run out.""")

    graph_input: ResearchState = {
        "messages":          [initial_human],
        "findings":          list(state["findings"]),
        "actions_taken":     list(state["actions_taken"]),
        "direction_changes": list(state["direction_changes"]),
        "current_focus":     state["current_focus"],
        "iteration":         0,
        "done":              False,
        "error_log":         list(state["error_log"]),
    }

    final = app.invoke(graph_input)

    # Merge graph output back into state
    state["findings"]          = final.get("findings",          state["findings"])
    state["actions_taken"]     = final.get("actions_taken",     state["actions_taken"])
    state["direction_changes"] = final.get("direction_changes", state["direction_changes"])
    state["current_focus"]     = final.get("current_focus",     state["current_focus"])
    state["iteration"]         = final.get("iteration",         state["iteration"])
    state["error_log"]         = final.get("error_log",         state["error_log"])

    # Phase 4 & 5
    state = _generate_slides(state, db_session, cb)
    _append_notes(state, db_session)

    return state
