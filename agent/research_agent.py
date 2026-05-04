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
    "quick":    4,
    "standard": 8,
    "deep":     14,
    "extreme":  20,
}


# ─── Domain + schema context ──────────────────────────────────────────────────

DOMAIN_CONTEXT = """You are a senior performance marketing researcher for top5weightchoices.com —
a comparison site for GLP-1 / weight loss medication programs.

BUSINESS: Traffic comes from Bing Ads + Google Ads. The funnel is:
  Keyword → Ad copy → Landing page (dti variant) → Partner comparison table → Partner brand page → Purchase

PARTNERS (affiliates): Medvi (largest), Ro, SkinnyRX, Sprout, Eden, Hers, Remedy
TOP KEYWORDS: tirzepatide, semaglutide for weight loss, zepbound, wegovy, compounded tirzepatide, GLP-1 pills
KEY METRICS: Quiz Start (top-of-funnel), Purchase (goal), CVR = Purchases/Quiz Starts,
             EPV = revenue/visits, EPC = revenue/clicks, LPCTR = landing page click-through rate

IMPORTANT PRINCIPLES:
- EPC alone is misleading — always consider EPV, click share, volume, and table position together
- RSA ads are already testing systems — prefer soft optimization (replace weak lines, keep strong ones)
- Never copy competitors blindly — describe what was observed and what it may suggest
- Distinguish: evidence | hypothesis | recommendation | open_question
"""

PG_SCHEMA = """
── PostgreSQL: public.conversions ──────────────────────────────────────────────
Funnel events table. One row per funnel event across the user journey.

Columns:
  id, value (revenue USD), conversion_at (TIMESTAMPTZ), platform_id (bing/google/organic),
  network (o=bing_search, g=google, s=syndication), device (c=desktop, m=mobile, t=tablet),
  match_type (e=exact, p=phrase, b=broad), funnel_step (Quiz Start | Quiz Complete | Add to Cart | Lead | Purchase),
  affiliate (Medvi | Ro | SkinnyRX | Sprout | Eden | Hers | Remedy),
  campaign_id, adgroup_id, keyword, utm_campaign, dti (landing page variant e.g. r4/j4/i2),
  landing_page_path, user_country, loc_physical_ms

Useful aggregation pattern:
  COUNT(*) FILTER (WHERE funnel_step='Quiz Start') AS starts,
  COUNT(*) FILTER (WHERE funnel_step='Purchase') AS purchases,
  ROUND(purchases::numeric / NULLIF(starts,0) * 100, 2) AS cvr,
  SUM(value) AS revenue

Rules: SELECT only, use NULLIF for division, LIMIT 50, no INSERT/UPDATE/DELETE
"""

