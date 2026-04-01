"""
WL Marketing Analysis Agent — LangGraph state machine.

Graph: DISCOVER → PLAN → [QUERY → EXECUTE → ANALYZE]* → REPORT → END
                          ^________________________________|
                              (loop, max MAX_ITERATIONS)
"""
import json
import os
import time
from datetime import datetime
from typing import Annotated, TypedDict, Optional
import operator

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from db_client import run_query, get_schema_info, get_sample_data
from llm_factory import create_llm

# ─── State ───────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    run_id:              str
    goal:                str
    model:               str

    schema_info:         str
    sample_data:         str

    investigation_plan:  str
    queries_executed:    Annotated[list[dict], operator.add]
    findings:            Annotated[list[str], operator.add]

    current_step_name:   str
    current_query:       str
    current_result:      str
    current_thought:     str

    iteration:           int
    max_iterations:      int
    done:                bool

    final_report:        str
    public_report:       str
    error_log:           Annotated[list[str], operator.add]

    # Callbacks for real-time UI updates (not serialized to DB)
    _step_callback:      Optional[object]


# ─── Node helpers ────────────────────────────────────────────────────────────

def _fmt_queries(queries: list[dict]) -> str:
    if not queries:
        return "None yet."
    lines = []
    for i, q in enumerate(queries, 1):
        lines.append(f"Query {i}: {q.get('step', '')}\nSQL: {q.get('sql', '')[:300]}\nRows: {q.get('rows', 0)}")
    return "\n\n".join(lines)


def _fmt_findings(findings: list[str]) -> str:
    return "\n".join(f"- {f}" for f in findings) if findings else "No findings yet."


# ─── Nodes ───────────────────────────────────────────────────────────────────

def discover(state: AgentState) -> dict:
    cb = state.get("_step_callback")
    if cb:
        cb(state["run_id"], state["iteration"], "DISCOVER", "Fetching schema and sample data from PostgreSQL...", "", "", 0)

    schema = get_schema_info()
    sample = get_sample_data()

    return {
        "schema_info": schema,
        "sample_data": sample,
        "current_step_name": "DISCOVER",
        "current_thought": "Loaded schema and sample data.",
    }


def plan(state: AgentState, db_session=None) -> dict:
    cb = state.get("_step_callback")

    # Load prompts from DB or fall back to defaults
    prompts = _load_prompts(db_session)
    domain   = prompts.get("domain_context", "")
    playbook = prompts.get("investigation_playbook", "")
    sql_ref  = prompts.get("sql_reference", "")
    sys_tmpl = prompts.get("plan_system", "{domain_context}")
    hum_tmpl = prompts.get("plan_human", "{investigation_playbook}\n{schema_info}")

    system_msg = sys_tmpl.format(domain_context=domain)
    human_msg  = hum_tmpl.format(
        domain_context=domain,
        investigation_playbook=playbook,
        sql_reference=sql_ref,
        goal=state.get("goal", "Find optimization opportunities — maximize purchases, minimize cost"),
        schema_info=state.get("schema_info", ""),
        sample_data=state.get("sample_data", ""),
    )

    if cb:
        cb(state["run_id"], state["iteration"], "PLAN", "Building investigation plan...", "", "", 0)

    llm = create_llm(model=state.get("model"), temperature=0.2)
    response = llm.invoke([SystemMessage(content=system_msg), HumanMessage(content=human_msg)])
    plan_text = response.content

    if cb:
        cb(state["run_id"], state["iteration"], "PLAN", plan_text, "", "", 0)

    return {
        "investigation_plan": plan_text,
        "current_step_name": "PLAN",
        "current_thought": plan_text,
    }


