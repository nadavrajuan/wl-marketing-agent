"""
Deterministic purchase-first analysis flow for the WL Marketing Agent.

This flow uses the live Next.js analytics APIs as the single source of truth:
- /api/optimization-flow
- /api/copy-intelligence
- /api/partner-research

It intentionally avoids raw SQL generation so the agent report stays aligned
with the curated BigQuery truth layer.
"""
import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    from llm_factory import create_llm
except ModuleNotFoundError:  # pragma: no cover - fallback for package-style imports
    from .llm_factory import create_llm


DEFAULT_ANALYTICS_BASE_URL = os.getenv("WEIGHT_AGENT_ANALYTICS_URL", "http://127.0.0.1:3000")


def _fetch_json(path: str, params: dict[str, Any] | None = None) -> Any:
    query = f"?{urlencode(params)}" if params else ""
    url = f"{DEFAULT_ANALYTICS_BASE_URL}{path}{query}"
    request = Request(url, headers={"Accept": "application/json"})
    with urlopen(request, timeout=180) as response:
        return json.loads(response.read().decode("utf-8"))


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _money(value: Any) -> str:
    return f"${_safe_float(value):,.0f}"


def _pct(value: Any) -> str:
    return f"{_safe_float(value):.2f}%"


def _json_preview(payload: Any) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=True)[:3000]


def _top_items(rows: list[dict[str, Any]], count: int = 5) -> list[dict[str, Any]]:
    return rows[:count] if rows else []


def _build_copy_tests(
    winners: list[dict[str, Any]],
    wastes: list[dict[str, Any]],
    winning_themes: list[dict[str, Any]],
) -> list[str]:
    tests: list[str] = []

    if winners:
      top = winners[0]
      tests.append(
          f"Test a stronger '{top['keyword']}' comparison ad on {top['platform']}: "
          f"'Compare {top['keyword']} providers' vs 'Best {top['keyword']} programs' "
          f"and send both to {top['top_landing_page']}."
      )

    if len(winners) > 1:
      brand = winners[1]
      tests.append(
          f"On {brand['platform']}, lean harder into the winning brand cue around '{brand['keyword']}' "
          f"by adding price/proof language tied to {brand['top_campaign']}."
      )

    if wastes:
      loser = wastes[0]
      tests.append(
          f"Stop generic copy for '{loser['keyword']}' on {loser['platform']}; "
          f"either pause it or isolate it with a page that directly answers intent before spending more."
      )

    theme_lookup = {str(theme.get("theme", "")): theme for theme in winning_themes}
    tirzepatide = theme_lookup.get("tirzepatide")
    if tirzepatide:
      tests.append(
          "Keep tirzepatide messaging in a provider-comparison frame. Avoid education-only headlines and make the next step explicit."
      )

    skinnyrx = theme_lookup.get("skinnyrx")
    if skinnyrx:
      tests.append(
          "For SkinnyRX-style brand traffic, lead with why this provider is different rather than broad GLP-1 language."
      )

    deduped: list[str] = []
    seen: set[str] = set()
    for test in tests:
        if test not in seen:
            deduped.append(test)
            seen.add(test)
    return deduped[:5]


