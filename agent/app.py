"""
WL Marketing Agent — FastAPI Web Server
Adapted from Codere AI architecture.
"""
import json
import os
import re
import threading
import time
import uuid
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Form, Depends, Header, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

from database import (
    init_db, SessionLocal, get_db,
    Run, RunStep, Prompt, AppConfig, RunChatMessage, User,
    get_config, set_config, get_prompt, authenticate, update_run, save_step,
    DEFAULT_PROMPTS,
)
from db_client import get_quick_stats
from ingestion import IngestPayload, ingest_bing_ads_payload, ingest_google_ads_payload
from llm_factory import create_llm
from settings import require_env

app = FastAPI(title="WL Marketing Agent")
app.add_middleware(
    SessionMiddleware,
    secret_key=require_env("SESSION_SECRET"),
    max_age=86400,
)

templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "templates"))
templates.env.globals["analytics_url"] = os.getenv("PUBLIC_ANALYTICS_URL", "/")
app.mount(
    "/agent/static",
    StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")),
    name="agent-static",
)

# ─── Auth helpers ─────────────────────────────────────────────────────────────

def get_current_user(request: Request):
    return request.session.get("user")

def require_auth(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=303, headers={"Location": "/agent/login"})
    return user


def require_ingest_token(authorization: str | None = Header(default=None)) -> None:
    expected = require_env("INGEST_API_TOKEN")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if token != expected:
        raise HTTPException(status_code=403, detail="Invalid ingest token")