def generate_query(state: AgentState, db_session=None) -> dict:
    cb = state.get("_step_callback")
    prompts = _load_prompts(db_session)

    domain  = prompts.get("domain_context", "")
    sql_ref = prompts.get("sql_reference", "")
    sys_tmpl = prompts.get("query_system", "{domain_context}\n{sql_reference}")
    hum_tmpl = prompts.get("query_human", "Write SQL for: {current_step_name}")

    # Determine which step to run next from the plan
    step_num   = state.get("iteration", 0) + 1
    plan_lines = state.get("investigation_plan", "").split("\n")
    step_name  = f"Step {step_num}"
    for line in plan_lines:
        stripped = line.strip()
        if stripped.startswith(f"{step_num}.") or stripped.startswith(f"{step_num})"):
            step_name = stripped
            break

    system_msg = sys_tmpl.format(domain_context=domain, sql_reference=sql_ref)
    human_msg  = hum_tmpl.format(
        domain_context=domain,
        sql_reference=sql_ref,
        investigation_plan=state.get("investigation_plan", ""),
        queries_executed=_fmt_queries(state.get("queries_executed", [])),
        findings=_fmt_findings(state.get("findings", [])),
        current_step_name=step_name,
    )

    if cb:
        cb(state["run_id"], state["iteration"], "GENERATE_QUERY", f"Writing SQL for: {step_name}", "", "", 0)

    llm = create_llm(model=state.get("model"), temperature=0.1)
    response = llm.invoke([SystemMessage(content=system_msg), HumanMessage(content=human_msg)])
    sql = response.content.strip().strip("```sql").strip("```").strip()

    return {
        "current_step_name": step_name,
        "current_query": sql,
        "current_thought": f"Generated SQL for: {step_name}",
    }


def execute_query(state: AgentState) -> dict:
    cb = state.get("_step_callback")
    sql = state.get("current_query", "")
    step_name = state.get("current_step_name", "")

    if cb:
        cb(state["run_id"], state["iteration"], "EXECUTE_QUERY",
           f"Running query for: {step_name}", sql, "", 0)

    try:
        rows = run_query(sql, max_rows=200)
        # Format as a readable table string
        if rows:
            from tabulate import tabulate
            result_str = tabulate(rows, headers="keys", tablefmt="pipe", floatfmt=".2f")
        else:
            result_str = "(no rows returned)"
        row_count = len(rows)
        error = None
    except Exception as e:
        result_str = f"ERROR: {str(e)}"
        row_count  = 0
        error      = str(e)

    if cb:
        cb(state["run_id"], state["iteration"], "EXECUTE_QUERY",
           f"Query returned {row_count} rows", sql, result_str, row_count)

    updates: dict = {
        "current_result": result_str,
        "queries_executed": [{
            "step":   step_name,
            "sql":    sql,
            "result": result_str[:2000],
            "rows":   row_count,
        }],
    }
    if error:
        updates["error_log"] = [f"[{step_name}] SQL error: {error}"]
    return updates


def analyze(state: AgentState, db_session=None) -> dict:
    cb = state.get("_step_callback")
    prompts = _load_prompts(db_session)

    domain   = prompts.get("domain_context", "")
    sys_tmpl = prompts.get("analyze_system", "{domain_context}")
    hum_tmpl = prompts.get("analyze_human", "{current_result}")

    system_msg = sys_tmpl.format(domain_context=domain)
    human_msg  = hum_tmpl.format(
        domain_context=domain,
        current_step_name=state.get("current_step_name", ""),
        current_query=state.get("current_query", ""),
        current_result=state.get("current_result", ""),
        findings=_fmt_findings(state.get("findings", [])),
    )

    if cb:
        cb(state["run_id"], state["iteration"], "ANALYZE",
           "Analyzing results...", state.get("current_query", ""),
           state.get("current_result", ""), 0)

    llm = create_llm(model=state.get("model"), temperature=0.2)
    response = llm.invoke([SystemMessage(content=system_msg), HumanMessage(content=human_msg)])
    analysis = response.content

    new_iteration = state.get("iteration", 0) + 1
    max_iter      = state.get("max_iterations", 6)
    done          = new_iteration >= max_iter

    if cb:
        cb(state["run_id"], new_iteration, "ANALYZE",
           analysis, state.get("current_query", ""),
           state.get("current_result", ""), 0)

    return {
        "findings":          [f"[Step {new_iteration}: {state.get('current_step_name', '')}] {analysis}"],
        "iteration":         new_iteration,
        "done":              done,
        "current_thought":   analysis,
    }