BQ_SCHEMA = """
── BigQuery ─────────────────────────────────────────────────────────────────────
Project: weightagent   Main dataset: WeightAgent   Ads dataset: GoogleAds

TABLE weightagent.WeightAgent.visits
  Session-level landing page visits. One row per visit.
  id, platform_id, entered_at_date (DATE), campaign_id, adgroup_id, creative (ad_id),
  device (c/m/t), landing_page (full URL with UTM params)

TABLE weightagent.WeightAgent.google_ad_data
  Google Ads daily performance by date + campaign + keyword + device.
  date, campaign_name, adgroup_name, keyword_text, device,
  impressions, clicks, cost_micros (÷1e6 = USD), conversions, conversion_value, average_cpc

TABLE weightagent.WeightAgent.bing_ad_data
  Bing Ads daily performance.
  data_date, campaign_name, ad_group_name, keyword, device_type,
  impressions, clicks, spend (USD), conversions, revenue

TABLE weightagent.GoogleAds.ads_Ad_4808949235
  RSA ad entities — headlines and descriptions.
  _DATA_DATE, campaign_id, campaign_name, ad_group_id, ad_group_name, id AS ad_id,
  ad_type, status, ad_strength, headlines (ARRAY<STRING>), descriptions (ARRAY<STRING>)

TABLE weightagent.GoogleAds.ads_KeywordStats_4808949235
  Google Ads keyword daily performance.
  segments_date, campaign_name, ad_group_name, ad_group_criterion_keyword_text,
  ad_group_criterion_keyword_match_type,
  metrics_impressions, metrics_clicks, metrics_cost_micros, metrics_conversions,
  metrics_conversions_value, metrics_average_cpc

TABLE weightagent.GoogleAds.ads_SearchQueryStats_4808949235
  Actual search terms triggering ads.
  segments_date, campaign_name, search_term_view_search_term,
  segments_search_term_match_type,
  metrics_impressions, metrics_clicks, metrics_cost_micros, metrics_conversions

TABLE weightagent.GoogleAds.ads_ClickStats_4808949235
  Click-level data.
  segments_date, campaign_name, ad_group_name,
  metrics_clicks, metrics_impressions, metrics_cost_micros

Rules: Use full table path e.g. `weightagent.WeightAgent.visits`, LIMIT 50,
       cost_micros / 1e6 = USD, no INSERT/UPDATE/DELETE/MERGE
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
    candidates = []
    strategy = random.choice(["volume", "cvr", "revenue", "surprising"])

    try:
        all_kw = pg_query("""
            SELECT keyword,
              COUNT(*) FILTER (WHERE funnel_step='Quiz Start') AS starts,
              COUNT(*) FILTER (WHERE funnel_step='Purchase') AS purchases,
              ROUND(COUNT(*) FILTER (WHERE funnel_step='Purchase')::numeric /
                NULLIF(COUNT(*) FILTER (WHERE funnel_step='Quiz Start'),0)*100,1) AS cvr,
              SUM(value) AS revenue
            FROM conversions
            WHERE keyword IS NOT NULL AND keyword != ''
            GROUP BY keyword
            HAVING COUNT(*) FILTER (WHERE funnel_step='Quiz Start') > 10
            ORDER BY starts DESC LIMIT 40
        """, max_rows=40)
        pool = (all_kw[10:30] if strategy == "surprising" and len(all_kw) > 10
                else sorted(all_kw, key=lambda r: float(r.get("cvr") or 0), reverse=True)[:20]
                if strategy == "cvr" else all_kw[:20])
        for r in random.sample(pool, min(8, len(pool))):
            candidates.append({"type": "keyword", "value": r["keyword"],
                                "starts": r["starts"], "purchases": r["purchases"],
                                "cvr": float(r["cvr"] or 0), "revenue": float(r["revenue"] or 0)})
    except Exception:
        pass

    try:
        rows = pg_query("""
            SELECT dti,
              COUNT(*) FILTER (WHERE funnel_step='Quiz Start') AS starts,
              COUNT(*) FILTER (WHERE funnel_step='Purchase') AS purchases,
              ROUND(COUNT(*) FILTER (WHERE funnel_step='Purchase')::numeric /
                NULLIF(COUNT(*) FILTER (WHERE funnel_step='Quiz Start'),0)*100,1) AS cvr
            FROM conversions
            WHERE dti IS NOT NULL AND dti != ''
            GROUP BY dti HAVING COUNT(*) FILTER (WHERE funnel_step='Quiz Start') > 20
            ORDER BY starts DESC LIMIT 10
        """, max_rows=10)
        for r in random.sample(rows, min(3, len(rows))):
            candidates.append({"type": "landing_page", "value": r["dti"],
                                "starts": r["starts"], "purchases": r["purchases"],
                                "cvr": float(r["cvr"] or 0)})
    except Exception:
        pass

    try:
        rows = pg_query("""
            SELECT affiliate,
              COUNT(*) FILTER (WHERE funnel_step='Quiz Start') AS starts,
              COUNT(*) FILTER (WHERE funnel_step='Purchase') AS purchases,
              SUM(value) AS revenue,
              ROUND(SUM(value)/NULLIF(COUNT(*) FILTER (WHERE funnel_step='Quiz Start'),0),2) AS epv
            FROM conversions WHERE affiliate IS NOT NULL AND affiliate != ''
            GROUP BY affiliate ORDER BY purchases DESC LIMIT 8
        """, max_rows=8)
        for r in random.sample(rows, min(3, len(rows))):
            candidates.append({"type": "partner", "value": r["affiliate"],
                                "starts": r["starts"], "purchases": r["purchases"],
                                "revenue": float(r["revenue"] or 0), "epv": float(r.get("epv") or 0)})
    except Exception:
        pass

    try:
        rows = pg_query("""
            SELECT utm_campaign,
              COUNT(*) FILTER (WHERE funnel_step='Quiz Start') AS starts,
              COUNT(*) FILTER (WHERE funnel_step='Purchase') AS purchases,
              SUM(value) AS revenue
            FROM conversions WHERE utm_campaign IS NOT NULL AND utm_campaign != ''
            GROUP BY utm_campaign
            HAVING COUNT(*) FILTER (WHERE funnel_step='Quiz Start') > 30
            ORDER BY revenue DESC LIMIT 15
        """, max_rows=15)
        if rows:
            r = random.choice(rows)
            candidates.append({"type": "campaign", "value": r["utm_campaign"],
                                "starts": r["starts"], "purchases": r["purchases"],
                                "revenue": float(r["revenue"] or 0)})
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
        llm = create_llm(model=model, temperature=1.0)
        resp = llm.invoke([
            SystemMessage(content=DOMAIN_CONTEXT),
            HumanMessage(content=f"""Here are marketing assets in random order. Pick ONE interesting starting point.
Do NOT always pick the highest-volume item. Favor something surprising, ambiguous, or strategic.

Candidates:
{json.dumps(candidates, indent=2, default=str)}