def _extract_report_section(report: str, heading: str) -> str:
    if not report:
        return ""
    pattern = re.compile(
        rf"^## {re.escape(heading)}\n(.*?)(?=^## |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(report)
    return match.group(1).strip() if match else ""


def _build_chat_fallback(run: Run, user_msg: str) -> str:
    report = run.public_report or ""
    question = user_msg.lower()

    if any(term in question for term in ["pause", "cut", "wasting", "waste", "losing money"]):
        section = _extract_report_section(report, "What To Cut")
        if section:
            return "The highest-priority cuts from this run are:\n\n" + section

    if any(term in question for term in ["scale", "winner", "best keyword", "top keyword"]):
        section = _extract_report_section(report, "What To Scale")
        if section:
            return "The strongest scale candidates from this run are:\n\n" + section

    if "landing" in question or "page" in question:
        section = _extract_report_section(report, "Landing Pages To Review First")
        if section:
            return "The first landing pages to review from this run are:\n\n" + section

    if "partner" in question or "sprout" in question or "ro " in question or question.endswith("ro"):
        section = _extract_report_section(report, "Partner Handling")
        if section:
            return "Partner guidance from this run:\n\n" + section

    if "copy" in question or "headline" in question or "ad copy" in question or "message" in question:
        section = _extract_report_section(report, "Copy Tests To Launch Next")
        if section:
            return "The next copy tests from this run are:\n\n" + section

    summary = _extract_report_section(report, "Business Outcome")
    cuts = _extract_report_section(report, "What To Cut")
    scale = _extract_report_section(report, "What To Scale")

    parts = [
        "Live chat fell back to the stored report because the model request was unavailable.",
    ]
    if summary:
        parts.append("Business outcome:\n\n" + summary)
    if scale:
        parts.append("What to scale:\n\n" + scale)
    if cuts:
        parts.append("What to cut:\n\n" + cuts)
    return "\n\n".join(parts)


# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    max_attempts = int(os.getenv("DB_INIT_MAX_ATTEMPTS", "10"))
    retry_delay_seconds = float(os.getenv("DB_INIT_RETRY_SECONDS", "3"))
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            init_db()
            return
        except OperationalError as exc:
            last_error = exc
            if attempt == max_attempts:
                break
            print(
                f"[startup] database init attempt {attempt}/{max_attempts} failed: {exc}. "
                f"Retrying in {retry_delay_seconds:.1f}s..."
            )
            time.sleep(retry_delay_seconds)

    if last_error is not None:
        raise last_error


@app.get("/agent/health")
async def health():
    return JSONResponse({"ok": True, "service": "agent"})


# ─── Auth routes ──────────────────────────────────────────────────────────────

@app.get("/agent/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if request.session.get("user"):
        return RedirectResponse("/agent/", status_code=302)
    return templates.TemplateResponse(request, "login.html", {"error": None})

@app.post("/agent/login", response_class=HTMLResponse)
async def login_post(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = authenticate(db, username, password)
    if user:
        request.session["user"] = {"username": user.username, "is_admin": user.is_admin}
        return RedirectResponse("/agent/", status_code=302)
    return templates.TemplateResponse(request, "login.html", {"error": "Invalid credentials"})

@app.get("/agent/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/agent/login", status_code=302)


# ─── Dashboard ────────────────────────────────────────────────────────────────

@app.get("/agent/", response_class=HTMLResponse)
async def dashboard(request: Request, db: Session = Depends(get_db)):
    user = require_auth(request)
    runs = db.query(Run).order_by(Run.created_at.desc()).limit(30).all()

    # Stats
    total  = db.query(Run).count()
    done   = db.query(Run).filter_by(status="completed").count()
    failed = db.query(Run).filter_by(status="failed").count()
    running = db.query(Run).filter_by(status="running").count()

    # DB quick stats
    try:
        db_stats = get_quick_stats()
    except Exception:
        db_stats = {}

    return templates.TemplateResponse(request, "dashboard.html", {
        "user": user,
        "runs": runs,
        "total_runs": total,
        "completed_runs": done,
        "failed_runs": failed,
        "running_runs": running,
        "db_stats": db_stats,
    })


# ─── Run Detail ───────────────────────────────────────────────────────────────

@app.get("/agent/runs/{run_id}", response_class=HTMLResponse)
async def run_detail(request: Request, run_id: str, db: Session = Depends(get_db)):
    require_auth(request)
    run = db.query(Run).filter_by(run_id=run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    steps = db.query(RunStep).filter_by(run_id=run_id).order_by(RunStep.step_number).all()
    chat  = db.query(RunChatMessage).filter_by(run_id=run_id).order_by(RunChatMessage.created_at).all()

    return templates.TemplateResponse(request, "run_detail.html", {
        "run": run,
        "steps": steps,
        "chat_messages": chat,
        "insights": json.loads(run.insights or "[]"),
    })


# ─── Prompts ──────────────────────────────────────────────────────────────────

@app.get("/agent/prompts", response_class=HTMLResponse)
async def prompts_page(request: Request, db: Session = Depends(get_db)):
    require_auth(request)
    prompts = {k: get_prompt(db, k) for k in DEFAULT_PROMPTS}
    meta    = {k: {"display_name": v["display_name"], "description": v["description"]}
               for k, v in DEFAULT_PROMPTS.items()}
    return templates.TemplateResponse(request, "prompts.html", {
        "prompts": prompts,
        "meta": meta,
    })

@app.post("/agent/prompts/{name}")
async def save_prompt(name: str, request: Request, db: Session = Depends(get_db)):
    require_auth(request)
    if name not in DEFAULT_PROMPTS:
        raise HTTPException(status_code=400, detail="Unknown prompt")
    form = await request.form()
    content = form.get("content", "")
    row = db.query(Prompt).filter_by(name=name).first()
    if row:
        row.content    = content
        row.updated_at = datetime.utcnow()
    else:
        db.add(Prompt(name=name, display_name=DEFAULT_PROMPTS[name]["display_name"],
                      description=DEFAULT_PROMPTS[name]["description"], content=content))
    db.commit()
    return JSONResponse({"ok": True})


# ─── Config ───────────────────────────────────────────────────────────────────

@app.get("/agent/config", response_class=HTMLResponse)
async def config_page(request: Request, db: Session = Depends(get_db)):
    require_auth(request)
    cfg = {
        "max_iterations":  get_config(db, "max_iterations", "6"),
        "openai_model":    get_config(db, "openai_model", "gpt-4o"),
        "email_recipients":get_config(db, "email_recipients", ""),
    }
    return templates.TemplateResponse(request, "config.html", {"cfg": cfg})

@app.post("/agent/config")
async def save_config(
    request: Request,
    max_iterations: str  = Form("6"),
    openai_model: str    = Form("gpt-4o"),
    email_recipients: str= Form(""),
    db: Session          = Depends(get_db),
):
    require_auth(request)
    set_config(db, "max_iterations",   max_iterations)
    set_config(db, "openai_model",     openai_model)
    set_config(db, "email_recipients", email_recipients)
    return RedirectResponse("/agent/config?saved=1", status_code=302)


@app.get("/agent/internal/health")
async def internal_health(_: None = Depends(require_ingest_token)):
    return JSONResponse({"ok": True, "service": "agent-ingest"})


# ─── API — Trigger Run ────────────────────────────────────────────────────────

@app.post("/agent/api/run")
async def api_trigger_run(request: Request, db: Session = Depends(get_db)):
    require_auth(request)
    body = await request.json()
    goal  = body.get("goal", "Find optimization opportunities — maximize purchases, minimize cost")
    model = body.get("model") or get_config(db, "openai_model", "gpt-4o")
    max_iter = int(get_config(db, "max_iterations", "6"))

    run_id = str(uuid.uuid4())[:8]
    db.add(Run(
        run_id=run_id,
        status="running",
        goal=goal,
        model=model,
        created_at=datetime.utcnow(),
    ))
    db.commit()

    def run_in_background():
        from agent import run_analysis
        agent_db = SessionLocal()
        start = time.time()

        def step_callback(run_id, iteration, step_name, thought, sql, result, rows):
            try:
                step_num = agent_db.query(RunStep).filter_by(run_id=run_id).count() + 1
                save_step(agent_db, run_id, step_num, step_name,
                          thought=thought, sql=sql, result_summary=result[:3000] if result else "", rows_count=rows)
            except Exception as e:
                print(f"[step_callback error] {e}")

        try:
            final_state = run_analysis(
                run_id=run_id,
                goal=goal,
                model=model,
                max_iterations=max_iter,
                db_session=agent_db,
                step_callback=step_callback,
            )
            duration = time.time() - start
            update_run(agent_db, run_id,
                status="completed",
                final_report=final_state.get("final_report", ""),
                public_report=final_state.get("public_report", ""),
                error_log=json.dumps(final_state.get("error_log", [])),
                insights=json.dumps(final_state.get("findings", [])[-5:]),
                iteration_count=final_state.get("iteration", 0),
                duration_seconds=round(duration, 1),
            )
        except Exception as e:
            import traceback
            err = traceback.format_exc()
            print(f"[agent error] {err}")
            update_run(agent_db, run_id,
                status="failed",
                error_log=json.dumps([str(e)]),
                duration_seconds=round(time.time() - start, 1),
            )
        finally:
            agent_db.close()

    t = threading.Thread(target=run_in_background, daemon=True)
    t.start()

    return JSONResponse({"run_id": run_id, "status": "started"})


@app.post("/agent/internal/ingest/google-ads")
async def google_ads_ingest(
    payload: IngestPayload,
    _: None = Depends(require_ingest_token),
):
    try:
        result = ingest_google_ads_payload(payload)
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


@app.post("/agent/internal/ingest/bing-ads")
async def bing_ads_ingest(
    payload: IngestPayload,
    _: None = Depends(require_ingest_token),
):
    try:
        result = ingest_bing_ads_payload(payload)
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


# ─── API — Runs List / Detail ─────────────────────────────────────────────────

@app.get("/agent/api/runs")
async def api_runs(request: Request, db: Session = Depends(get_db)):
    require_auth(request)
    runs = db.query(Run).order_by(Run.created_at.desc()).limit(30).all()
    return JSONResponse([{
        "run_id":        r.run_id,
        "status":        r.status,
        "created_at":    r.created_at.isoformat() if r.created_at else None,
        "goal":          r.goal,
        "model":         r.model,
        "iteration_count": r.iteration_count,
        "duration_seconds": r.duration_seconds,
    } for r in runs])

@app.get("/agent/api/runs/{run_id}")
async def api_run_detail(run_id: str, request: Request, db: Session = Depends(get_db)):
    require_auth(request)
    run = db.query(Run).filter_by(run_id=run_id).first()
    if not run:
        raise HTTPException(status_code=404)
    steps = db.query(RunStep).filter_by(run_id=run_id).order_by(RunStep.step_number).all()
    return JSONResponse({
        "run_id":        run.run_id,
        "status":        run.status,
        "goal":          run.goal,
        "model":         run.model,
        "iteration_count": run.iteration_count,
        "duration_seconds": run.duration_seconds,
        "final_report":  run.final_report,
        "public_report": run.public_report,
        "error_log":     json.loads(run.error_log or "[]"),
        "steps": [{
            "step_number":    s.step_number,
            "step_name":      s.step_name,
            "thought":        s.thought,
            "sql":            s.sql,
            "result_summary": s.result_summary,
            "rows_count":     s.rows_count,
        } for s in steps],
    })


# ─── API — Chat ───────────────────────────────────────────────────────────────

@app.get("/agent/api/runs/{run_id}/chat")
async def api_chat_history(run_id: str, request: Request, db: Session = Depends(get_db)):
    require_auth(request)
    msgs = db.query(RunChatMessage).filter_by(run_id=run_id).order_by(RunChatMessage.created_at).all()
    return JSONResponse([{"role": m.role, "content": m.content} for m in msgs])

@app.post("/agent/api/runs/{run_id}/chat")
async def api_chat_send(run_id: str, request: Request, db: Session = Depends(get_db)):
    require_auth(request)
    run = db.query(Run).filter_by(run_id=run_id).first()
    if not run:
        raise HTTPException(status_code=404)
    body = await request.json()
    user_msg = body.get("message", "").strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="Empty message")

    # Persist user message
    db.add(RunChatMessage(run_id=run_id, role="user", content=user_msg))
    db.commit()

    # Build context from run
    steps = db.query(RunStep).filter_by(run_id=run_id).order_by(RunStep.step_number).all()
    step_context = "\n\n".join(
        f"[{s.step_name}]\nThought: {s.thought or ''}\nSQL: {s.sql or ''}\nResult: {(s.result_summary or '')[:500]}"
        for s in steps
    )
    history = db.query(RunChatMessage).filter_by(run_id=run_id).order_by(RunChatMessage.created_at).all()

    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    system_prompt = f"""You are an expert PPC marketing analyst assistant.
You have access to a complete analysis of Weight Loss PPC campaigns (Bing + Google Ads).

RUN GOAL: {run.goal}
STATUS: {run.status}
ITERATIONS: {run.iteration_count}

INVESTIGATION STEPS:
{step_context}

FINAL REPORT SUMMARY:
{(run.public_report or '')[:2000]}

Answer questions about the analysis. When asked to run new queries, describe what you would find.
Be specific with numbers. Keep responses focused and actionable."""

    messages = [SystemMessage(content=system_prompt)]
    for msg in history[-12:]:
        if msg.role == "user":
            messages.append(HumanMessage(content=msg.content))
        else:
            messages.append(AIMessage(content=msg.content))
    messages.append(HumanMessage(content=user_msg))

    model = get_config(db, "openai_model", "gpt-4o")

    async def stream_response():
        full_response = ""
        try:
            try:
                llm = create_llm(model=model, temperature=0.3)
                for chunk in llm.stream(messages):
                    token = chunk.content
                    if token:
                        full_response += token
                        yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception:
                full_response = _build_chat_fallback(run, user_msg)
                yield f"data: {json.dumps({'token': full_response})}\n\n"
        finally:
            # Persist assistant response
            save_db = SessionLocal()
            save_db.add(RunChatMessage(run_id=run_id, role="assistant", content=full_response))
            save_db.commit()
            save_db.close()
            yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)