def _build_reports(
    *,
    goal: str,
    optimization: dict[str, Any],
    copy_intelligence: dict[str, Any],
    partner_research: dict[str, Any],
    model: str | None,
) -> tuple[str, str]:
    summary = optimization.get("summary", {})
    assumptions = optimization.get("assumptions", {})
    truth = optimization.get("measurement_truth", {})
    truth_summary = truth.get("summary", {})
    winning_keywords = optimization.get("winning_keywords", [])
    wasted_keywords = optimization.get("wasted_keywords", [])
    landing_page_alerts = optimization.get("landing_page_alerts", [])
    partner_alerts = optimization.get("partner_alerts", [])
    copy_summary = copy_intelligence.get("summary", {})
    winning_themes = copy_intelligence.get("winning_themes", [])
    weak_themes = copy_intelligence.get("waste_themes", [])
    market_signals = partner_research.get("market_signals", {})
    snapshots = partner_research.get("snapshots", [])

    copy_tests = _build_copy_tests(winning_keywords, wasted_keywords, winning_themes)

    top_winners_md = "\n".join(
        f"- `{row['platform']}` `{row['keyword']}` in `{row['top_campaign']}`: "
        f"{row['net_purchases']} net purchases, {_money(row['estimated_spend'])} estimated spend, "
        f"{_money(row['purchase_profit'])} purchase profit, {_pct(row['purchase_roi_pct'])} purchase ROI."
        for row in _top_items(winning_keywords, 5)
    ) or "- No winning keywords found."

    top_waste_md = "\n".join(
        f"- `{row['platform']}` `{row['keyword']}` in `{row['top_campaign']}`: "
        f"{row['net_purchases']} net purchases, {_money(row['estimated_spend'])} estimated spend, "
        f"{_money(row['profit_gap_to_break_even'])} lost before break-even."
        for row in _top_items(wasted_keywords, 5)
    ) or "- No waste keywords found."

    landing_page_md = "\n".join(
        f"- `{row['platform']}` `{row['landing_page_path']}`: "
        f"{row['quiz_starts']} high-intent entries, {row['net_purchases']} net purchases, "
        f"{_pct(row.get('purchase_rate') or 0)} purchase rate."
        for row in _top_items(landing_page_alerts, 5)
    ) or "- No landing-page alerts found."

    partner_lines: list[str] = []
    for row in _top_items(partner_alerts, 5):
        if _safe_int(row.get("net_purchases")) < 0:
            partner_lines.append(
                f"- `{row['partner']}`: negative net purchases ({row['net_purchases']}), "
                f"so this partner is actively hurting purchase economics."
            )
        else:
            partner_lines.append(
                f"- `{row['partner']}`: {_money(row['modeled_value_usd'])} modeled value but "
                "no purchase truth, so keep it out of purchase ROI decisions."
            )
    partner_md = "\n".join(partner_lines) or "- No partner alerts found."

    theme_md = "\n".join(
        f"- `{row.get('label', row.get('theme', 'unknown'))}`: "
        f"{row.get('purchases', 0)} purchases, {_money(row.get('spend', 0))} spend, "
        f"{_pct(row.get('purchase_rate', 0))} purchase rate, {_money(row.get('cost_per_purchase', 0))} cost per purchase."
        for row in _top_items(winning_themes, 4)
    ) or "- No theme winners found."

    weak_theme_md = "\n".join(
        f"- `{row.get('label', row.get('theme', 'unknown'))}`: "
        f"{row.get('purchases', 0)} purchases, {_money(row.get('spend', 0))} spend, "
        f"{_pct(row.get('purchase_rate', 0))} purchase rate."
        for row in _top_items(weak_themes, 3)
    ) or "- No weak themes found."

    market_md = "\n".join(
        f"- {name}: {_safe_int(value)}"
        for name, value in market_signals.items()
    ) or "- No external partner/market signals collected."

    visible_sources = [
        snap for snap in snapshots
        if snap.get("ok")
    ]
    source_md = "\n".join(
        f"- `{snap.get('name', 'unknown')}`: {snap.get('title') or 'No title'}"
        for snap in visible_sources[:4]
    ) or "- No public source snapshots were reachable."

    executive_report = f"""# Purchase-First Action Report

## Goal
{goal}

## What This Run Used As Truth
- BigQuery-backed optimization flow from the live analytics app.
- Purchase value: {_money(assumptions.get('purchase_value_usd', 0))}
- Add-to-cart proxy value: {_money(assumptions.get('add_to_cart_proxy_value_usd', 0))}
- Spend allocation method: {assumptions.get('spend_allocation_method', 'unknown')}

## Measurement Truth
- {_safe_int(truth_summary.get('conversions_in_scope')):,} in-scope conversions
- {_safe_int(truth_summary.get('net_purchases'))} net purchases
- {_safe_int(truth_summary.get('add_to_carts'))} add-to-carts
- {_pct(truth_summary.get('join_rate_pct'))} visit join rate
- {_money(truth_summary.get('modeled_value_usd'))} modeled value

## Business Outcome
- {_money(summary.get('estimated_spend'))} estimated spend covered by keyword economics
- {_money(summary.get('purchase_revenue'))} purchase revenue
- {_money(summary.get('purchase_profit'))} purchase profit
- {_money(summary.get('add_to_cart_proxy_value'))} add-to-cart proxy value
- {_money(summary.get('proxy_profit'))} proxy profit

## What To Scale
{top_winners_md}

## What To Cut
{top_waste_md}

## Landing Pages To Review First
{landing_page_md}

## Partner Handling
{partner_md}

## Messaging Angles That Are Actually Working
{theme_md}

## Messaging Angles To Handle Carefully
{weak_theme_md}

## Copy Tests To Launch Next
{chr(10).join(f"- {item}" for item in copy_tests) if copy_tests else "- No copy tests generated."}

## External Market Signals
{market_md}

## Public Source Snapshots Used
{source_md}
"""

    technical_report = f"""# Technical Analysis Report

## Run Scope
- Goal: {goal}
- Analytics source: {DEFAULT_ANALYTICS_BASE_URL}
- Model requested: {model or 'default'}

## Assumptions
```json
{json.dumps(assumptions, indent=2)}
```

## Measurement Truth Summary
```json
{json.dumps(truth_summary, indent=2)}
```

## Optimization Summary
```json
{json.dumps(summary, indent=2)}
```

## Top Winning Keywords
{top_winners_md}

## Top Waste Keywords
{top_waste_md}

## Landing-Page Alerts
{landing_page_md}

## Partner Alerts
{partner_md}

## Copy Intelligence Summary
```json
{json.dumps(copy_summary, indent=2)}
```

## Winning Themes
{theme_md}

## Weak Themes
{weak_theme_md}

## Market Signals
{market_md}

## Reachable Public Snapshots
{source_md}
"""

    # Optional polish with the configured LLM, but stay safe with a deterministic fallback.
    if model:
        try:
            llm = create_llm(model=model, temperature=0.2)
            prompt = (
                "You are polishing an evidence-based PPC analysis. "
                "Keep it concise, numerical, and actionable. "
                "Do not invent data. Return two sections separated by the exact divider "
                "'===EXECUTIVE_REPORT==='. First section should be the technical report, "
                "second section should be the executive report.\n\n"
                f"TECHNICAL_REPORT_DRAFT:\n{technical_report}\n\n"
                f"EXECUTIVE_REPORT_DRAFT:\n{executive_report}"
            )
            response = llm.invoke(prompt)
            full_text = response.content if hasattr(response, "content") else str(response)
            divider = "===EXECUTIVE_REPORT==="
            if divider in full_text:
                tech, exec_report = full_text.split(divider, 1)
                return tech.strip(), exec_report.strip()
        except Exception:
            pass

    return technical_report, executive_report