Respond ONLY with JSON:
{{"starting_point_type":"keyword|landing_page|campaign|partner","starting_point_value":"exact value","starting_point_reason":"2-3 sentences on why this is worth investigating"}}"""),
        ])
        try:
            r = _parse_json(resp.content)
            sp_type   = r.get("starting_point_type", "keyword")
            sp_value  = r.get("starting_point_value", "tirzepatide")
            sp_reason = r.get("starting_point_reason", "Selected for research.")
        except Exception:
            sp_type   = "keyword"
            sp_value  = "tirzepatide"
            sp_reason = "High-volume keyword with multi-affiliate funnel."
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


# ─── Phase 2: Build plan ──────────────────────────────────────────────────────

def _build_plan(state: dict, db_session, cb) -> dict:
    if cb:
        cb(state["run_id"], 0, "build_plan", "Building research plan…", "", "", 0)

    llm = create_llm(model=state["model"], temperature=0.3)
    resp = llm.invoke([
        SystemMessage(content=DOMAIN_CONTEXT + "\n\nYou must respond ONLY with valid JSON. No other text."),
        HumanMessage(content=f"""Create a research plan for:

Starting point: [{state['starting_point_type']}] "{state['starting_point_value']}"
Why interesting: {state['starting_point_reason']}
Depth: {state['depth']} ({state['max_iterations']} steps)

Notes from previous runs (use as context):
{state.get('notes', 'none')[:1000]}

Available data sources:
- PostgreSQL (query_postgres): funnel events, CVR, revenue by keyword/partner/campaign/dti
- BigQuery (query_bigquery): visits, ad spend, RSA ad copy, keyword stats, search queries
- Crawl (crawl_url): competitor pages, partner brand pages, landing pages

Respond with JSON:
{{"plan_summary":"one paragraph","steps":[{{"step":1,"focus":"...","source":"query_postgres|query_bigquery|crawl_url","why":"..."}}]}}"""),
    ])

    try:
        d = _parse_json(resp.content)
        plan_text = d.get("plan_summary", "")
        steps = d.get("steps", [])
        plan_full = plan_text + "\n\nSteps:\n" + "\n".join(
            f"{s['step']}. [{s['source']}] {s['focus']} — {s['why']}" for s in steps
        )
    except Exception:
        plan_full = resp.content

    state["research_plan"] = plan_full
    state["actions_taken"].append({
        "action_type": "build_plan",
        "title":       "Research plan created",
        "result_preview": plan_full[:300],
    })

    if cb:
        cb(state["run_id"], 0, "build_plan", plan_full, "", "", 0)
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
    """Run a SELECT query against the PostgreSQL conversions table.
    sql: valid PostgreSQL SELECT.
    purpose: one sentence describing what you want to learn."""
    return "executed"

@tool
def query_bigquery(sql: str, purpose: str) -> str:
    """Run a SELECT query against BigQuery (ad spend, visits, RSA ads, search terms).
    Always use full table paths: weightagent.WeightAgent.visits, etc.
    sql: valid BigQuery SQL.
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


_TOOLS = [query_postgres, query_bigquery, crawl_url, record_finding, change_direction, finish]


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
        + PG_SCHEMA + "\n\n"
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
                        "data_source": sql, "result_preview": result_str[:400],
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


# ─── Phase 4: Generate slides ─────────────────────────────────────────────────

def _generate_slides(state: dict, db_session, cb) -> dict:
    if cb:
        cb(state["run_id"], state["iteration"], "generate_slides",
           "Generating presentation slides…", "", "", 0)

    llm  = create_llm(model=state["model"], temperature=0.4)
    resp = llm.invoke([
        SystemMessage(content=DOMAIN_CONTEXT + "\nRespond ONLY with a JSON array."),
        HumanMessage(content=f"""Research run complete. Generate a presentation.

Starting point: [{state['starting_point_type']}] "{state['starting_point_value']}"
Why: {state['starting_point_reason']}
Depth: {state['depth']} | Direction changes: {'; '.join(state['direction_changes']) or 'none'}

Research plan:
{state['research_plan']}

All actions:
{_fmt_actions(state['actions_taken'])}

All findings:
{_fmt_findings(state['findings'])}

Generate 8-16 slides as a JSON array. Slide types:
executive_summary | starting_point | why_interesting | research_plan |
data_insight | funnel_view | hypothesis | recommendation |
competitor_note | open_questions | next_paths

Each slide:
{{"id":"slide-N","type":"...","title":"...","content":"markdown content, specific numbers","evidence":["..."],"confidence":"low|medium|high","impact":"low|medium|high","effort":"low|medium|high","metric":"success metric if recommendation","tags":["keyword","partner"]}}

Rules:
- executive_summary MUST be first, next_paths MUST be last
- Use actual data from findings — no generic advice
- Distinguish evidence from assumptions
- Return ONLY the JSON array"""),
    ])

    try:
        slides = _parse_json(resp.content)
        if not isinstance(slides, list):
            slides = []
    except Exception:
        slides = [{"id": "slide-1", "type": "executive_summary", "title": "Research Complete",
                   "content": f"Completed {state['iteration']} research steps with {len(state['findings'])} findings.",
                   "evidence": []}]

    exec_summary = next((s.get("content", "") for s in slides if s.get("type") == "executive_summary"), "")
    state["slides"]            = slides
    state["executive_summary"] = exec_summary

    if cb:
        cb(state["run_id"], state["iteration"], "generate_slides",
           f"Generated {len(slides)} slides.", "", "", 0)
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
        "max_iterations":        DEPTH_ITERATIONS.get(depth, 8),
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
