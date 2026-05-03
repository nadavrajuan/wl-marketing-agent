"""
WL Research Agent — LangGraph state machine for deep marketing research.

Starts from one marketing asset (keyword, URL, partner, landing page, etc.)
and investigates outward through the funnel. Produces a visual presentation
of evidence, hypotheses, and testable recommendations.

Graph: SELECT_START → BUILD_PLAN → [RESEARCH_STEP]* → GENERATE_SLIDES → END
"""
import json
import os
import random
import re
import time
import urllib.request
import html.parser
from datetime import datetime
from typing import Annotated, TypedDict, Optional
import operator

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from db_client import run_query
from llm_factory import create_llm

# ─── Constants ────────────────────────────────────────────────────────────────

DEPTH_ITERATIONS = {
    "quick": 4,
    "standard": 8,
    "deep": 14,
    "extreme": 20,
}

DOMAIN_CONTEXT = """You are a senior performance marketing researcher, funnel strategist,
and competitive intelligence analyst for a Weight Loss medication comparison website (top5weightchoices.com).

The site compares GLP-1 / weight loss programs (Medvi, Ro, SkinnyRX, Sprout, Eden, Hers, Remedy).
Traffic comes from Bing Ads and Google Ads campaigns. The funnel is:
Keyword → Ad → Landing Page (dti variant) → Comparison Table → Partner/Brand Page → Purchase

Top keywords by volume: tirzepatide, semaglutide for weight loss, zepbound, wegovy, compounded tirzepatide, GLP-1 pills.
Affiliates ranked by purchase volume: Medvi (largest), Ro, SkinnyRX, Sprout, Eden, Hers, Remedy.
Key metrics: Quiz Start (top of funnel), Purchase (goal), CVR = Purchases/Quiz Starts, EPV = revenue/visits, EPC = revenue/clicks.
Landing page variants are tracked by the 'dti' field (e.g. r4, j4, i2).
"""

def _load_research_prompts(db_session=None) -> dict[str, str]:
    """Load research prompts from DB or fall back to DEFAULT_PROMPTS."""
    from database import DEFAULT_PROMPTS
    if db_session is None:
        return {
            "research_system":     DEFAULT_PROMPTS["research_system"]["content"],
            "research_step_human": DEFAULT_PROMPTS["research_step_human"]["content"],
        }
    from database import get_prompt
    return {
        "research_system":     get_prompt(db_session, "research_system"),
        "research_step_human": get_prompt(db_session, "research_step_human"),
    }


# Fallback constant used when no DB session is available
RESEARCH_SYSTEM_PROMPT = ""  # populated at runtime from DB


# ─── State ────────────────────────────────────────────────────────────────────

class ResearchState(TypedDict):
    run_id:               str
    depth:                str
    model:                str

    starting_point_type:  str
    starting_point_value: str
    starting_point_reason: str

    research_plan:        str
    current_focus:        str

    actions_taken:        Annotated[list[dict], operator.add]
    findings:             Annotated[list[dict], operator.add]
    direction_changes:    Annotated[list[str], operator.add]

    iteration:            int
    max_iterations:       int
    done:                 bool

    slides:               list[dict]
    executive_summary:    str
    error_log:            Annotated[list[str], operator.add]

    _step_callback:       Optional[object]


# ─── HTML Stripper ────────────────────────────────────────────────────────────

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
            text = data.strip()
            if text:
                self._parts.append(text)

    def get_text(self):
        return " ".join(self._parts)


def _crawl_url(url: str, max_chars: int = 4000) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; MarketingResearchBot/1.0)"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        stripper = _HTMLStripper()
        stripper.feed(raw)
        text = stripper.get_text()
        # Collapse whitespace
        text = re.sub(r"\s+", " ", text).strip()
        return text[:max_chars]
    except Exception as exc:
        return f"[Crawl failed: {exc}]"


# ─── Helper: format state for prompts ────────────────────────────────────────