def report(state: AgentState, db_session=None) -> dict:
    cb = state.get("_step_callback")
    prompts = _load_prompts(db_session)

    domain   = prompts.get("domain_context", "")
    sys_tmpl = prompts.get("report_system", "{domain_context}")
    hum_tmpl = prompts.get("report_human", "{findings}\n{queries_executed}")

    system_msg = sys_tmpl.format(domain_context=domain)
    human_msg  = hum_tmpl.format(
        domain_context=domain,
        findings=_fmt_findings(state.get("findings", [])),
        queries_executed=_fmt_queries(state.get("queries_executed", [])),
        goal=state.get("goal", "Maximize purchases, minimize cost"),
    )

    if cb:
        cb(state["run_id"], state.get("iteration", 0), "REPORT",
           "Generating final reports...", "", "", 0)

    llm = create_llm(model=state.get("model"), temperature=0.3)
    response = llm.invoke([SystemMessage(content=system_msg), HumanMessage(content=human_msg)])
    full_text = response.content

    # Split into technical + executive reports
    divider = "===EXECUTIVE_REPORT==="
    if divider in full_text:
        parts         = full_text.split(divider, 1)
        final_report  = parts[0].strip()
        public_report = parts[1].strip()
    else:
        final_report  = full_text
        public_report = full_text

    if cb:
        cb(state["run_id"], state.get("iteration", 0), "REPORT",
           "Reports generated.", "", "", 0)

    return {
        "final_report":  final_report,
        "public_report": public_report,
        "current_step_name": "REPORT",
    }


# ─── Routing ─────────────────────────────────────────────────────────────────

def should_continue(state: AgentState) -> str:
    if state.get("done", False):
        return "report"
    return "generate_query"


# ─── Build Graph ─────────────────────────────────────────────────────────────

def build_graph(db_session=None):
    from functools import partial

    graph = StateGraph(AgentState)

    graph.add_node("discover",        discover)
    graph.add_node("plan",            partial(plan,            db_session=db_session))
    graph.add_node("generate_query",  partial(generate_query,  db_session=db_session))
    graph.add_node("execute_query",   execute_query)
    graph.add_node("analyze",         partial(analyze,         db_session=db_session))
    graph.add_node("report",          partial(report,          db_session=db_session))

    graph.set_entry_point("discover")
    graph.add_edge("discover",       "plan")
    graph.add_edge("plan",           "generate_query")
    graph.add_edge("generate_query", "execute_query")
    graph.add_edge("execute_query",  "analyze")
    graph.add_conditional_edges("analyze", should_continue, {
        "generate_query": "generate_query",
        "report":         "report",
    })
    graph.add_edge("report", END)

    return graph.compile()


# ─── Prompt loader ───────────────────────────────────────────────────────────

def _load_prompts(db_session=None) -> dict[str, str]:
    if db_session is None:
        from database import DEFAULT_PROMPTS
        return {k: v["content"] for k, v in DEFAULT_PROMPTS.items()}
    from database import get_prompt, DEFAULT_PROMPTS
    return {k: get_prompt(db_session, k) for k in DEFAULT_PROMPTS}


# ─── Run entrypoint ──────────────────────────────────────────────────────────

def run_analysis(
    run_id: str,
    goal: str = "Find optimization opportunities — maximize purchases, minimize cost",
    model: str = None,
    max_iterations: int = 6,
    db_session=None,
    step_callback=None,
):
    graph = build_graph(db_session=db_session)

    initial_state: AgentState = {
        "run_id":             run_id,
        "goal":               goal,
        "model":              model or os.getenv("OPENAI_MODEL", "gpt-4o"),
        "schema_info":        "",
        "sample_data":        "",
        "investigation_plan": "",
        "queries_executed":   [],
        "findings":           [],
        "current_step_name":  "",
        "current_query":      "",
        "current_result":     "",
        "current_thought":    "",
        "iteration":          0,
        "max_iterations":     max_iterations,
        "done":               False,
        "final_report":       "",
        "public_report":      "",
        "error_log":          [],
        "_step_callback":     step_callback,
    }

    final_state = graph.invoke(initial_state)
    return final_state