def run_purchase_flow(
    run_id: str,
    goal: str,
    model: str | None = None,
    max_iterations: int = 5,
    db_session=None,
    step_callback=None,
) -> dict[str, Any]:
    del db_session
    del max_iterations

    findings: list[str] = []
    error_log: list[str] = []

    def emit(step_number: int, step_name: str, thought: str, result: Any, rows: int = 0, source: str = ""):
        if step_callback:
            step_callback(
                run_id,
                step_number,
                step_name,
                thought,
                source,
                _json_preview(result) if result is not None else "",
                rows,
            )

    try:
        optimization = _fetch_json("/api/optimization-flow")
        truth_summary = optimization.get("measurement_truth", {}).get("summary", {})
        thought = (
            "Loaded purchase-truth baseline from the live analytics app. "
            f"Join rate is {_pct(truth_summary.get('join_rate_pct'))} with "
            f"{_safe_int(truth_summary.get('net_purchases'))} net purchases."
        )
        findings.append(thought)
        emit(1, "MEASUREMENT_TRUTH", thought, optimization.get("measurement_truth", {}), 1, "GET /api/optimization-flow")

        winners = optimization.get("winning_keywords", [])
        wastes = optimization.get("wasted_keywords", [])
        top_winner = winners[0] if winners else None
        top_waste = wastes[0] if wastes else None
        thought = "Reviewed keyword economics based on estimated spend, purchase profit, and break-even loss."
        if top_winner:
            thought += (
                f" Top winner is {top_winner['keyword']} on {top_winner['platform']} "
                f"with {_money(top_winner['purchase_profit'])} profit."
            )
        if top_waste:
            thought += (
                f" Biggest waste is {top_waste['keyword']} on {top_waste['platform']} "
                f"with {_money(top_waste['profit_gap_to_break_even'])} lost before break-even."
            )
        findings.append(thought)
        emit(2, "KEYWORD_ECONOMICS", thought, {
            "winning_keywords": winners[:8],
            "wasted_keywords": wastes[:8],
            "summary": optimization.get("summary", {}),
        }, len(winners) + len(wastes), "GET /api/optimization-flow")

        landing_page_alerts = optimization.get("landing_page_alerts", [])
        page_thought = "Checked landing pages absorbing high-intent entries without enough purchases."
        if landing_page_alerts:
            page = landing_page_alerts[0]
            page_thought += (
                f" First review target is {page['landing_page_path']} on {page['platform']} "
                f"with {page['quiz_starts']} entries and {_pct(page.get('purchase_rate') or 0)} purchase rate."
            )
        findings.append(page_thought)
        emit(3, "LANDING_PAGE_MISMATCH", page_thought, landing_page_alerts[:10], len(landing_page_alerts), "GET /api/optimization-flow")

        copy_intelligence = _fetch_json("/api/copy-intelligence")
        winning_themes = copy_intelligence.get("winning_themes", [])
        waste_themes = copy_intelligence.get("waste_themes", [])
        copy_thought = "Pulled theme-level copy intelligence to keep the ad-copy layer simple and actionable."
        if winning_themes:
            copy_thought += (
                f" Strongest theme is {winning_themes[0].get('label', winning_themes[0].get('theme', 'unknown'))} "
                f"at {_money(winning_themes[0].get('cost_per_purchase', 0))} cost per purchase."
            )
        if waste_themes:
            copy_thought += (
                f" Weakest theme in scope is {waste_themes[0].get('label', waste_themes[0].get('theme', 'unknown'))}."
            )
        findings.append(copy_thought)
        emit(4, "COPY_INTELLIGENCE", copy_thought, {
            "summary": copy_intelligence.get("summary", {}),
            "winning_themes": winning_themes[:6],
            "waste_themes": waste_themes[:4],
            "recommendations": copy_intelligence.get("recommendations", []),
        }, len(winning_themes) + len(waste_themes), "GET /api/copy-intelligence")

        partner_research = _fetch_json("/api/partner-research")
        partner_alerts = optimization.get("partner_alerts", [])
        partner_thought = "Combined internal partner risk with public partner-site snapshots."
        if partner_alerts:
            negative_partners = [row["partner"] for row in partner_alerts if _safe_int(row.get("net_purchases")) < 0]
            if negative_partners:
                partner_thought += f" Current true purchase-risk partner is {negative_partners[0]}."
            else:
                partner_thought += " The current alerts are proxy-only partners that should stay out of purchase ROI decisions."
        findings.append(partner_thought)
        emit(5, "PARTNER_RISK_AND_MARKET", partner_thought, {
            "partner_alerts": partner_alerts,
            "market_signals": partner_research.get("market_signals", {}),
            "snapshots": partner_research.get("snapshots", []),
        }, len(partner_alerts), "GET /api/partner-research")

        final_report, public_report = _build_reports(
            goal=goal,
            optimization=optimization,
            copy_intelligence=copy_intelligence,
            partner_research=partner_research,
            model=model,
        )
        emit(6, "REPORT", "Built the final purchase-first report.", {
            "public_report": public_report,
        }, 1, "SYNTHESIZED")

        return {
            "run_id": run_id,
            "goal": goal,
            "model": model,
            "iteration": 5,
            "findings": findings,
            "final_report": final_report,
            "public_report": public_report,
            "error_log": error_log,
        }
    except HTTPError as exc:
        message = f"Analytics API returned HTTP {exc.code} for {exc.url}"
        error_log.append(message)
        raise RuntimeError(message) from exc
    except URLError as exc:
        message = f"Could not reach analytics app at {DEFAULT_ANALYTICS_BASE_URL}: {exc.reason}"
        error_log.append(message)
        raise RuntimeError(message) from exc