def _fmt_actions(actions: list[dict]) -> str:
    if not actions:
        return "None yet."
    parts = []
    for a in actions:
        line = f"[{a.get('action_type', '?')}] {a.get('title', '')}"
        if a.get("data_source"):
            line += f"\n  Source: {a['data_source'][:100]}"
        if a.get("result_preview"):
            line += f"\n  Result: {a['result_preview'][:200]}"
        parts.append(line)
    return "\n\n".join(parts)


def _fmt_findings(findings: list[dict]) -> str:
    if not findings:
        return "No findings yet."
    parts = []
    for f in findings:
        parts.append(
            f"[{f.get('finding_type', 'finding').upper()}] {f.get('title', '')}\n"
            f"  {f.get('content', '')[:300]}\n"
            f"  Confidence: {f.get('confidence', 'unknown')}"
        )
    return "\n\n".join(parts)


# ─── Node: select_starting_point ─────────────────────────────────────────────

def select_starting_point(state: ResearchState) -> dict:
    cb = state.get("_step_callback")

    sp_type  = state.get("starting_point_type", "lucky")
    sp_value = state.get("starting_point_value", "")
    depth    = state.get("depth", "standard")

    if cb:
        cb(state["run_id"], 0, "select_starting_point",
           "Choosing starting point...", "", "", 0)

    # For "lucky" mode: query interesting candidates and let LLM pick
    if sp_type == "lucky" or not sp_value:
        candidates = _get_lucky_candidates()
        llm = create_llm(model=state.get("model"), temperature=1.0)
        response = llm.invoke([
            SystemMessage(content=DOMAIN_CONTEXT),
            HumanMessage(content=f"""Here are marketing assets from our data, presented in random order.
Pick ONE to start a research run. Do NOT always pick the highest-volume item.
Favor something surprising, ambiguous, strategically interesting, or underexplored.
Consider: volatile CVR, large revenue gap, multi-partner complexity, keyword-to-page mismatch potential.

Candidates (shuffled — do not default to the first one):
{json.dumps(candidates, indent=2, default=str)}

Research depth: {depth}

Respond ONLY with this JSON:
{{
  "starting_point_type": "keyword|landing_page|campaign|partner",
  "starting_point_value": "the exact value",
  "starting_point_reason": "2-3 sentences on what makes this worth investigating (not just 'high volume')"
}}"""),
        ])
        try:
            result = _parse_json(response.content)
            sp_type  = result.get("starting_point_type", "keyword")
            sp_value = result.get("starting_point_value", "tirzepatide")
            sp_reason = result.get("starting_point_reason", "Selected for research.")
        except Exception:
            sp_type  = "keyword"
            sp_value = "tirzepatide"
            sp_reason = "High-volume keyword with multi-affiliate funnel — worth deep investigation."
    else:
        # User provided a starting point: ask LLM to explain why it's interesting
        llm = create_llm(model=state.get("model"), temperature=0.3)
        response = llm.invoke([
            SystemMessage(content=DOMAIN_CONTEXT),
            HumanMessage(content=f"""The user wants to research this starting point:
Type: {sp_type}
Value: {sp_value}

Write 2-3 sentences explaining what makes this interesting to investigate
from a marketing funnel perspective.

Respond ONLY with plain text (no JSON).
"""),
        ])
        sp_reason = response.content.strip()

    if cb:
        cb(state["run_id"], 0, "select_starting_point",
           f"Starting from: [{sp_type}] {sp_value}", "", "", 0)

    return {
        "starting_point_type":   sp_type,
        "starting_point_value":  sp_value,
        "starting_point_reason": sp_reason,
        "current_focus":         f"Investigating {sp_type}: {sp_value}",
        "max_iterations":        DEPTH_ITERATIONS.get(state.get("depth", "standard"), 8),
        "iteration":             0,
        "done":                  False,
    }


def _get_lucky_candidates() -> list[dict]:
    """Return a varied pool of candidate starting points with randomized selection."""
    candidates = []

    # Strategy: rotate which angle we emphasize so LLM sees different mixes each time
    strategy = random.choice(["volume", "cvr", "revenue", "surprising"])

    # Keywords — pull a bigger pool and sample randomly to avoid always showing top-5
    try:
        all_kw = run_query("""
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
        # Sample 8-10 from the pool with bias toward current strategy
        if strategy == "surprising":
            # Mid-tier keywords (rank 10-30) — unexpected choices
            pool = all_kw[10:30] if len(all_kw) > 10 else all_kw
        elif strategy == "cvr":
            # Sort by CVR descending and pick from top half
            pool = sorted(all_kw, key=lambda r: float(r.get("cvr") or 0), reverse=True)[:20]
        else:
            pool = all_kw[:20]
        sample = random.sample(pool, min(8, len(pool)))
        for r in sample:
            candidates.append({"type": "keyword", "value": r["keyword"],
                                "starts": r["starts"], "purchases": r["purchases"],
                                "cvr": float(r["cvr"] or 0),
                                "revenue": float(r["revenue"] or 0),
                                "note": f"{strategy}-strategy pick"})
    except Exception:
        pass

    # Landing page variants — always included for variety
    try:
        rows = run_query("""
            SELECT dti,
              COUNT(*) FILTER (WHERE funnel_step='Quiz Start') AS starts,
              COUNT(*) FILTER (WHERE funnel_step='Purchase') AS purchases,
              ROUND(COUNT(*) FILTER (WHERE funnel_step='Purchase')::numeric /
                NULLIF(COUNT(*) FILTER (WHERE funnel_step='Quiz Start'),0)*100,1) AS cvr,
              COUNT(DISTINCT affiliate) AS partner_count
            FROM conversions
            WHERE dti IS NOT NULL AND dti != ''
            GROUP BY dti
            HAVING COUNT(*) FILTER (WHERE funnel_step='Quiz Start') > 20
            ORDER BY starts DESC LIMIT 10
        """, max_rows=10)
        pool = rows
        sample = random.sample(pool, min(4, len(pool)))
        for r in sample:
            candidates.append({"type": "landing_page", "value": r["dti"],
                                "starts": r["starts"], "purchases": r["purchases"],
                                "cvr": float(r["cvr"] or 0),
                                "partner_count": r.get("partner_count", 0)})
    except Exception:
        pass

    # Partners — included when strategy is revenue or surprising
    try:
        rows = run_query("""
            SELECT affiliate,
              COUNT(*) FILTER (WHERE funnel_step='Quiz Start') AS starts,
              COUNT(*) FILTER (WHERE funnel_step='Purchase') AS purchases,
              SUM(value) AS revenue,
              ROUND(SUM(value) / NULLIF(COUNT(*) FILTER (WHERE funnel_step='Quiz Start'),0), 2) AS epv
            FROM conversions
            WHERE affiliate IS NOT NULL AND affiliate != ''
            GROUP BY affiliate
            ORDER BY purchases DESC LIMIT 8
        """, max_rows=8)
        sample = random.sample(rows, min(3, len(rows)))
        for r in sample:
            candidates.append({"type": "partner", "value": r["affiliate"],
                                "starts": r["starts"], "purchases": r["purchases"],
                                "revenue": float(r["revenue"] or 0),
                                "epv": float(r.get("epv") or 0)})
    except Exception:
        pass

    # Campaigns — add for variety
    try:
        rows = run_query("""
            SELECT utm_campaign,
              COUNT(*) FILTER (WHERE funnel_step='Quiz Start') AS starts,
              COUNT(*) FILTER (WHERE funnel_step='Purchase') AS purchases,
              SUM(value) AS revenue
            FROM conversions
            WHERE utm_campaign IS NOT NULL AND utm_campaign != ''
            GROUP BY utm_campaign
            HAVING COUNT(*) FILTER (WHERE funnel_step='Quiz Start') > 30
            ORDER BY revenue DESC LIMIT 15
        """, max_rows=15)
        if rows:
            pick = random.choice(rows)
            candidates.append({"type": "campaign", "value": pick["utm_campaign"],
                                "starts": pick["starts"], "purchases": pick["purchases"],
                                "revenue": float(pick["revenue"] or 0)})
    except Exception:
        pass

    random.shuffle(candidates)
    return candidates


# ─── Node: build_plan ─────────────────────────────────────────────────────────

def build_plan(state: ResearchState) -> dict:
    cb = state.get("_step_callback")
    if cb:
        cb(state["run_id"], 0, "build_plan", "Building research plan...", "", "", 0)

    depth      = state.get("depth", "standard")
    sp_type    = state.get("starting_point_type", "keyword")
    sp_value   = state.get("starting_point_value", "")
    sp_reason  = state.get("starting_point_reason", "")
    max_iter   = state.get("max_iterations", 8)

    llm = create_llm(model=state.get("model"), temperature=0.3)
    response = llm.invoke([
        SystemMessage(content=RESEARCH_SYSTEM_PROMPT + "\n\n" + DOMAIN_CONTEXT),
        HumanMessage(content=f"""Create a research plan for the following:

Starting point: [{sp_type}] {sp_value}
Why interesting: {sp_reason}
Research depth: {depth} ({max_iter} investigation steps available)

Your plan should:
- Start from this specific asset
- Follow the full funnel (keyword → ad → landing page → partner → conversion → competitors)
- Identify what SQL queries to run and what URLs to crawl
- Adapt the plan depth to "{depth}" — {{"quick": "3-4 key questions", "standard": "6-8 threads", "deep": "10-12 threads", "extreme": "full investigation"}}.get("{depth}", "6-8 threads")
- Note which threads might be most interesting

Respond ONLY with this JSON:
{{
  "plan_summary": "One paragraph describing the research strategy",
  "steps": [
    {{"step": 1, "focus": "What to investigate", "how": "query_data|crawl_url", "why": "What this will reveal"}},
    ...
  ]
}}"""),
    ])

    try:
        plan_data = _parse_json(response.content)
        plan_text = plan_data.get("plan_summary", response.content)
        steps = plan_data.get("steps", [])
        plan_full = plan_text + "\n\nPlan steps:\n" + "\n".join(
            f"{s['step']}. [{s['how']}] {s['focus']} — {s['why']}"
            for s in steps
        )
    except Exception:
        plan_full = response.content

    if cb:
        cb(state["run_id"], 0, "build_plan", plan_full, "", "", 0)

    return {
        "research_plan": plan_full,
        "actions_taken": [{"action_type": "build_plan", "title": "Research Plan Created",
                           "result_preview": plan_full[:300]}],
    }


# ─── Node: research_step ──────────────────────────────────────────────────────

def research_step(state: ResearchState, db_session=None) -> dict:
    cb = state.get("_step_callback")
    iteration = state.get("iteration", 0) + 1
    max_iter  = state.get("max_iterations", 8)

    if cb:
        cb(state["run_id"], iteration, "research_step",
           f"Research step {iteration}/{max_iter}: thinking...", "", "", 0)

    prompts     = _load_research_prompts(db_session)
    system_text = prompts["research_system"] + "\n\n" + DOMAIN_CONTEXT
    step_tmpl   = prompts["research_step_human"]

    # Fill in all template variables (use .format_map so missing keys don't crash)
    prompt = step_tmpl.format_map({
        "starting_point_type":  state.get("starting_point_type", ""),
        "starting_point_value": state.get("starting_point_value", ""),
        "starting_point_reason": state.get("starting_point_reason", ""),
        "current_focus":        state.get("current_focus", ""),
        "depth":                state.get("depth", "standard"),
        "iteration":            iteration,
        "max_iterations":       max_iter,
        "remaining":            max_iter - iteration,
        "research_plan":        state.get("research_plan", ""),
        "actions_taken":        _fmt_actions(state.get("actions_taken", [])),
        "findings":             _fmt_findings(state.get("findings", [])),
        "direction_changes":    "; ".join(state.get("direction_changes", [])) or "None",
    })

    llm = create_llm(model=state.get("model"), temperature=0.4)
    response = llm.invoke([
        SystemMessage(content=system_text),
        HumanMessage(content=prompt),
    ])

    try:
        action = _parse_json(response.content)
    except Exception as exc:
        return {
            "iteration": iteration,
            "done": iteration >= max_iter,
            "error_log": [f"Step {iteration} JSON parse error: {exc}"],
            "actions_taken": [{"action_type": "error", "title": f"Step {iteration} failed",
                                "result_preview": str(exc)[:200]}],
        }

    action_type = action.get("action", "finish")
    thought     = action.get("thought", "")
    updates     = {"iteration": iteration}

    if action_type == "query_data":
        sql    = action.get("sql", "").strip().strip("```sql").strip("```").strip()
        purpose = action.get("purpose", "")

        if cb:
            cb(state["run_id"], iteration, "query_data",
               f"Querying: {purpose}", sql, "", 0)

        rows = []
        row_count = 0
        try:
            rows = run_query(sql, max_rows=50)
            from tabulate import tabulate
            result_str = tabulate(rows, headers="keys", tablefmt="pipe", floatfmt=".2f") if rows else "(no rows)"
            row_count  = len(rows)
        except Exception as exc:
            result_str = f"Query error: {exc}"

        if cb:
            cb(state["run_id"], iteration, "query_data",
               f"Query returned {row_count} rows", sql, result_str[:500], row_count)

        updates["actions_taken"] = [{
            "action_type": "query_data",
            "title": purpose or f"Data query (step {iteration})",
            "thought": thought,
            "data_source": sql,
            "result_preview": result_str[:500],
        }]
        updates["current_focus"] = purpose or state.get("current_focus", "")

        # Auto-record a quick observation from the query result
        if rows and row_count > 0:
            obs_llm = create_llm(model=state.get("model"), temperature=0.2)
            obs_resp = obs_llm.invoke([
                SystemMessage(content=DOMAIN_CONTEXT),
                HumanMessage(content=f"""Query purpose: {purpose}
SQL: {sql}
Result ({row_count} rows):
{result_str[:2000]}

Current research context: investigating [{state.get('starting_point_type')}] "{state.get('starting_point_value')}"

Extract 1-3 specific observations from this data. Be concrete with numbers.
Classify each as evidence, hypothesis, or open_question.

Respond with JSON array:
[{{"finding_type": "evidence|hypothesis|open_question", "title": "...", "content": "...", "confidence": "low|medium|high"}}]
"""),
            ])
            try:
                obs_list = _parse_json(obs_resp.content)
                if isinstance(obs_list, list):
                    updates["findings"] = obs_list
                elif isinstance(obs_list, dict):
                    updates["findings"] = [obs_list]
            except Exception:
                pass

    elif action_type == "crawl_url":
        url     = action.get("url", "").strip()
        purpose = action.get("purpose", "")

        if cb:
            cb(state["run_id"], iteration, "crawl_url",
               f"Crawling: {url}", url, "", 0)

        page_text = _crawl_url(url)

        if cb:
            cb(state["run_id"], iteration, "crawl_url",
               f"Crawled {len(page_text)} chars from {url}", url, page_text[:300], 0)

        # Analyze the crawled page
        analyze_llm = create_llm(model=state.get("model"), temperature=0.3)
        analyze_resp = analyze_llm.invoke([
            SystemMessage(content=DOMAIN_CONTEXT),
            HumanMessage(content=f"""I crawled this page as part of research on [{state.get('starting_point_type')}] "{state.get('starting_point_value')}".
URL: {url}
Purpose: {purpose}

Page content:
{page_text[:3000]}

Existing findings for context:
{_fmt_findings(state.get('findings', [])[:5])}

Extract 1-4 marketing-relevant observations from this page.
Look for: messaging strategy, trust signals, CTA framing, pricing strategy, partner positioning,
credibility signals, UX patterns, copy patterns, competitive positioning.

Respond with JSON array:
[{{"finding_type": "evidence|hypothesis|recommendation|open_question", "title": "...", "content": "...", "confidence": "low|medium|high"}}]
"""),
        ])

        crawl_findings = []
        try:
            crawl_findings = _parse_json(analyze_resp.content)
            if isinstance(crawl_findings, dict):
                crawl_findings = [crawl_findings]
        except Exception:
            pass

        updates["actions_taken"] = [{
            "action_type": "crawl_url",
            "title": f"Crawled: {url}",
            "thought": thought,
            "data_source": url,
            "result_preview": page_text[:300],
        }]
        if crawl_findings:
            updates["findings"] = crawl_findings
        updates["current_focus"] = purpose or state.get("current_focus", "")

    elif action_type == "record_finding":
        finding = {
            "finding_type": action.get("finding_type", "evidence"),
            "title":        action.get("title", f"Finding {iteration}"),
            "content":      action.get("content", ""),
            "confidence":   action.get("confidence", "medium"),
        }

        if cb:
            cb(state["run_id"], iteration, "record_finding",
               f"[{finding['finding_type'].upper()}] {finding['title']}", "", "", 0)

        updates["actions_taken"] = [{
            "action_type": "record_finding",
            "title": finding["title"],
            "thought": thought,
            "result_preview": finding["content"][:200],
        }]
        updates["findings"] = [finding]

    elif action_type == "change_direction":
        new_focus = action.get("new_focus", "")
        reason    = action.get("reason", "")

        if cb:
            cb(state["run_id"], iteration, "change_direction",
               f"Pivoting: {new_focus}", "", "", 0)

        updates["current_focus"]    = new_focus
        updates["direction_changes"] = [f"Step {iteration}: {reason} → {new_focus}"]
        updates["actions_taken"] = [{
            "action_type": "change_direction",
            "title": f"Direction change: {new_focus}",
            "thought": thought,
            "result_preview": reason[:200],
        }]

    elif action_type == "finish":
        if cb:
            cb(state["run_id"], iteration, "finish",
               f"Research complete: {action.get('reason', '')}", "", "", 0)
        updates["done"] = True
        updates["actions_taken"] = [{
            "action_type": "finish",
            "title": "Research complete",
            "thought": thought,
            "result_preview": action.get("reason", "")[:200],
        }]

    if iteration >= max_iter:
        updates["done"] = True

    return updates


# ─── Node: generate_slides ────────────────────────────────────────────────────

def generate_slides(state: ResearchState) -> dict:
    cb = state.get("_step_callback")
    if cb:
        cb(state["run_id"], state.get("iteration", 0), "generate_slides",
           "Generating presentation slides...", "", "", 0)

    llm = create_llm(model=state.get("model"), temperature=0.4)
    response = llm.invoke([
        SystemMessage(content=RESEARCH_SYSTEM_PROMPT + "\n\n" + DOMAIN_CONTEXT),
        HumanMessage(content=f"""A marketing research run has completed. Generate a presentation.

Starting point: [{state.get('starting_point_type')}] "{state.get('starting_point_value')}"
Why chosen: {state.get('starting_point_reason', '')}
Research depth: {state.get('depth')}
Direction changes: {'; '.join(state.get('direction_changes', [])) or 'None'}

Research plan:
{state.get('research_plan', '')}

All actions taken:
{_fmt_actions(state.get('actions_taken', []))}

All findings:
{_fmt_findings(state.get('findings', []))}

Generate a JSON array of 8-16 presentation slides. Slide types:
- starting_point: What was investigated
- why_interesting: Why this starting point matters
- research_plan: The investigation plan
- data_insight: Key data finding with numbers
- funnel_view: How the funnel looks for this asset
- hypothesis: A specific marketing hypothesis
- recommendation: A specific testable recommendation
- competitor_note: Competitor pattern or observation
- open_questions: Unanswered questions worth exploring
- next_paths: Suggested next research directions
- executive_summary: High-level summary (always include this FIRST)

Each slide JSON:
{{
  "id": "slide-N",
  "type": "...",
  "title": "Slide title",
  "content": "Main content — markdown formatted, specific, use actual data",
  "evidence": ["bullet 1", "bullet 2"],
  "confidence": "low|medium|high",
  "impact": "low|medium|high",
  "effort": "low|medium|high",
  "metric": "Success metric if recommendation",
  "tags": ["keyword", "landing_page", "partner"]
}}

Rules:
- Executive summary MUST be first
- Be specific — use actual data from findings
- Distinguish evidence from assumptions
- For recommendations: include confidence, impact, effort, and a success metric
- For hypotheses: explain the evidence and what would prove/disprove it
- Next paths slide MUST be last
- Return ONLY the JSON array, no other text
"""),
    ])

    try:
        slides = _parse_json(response.content)
        if not isinstance(slides, list):
            slides = []
    except Exception as exc:
        slides = [{
            "id": "slide-1",
            "type": "executive_summary",
            "title": "Research Complete",
            "content": f"Research run completed with {len(state.get('findings', []))} findings.",
            "evidence": [],
        }]

    # Executive summary text
    exec_summary = ""
    for s in slides:
        if s.get("type") == "executive_summary":
            exec_summary = s.get("content", "")
            break

    if cb:
        cb(state["run_id"], state.get("iteration", 0), "generate_slides",
           f"Generated {len(slides)} slides.", "", "", 0)

    return {
        "slides":            slides,
        "executive_summary": exec_summary,
    }


# ─── Routing ──────────────────────────────────────────────────────────────────

def should_continue(state: ResearchState) -> str:
    if state.get("done", False) or state.get("iteration", 0) >= state.get("max_iterations", 8):
        return "generate_slides"
    return "research_step"


# ─── Build Graph ──────────────────────────────────────────────────────────────

def build_research_graph(db_session=None):
    from functools import partial
    graph = StateGraph(ResearchState)

    graph.add_node("select_starting_point", select_starting_point)
    graph.add_node("build_plan",            build_plan)
    graph.add_node("research_step",         partial(research_step, db_session=db_session))
    graph.add_node("generate_slides",       generate_slides)

    graph.set_entry_point("select_starting_point")
    graph.add_edge("select_starting_point", "build_plan")
    graph.add_edge("build_plan",            "research_step")
    graph.add_conditional_edges("research_step", should_continue, {
        "research_step":   "research_step",
        "generate_slides": "generate_slides",
    })
    graph.add_edge("generate_slides", END)

    return graph.compile()


# ─── JSON parser ──────────────────────────────────────────────────────────────

def _parse_json(text: str):
    text = text.strip()
    # Strip markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    text = text.strip()
    return json.loads(text)


# ─── Run entrypoint ───────────────────────────────────────────────────────────

def run_research(
    run_id: str,
    starting_point_type: str = "lucky",
    starting_point_value: str = "",
    depth: str = "standard",
    model: str = None,
    db_session=None,
    step_callback=None,
) -> ResearchState:
    graph = build_research_graph(db_session=db_session)

    initial_state: ResearchState = {
        "run_id":               run_id,
        "depth":                depth,
        "model":                model or os.getenv("OPENAI_MODEL", "gpt-4o"),
        "starting_point_type":  starting_point_type,
        "starting_point_value": starting_point_value,
        "starting_point_reason": "",
        "research_plan":        "",
        "current_focus":        "",
        "actions_taken":        [],
        "findings":             [],
        "direction_changes":    [],
        "iteration":            0,
        "max_iterations":       DEPTH_ITERATIONS.get(depth, 8),
        "done":                 False,
        "slides":               [],
        "executive_summary":    "",
        "error_log":            [],
        "_step_callback":       step_callback,
    }

    final_state = graph.invoke(initial_state)
    return final_state
