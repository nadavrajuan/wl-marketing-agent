"""
SQLAlchemy models and DB helpers for the WL Marketing Agent.
Stores: runs, run_steps, prompts, app_config, run_chat_messages, users.
"""
import json
import hashlib
import os
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    create_engine, Column, Integer, String, Text, Float, DateTime,
    Boolean, ForeignKey, event
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy.pool import StaticPool

try:
    from settings import require_env
except ModuleNotFoundError:  # pragma: no cover
    from .settings import require_env

DATABASE_URL = require_env("AGENT_DB_URL")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    poolclass=StaticPool if "sqlite" in DATABASE_URL else None,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


# ─── Models ──────────────────────────────────────────────────────────────────

class Run(Base):
    __tablename__ = "runs"
    run_id         = Column(String, primary_key=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    mode           = Column(String, default="full")   # full | custom
    status         = Column(String, default="running")  # running | completed | failed
    final_report   = Column(Text, nullable=True)
    public_report  = Column(Text, nullable=True)
    error_log      = Column(Text, default="[]")
    insights       = Column(Text, default="[]")   # JSON list of key findings
    iteration_count= Column(Integer, default=0)
    duration_seconds= Column(Float, nullable=True)
    model          = Column(String, nullable=True)
    goal           = Column(Text, nullable=True)   # Custom goal for this run


class RunStep(Base):
    __tablename__ = "run_steps"
    id             = Column(Integer, primary_key=True, autoincrement=True)
    run_id         = Column(String, ForeignKey("runs.run_id"))
    step_number    = Column(Integer)
    step_name      = Column(String)
    thought        = Column(Text, nullable=True)
    sql            = Column(Text, nullable=True)
    result_summary = Column(Text, nullable=True)
    rows_count     = Column(Integer, default=0)
    created_at     = Column(DateTime, default=datetime.utcnow)


class Prompt(Base):
    __tablename__ = "prompts"
    name         = Column(String, primary_key=True)
    display_name = Column(String)
    description  = Column(String)
    content      = Column(Text)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppConfig(Base):
    __tablename__ = "app_config"
    key   = Column(String, primary_key=True)
    value = Column(Text)


class RunChatMessage(Base):
    __tablename__ = "run_chat_messages"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    run_id     = Column(String, ForeignKey("runs.run_id"))
    role       = Column(String)   # user | assistant
    content    = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    username     = Column(String, primary_key=True)
    password_hash= Column(String)
    is_admin     = Column(Boolean, default=False)
    is_active    = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


class ResearchRun(Base):
    __tablename__ = "research_runs"
    run_id               = Column(String, primary_key=True)
    created_at           = Column(DateTime, default=datetime.utcnow)
    status               = Column(String, default="running")  # running | completed | failed | stopped
    starting_point_type  = Column(String)   # keyword | url | landing_page | campaign | partner | brand | competitor_url | question | lucky
    starting_point_value = Column(Text)
    starting_point_reason= Column(Text)
    depth                = Column(String, default="standard")  # quick | standard | deep | extreme
    research_plan        = Column(Text)
    slides_json          = Column(Text, default="[]")
    findings_json        = Column(Text, default="[]")
    executive_summary    = Column(Text)
    model                = Column(String)
    iteration_count      = Column(Integer, default=0)
    duration_seconds     = Column(Float, nullable=True)
    error_log            = Column(Text, default="[]")


class ResearchStep(Base):
    __tablename__ = "research_steps"
    id             = Column(Integer, primary_key=True, autoincrement=True)
    run_id         = Column(String, ForeignKey("research_runs.run_id"))
    step_number    = Column(Integer)
    action_type    = Column(String)   # query_data | crawl_url | record_finding | change_direction | build_plan | generate_slides
    title          = Column(String)
    thought        = Column(Text)
    data_source    = Column(Text)     # SQL or URL
    data_result    = Column(Text)
    finding_type   = Column(String)   # evidence | hypothesis | recommendation | open_question
    finding_content= Column(Text)
    confidence     = Column(String)   # low | medium | high
    created_at     = Column(DateTime, default=datetime.utcnow)


# ─── DB Helpers ──────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    _seed_prompts(db)
    _seed_config(db)
    _seed_admin(db)
    db.close()


def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def _seed_admin(db: Session):
    username = require_env("ADMIN_USERNAME")
    password = require_env("ADMIN_PASSWORD")
    if not db.query(User).filter_by(username=username).first():
        db.add(User(username=username, password_hash=_hash(password), is_admin=True))
        db.commit()


def _seed_config(db: Session):
    defaults = {
        "max_iterations": "6",
        "openai_model": os.getenv("OPENAI_MODEL", "gpt-4o"),
        "email_recipients": "",
    }
    for k, v in defaults.items():
        if not db.query(AppConfig).filter_by(key=k).first():
            db.add(AppConfig(key=k, value=v))
    db.commit()


def get_config(db: Session, key: str, default=None):
    row = db.query(AppConfig).filter_by(key=key).first()
    return row.value if row else default


def set_config(db: Session, key: str, value: str):
    row = db.query(AppConfig).filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.add(AppConfig(key=key, value=value))
    db.commit()


def get_prompt(db: Session, name: str) -> str:
    row = db.query(Prompt).filter_by(name=name).first()
    if row:
        return row.content
    return DEFAULT_PROMPTS.get(name, {}).get("content", "")


def save_step(db: Session, run_id: str, step_number: int, step_name: str,
              thought: str = "", sql: str = "", result_summary: str = "", rows_count: int = 0):
    db.add(RunStep(
        run_id=run_id, step_number=step_number, step_name=step_name,
        thought=thought, sql=sql, result_summary=result_summary, rows_count=rows_count
    ))
    db.commit()


def update_run(db: Session, run_id: str, **kwargs):
    db.query(Run).filter_by(run_id=run_id).update(kwargs)
    db.commit()


def authenticate(db: Session, username: str, password: str) -> Optional[User]:
    user = db.query(User).filter_by(username=username, is_active=True).first()
    if user and user.password_hash == _hash(password):
        return user
    return None


# ─── Default Prompts ─────────────────────────────────────────────────────────

DEFAULT_PROMPTS = {
    "domain_context": {
        "display_name": "Domain Context",
        "description": "Business domain knowledge injected into all agent prompts",
        "content": """You are an expert PPC marketing analyst specializing in Weight Loss (GLP-1/GLP-1 adjacent) campaigns running on Bing Ads and Google Ads.

BUSINESS CONTEXT:
- Site: top5weightchoices.com — a comparison/review site for weight loss medications
- Goal: MAXIMUM PURCHASES at MINIMUM COST (maximize ROAS, minimize CPA)
- Date range: September 2025 – March 2026 (7 months of data)

KEY METRICS (all derived from the conversions table):
- Quiz Start: User begins the quiz on landing page — top-of-funnel entry
- Quiz Complete: User finishes the quiz — strong intent signal (~44.6% of Quiz Starts)
- Add to Cart: User adds product on affiliate site
- Lead: User submits lead form (Ro affiliate)
- Purchase: User completes a paid subscription — THE PRIMARY GOAL
- Revenue: Sum of value column (avg ~$255/purchase)
- CVR (Conversion Rate): Purchases / Quiz Starts × 100
- Quiz Completion Rate: Quiz Completes / Quiz Starts × 100
- CPA (Cost Per Acquisition): Not available in this data, but lower events-per-purchase = better efficiency

PLATFORMS & DIMENSIONS:
- platform_id: 'bing' (64% of events), 'google' (24%), 'organic' (1.4%)
- network: 'o' = Bing search, 'g' = Google search, 's' = Syndication, 'a' = App
- device: 'c' = Desktop/Computer, 'm' = Mobile, 't' = Tablet
- match_type: 'e' = Exact, 'p' = Phrase, 'b' = Broad
- dti: Landing page variant code (A/B test ID) — e.g. 'r4', 'j4', 'i2'

AFFILIATES (in conversion_type / affiliate field):
- Medvi: Main affiliate, full funnel (Quiz Start → Purchase)
- Ro: Lead + Add to Cart model
- SkinnyRX: Full funnel
- Sprout: Full funnel
- Eden, Hers, Remedy: Small volume

CAMPAIGN NAMING CONVENTION (utm_campaign):
  Format: {Type}-{Category}-[{keyword}]-{lang}-{device}-{country}
  Examples:
    Search-generics-[tirzepatide]-en-dt-us        → Desktop search targeting "tirzepatide"
    Search-generics-[tirzepatide]-en-mob-us        → Mobile search
    Search-brands-[skinnyrx]-en-dt-us              → Brand campaign
    PMAX-generics-en-all-us                        → Performance Max (Google)
    Search-generics-[tirzepatide]-en-dt-us-MMA     → Variant with different bidding strategy

TOP KEYWORDS (by volume): tirzepatide, tirzepatide for weight loss, semaglutide for weight loss,
  zepbound, glp 1 pills, weight loss pills, ro weight loss, mounjaro, wegovy, compounded tirzepatide

DATABASE TABLE: public.conversions (15,435 rows)
All monetary values are in USD. Timestamps are stored as TIMESTAMPTZ.
""",
    },

    "investigation_playbook": {
        "display_name": "Investigation Playbook",
        "description": "Step-by-step instructions for what to investigate and in what order",
        "content": """INVESTIGATION PLAYBOOK — WL PPC Marketing Analysis

Your mission: Find actionable insights to MAXIMIZE PURCHASES and MINIMIZE COST.
Always quantify findings with numbers. Flag what's working AND what's not.

PHASE 1 — OVERALL PERFORMANCE BASELINE
- Total events, quiz starts, quiz completes, purchases, revenue
- Overall CVR (purchases / quiz starts), quiz completion rate
- Date range coverage and monthly trend (is performance improving or declining?)

PHASE 2 — PLATFORM ANALYSIS
- Compare Bing vs Google: events, purchases, CVR, revenue
- Which platform drives more efficient purchases?
- Check if one platform has unusually high or low quiz completion rate

PHASE 3 — CAMPAIGN PERFORMANCE
- Rank campaigns by: (a) total purchases, (b) CVR, (c) revenue
- Identify the top 3 best-performing campaigns and WHY
- Identify the top 3 worst-performing campaigns (high events but 0 purchases = waste)
- Check if MMA variants outperform their counterparts

PHASE 4 — KEYWORD ANALYSIS
- Top keywords by purchase volume
- Top keywords by CVR (purchases / quiz_starts)
- Keywords with high volume but 0 purchases = candidates for pausing
- Brand keywords vs generic drug keywords vs competitor keywords performance comparison

PHASE 5 — DEVICE ANALYSIS
- Desktop vs Mobile: CVR, purchases, revenue
- Is there a significant device CVR gap? Should bids be adjusted?

PHASE 6 — MATCH TYPE ANALYSIS
- Exact vs Phrase vs Broad: CVR, purchase rate, revenue
- Which match type delivers the best efficiency?
- Is broad match driving volume but no conversions?

PHASE 7 — LANDING PAGE VARIANT (DTI) ANALYSIS
- Which DTI variant has the highest purchase rate?
- Which DTI variant has the highest quiz completion rate?
- Identify clear A/B test winner and loser

PHASE 8 — AFFILIATE ANALYSIS
- Which affiliate drives the most purchases?
- Which affiliate has the best funnel conversion rates?
- Any affiliates with high quiz starts but no purchases?

PHASE 9 — TIME ANALYSIS
- Monthly performance trend (is it improving?)
- Any seasonal patterns or anomalies?
- Recent vs historical performance comparison

MANDATORY COVERAGE: You must address phases 1-5 at minimum. Phases 6-9 if iterations allow.
Always end with: TOP 5 ACTIONABLE RECOMMENDATIONS with expected impact.
""",
    },

    "sql_reference": {
        "display_name": "SQL Reference",
        "description": "PostgreSQL query examples and rules for the conversions table",
        "content": """SQL REFERENCE — conversions table (PostgreSQL)

SCHEMA SUMMARY:
  conversions (
    id SERIAL PK,
    value NUMERIC(10,2),          -- revenue, 0 for non-purchase events
    conversion_at TIMESTAMPTZ,    -- event timestamp (UTC)
    platform_id TEXT,             -- 'bing' | 'google' | 'organic'
    network TEXT,                 -- 'o'=bing_search | 'g'=google | 's'=syndication
    device TEXT,                  -- 'c'=desktop | 'm'=mobile | 't'=tablet
    match_type TEXT,              -- 'e'=exact | 'p'=phrase | 'b'=broad
    funnel_step TEXT,             -- 'Quiz Start' | 'Quiz Complete' | 'Add to Cart' | 'Lead' | 'Purchase'
    affiliate TEXT,               -- 'Medvi' | 'Ro' | 'SkinnyRX' | 'Sprout' | 'Eden' | 'Hers' | 'Remedy'
    campaign_id BIGINT,
    adgroup_id BIGINT,
    keyword TEXT,                 -- search keyword (extracted from URL)
    utm_campaign TEXT,            -- campaign name string
    dti TEXT,                     -- landing page variant (A/B test)
    landing_page_path TEXT,
    user_country TEXT,
    loc_physical_ms BIGINT
  )

QUERY RULES:
1. Always use table name: conversions (no schema prefix needed)
2. Use NULLIF to avoid division by zero: x / NULLIF(y, 0)
3. Cast counts to NUMERIC for percentage: COUNT(*)::numeric / NULLIF(...)
4. Use ROUND(..., 2) for percentages and monetary values
5. Filter NULL platform_id with: WHERE platform_id IS NOT NULL
6. Date filtering: WHERE conversion_at >= '2025-09-01' AND conversion_at < '2026-04-01'
7. Max rows returned: 500 (agent limit)
8. No INSERT/UPDATE/DELETE/DROP allowed

USEFUL QUERY PATTERNS:

-- Overall funnel
SELECT
  COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS quiz_starts,
  COUNT(*) FILTER (WHERE funnel_step = 'Quiz Complete') AS quiz_completes,
  COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
  SUM(value) AS revenue,
  ROUND(COUNT(*) FILTER (WHERE funnel_step = 'Purchase')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start'), 0) * 100, 2) AS cvr_pct
FROM conversions;

-- Campaign performance
SELECT campaign_id, MAX(utm_campaign) AS name,
  COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS starts,
  COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
  SUM(value) AS revenue,
  ROUND(COUNT(*) FILTER (WHERE funnel_step = 'Purchase')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start'), 0) * 100, 2) AS cvr
FROM conversions WHERE campaign_id IS NOT NULL
GROUP BY campaign_id ORDER BY purchases DESC LIMIT 20;

-- Keyword performance
SELECT keyword,
  COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS starts,
  COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
  SUM(value) AS revenue,
  ROUND(COUNT(*) FILTER (WHERE funnel_step = 'Purchase')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start'), 0) * 100, 2) AS cvr
FROM conversions WHERE keyword IS NOT NULL
GROUP BY keyword ORDER BY purchases DESC LIMIT 30;

-- Monthly trend
SELECT DATE_TRUNC('month', conversion_at) AS month,
  COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS starts,
  COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
  SUM(value) AS revenue
FROM conversions WHERE conversion_at IS NOT NULL
GROUP BY 1 ORDER BY 1;
""",
    },

    "plan_system": {
        "display_name": "PLAN Node — System",
        "description": "System prompt for the PLAN node (builds investigation strategy)",
        "content": """{domain_context}

You are building an investigation plan for a PPC marketing analysis session.
Your plan should be a numbered list of specific SQL queries to run, ordered by priority.
Each step should state: what to query, what metric to compute, and what insight to look for.
Be specific and actionable. Cover the most impactful dimensions first.""",
    },

    "plan_human": {
        "display_name": "PLAN Node — Human",
        "description": "Human template for the PLAN node",
        "content": """{investigation_playbook}

{sql_reference}

GOAL FOR THIS RUN: {goal}

Schema info from the live database:
{schema_info}

Sample data preview:
{sample_data}

Build a numbered investigation plan (max 8 steps). Each step must specify:
1. What SQL query to run (describe it, not write it yet)
2. What metric/insight you expect to extract
3. Why it matters for the optimization goal

Start with the highest-impact analysis first.""",
    },

    "query_system": {
        "display_name": "QUERY Node — System",
        "description": "System prompt for the QUERY node (writes PostgreSQL SQL)",
        "content": """{domain_context}

{sql_reference}

You write precise PostgreSQL SQL queries to analyze PPC marketing performance.
Rules:
- Return ONLY the SQL query, no explanation, no markdown fences
- Use NULLIF to avoid division by zero
- ROUND percentages to 2 decimal places
- Limit results to 50 rows max using LIMIT
- Never use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE""",
    },

    "query_human": {
        "display_name": "QUERY Node — Human",
        "description": "Human template for the QUERY node",
        "content": """Investigation plan:
{investigation_plan}

Queries already executed (do not repeat these):
{queries_executed}

Current findings so far:
{findings}

Step to execute now: {current_step_name}

Write the PostgreSQL SQL query for this step. Return ONLY the SQL, nothing else.""",
    },

    "analyze_system": {
        "display_name": "ANALYZE Node — System",
        "description": "System prompt for the ANALYZE node (interprets query results)",
        "content": """{domain_context}

You are a sharp PPC marketing analyst. You interpret SQL query results and extract actionable insights.
Always:
- Quantify findings (use actual numbers from the results)
- Flag anomalies (unusually high/low CVR, zero-purchase high-volume segments)
- Compare against the overall baseline where relevant
- Rate each finding: [HIGH IMPACT], [MEDIUM IMPACT], [LOW IMPACT]
- Be direct and specific — no fluff""",
    },

    "analyze_human": {
        "display_name": "ANALYZE Node — Human",
        "description": "Human template for the ANALYZE node",
        "content": """Step analyzed: {current_step_name}

SQL executed:
{current_query}

Query results:
{current_result}

Overall context (findings so far):
{findings}

Analyze these results. What does this tell us about the campaigns?
What is working? What is not? Any anomalies or surprises?
Rate the impact of each finding and add to cumulative findings.""",
    },

    "report_system": {
        "display_name": "REPORT Node — System",
        "description": "System prompt for the REPORT node (generates final reports)",
        "content": """{domain_context}

You write two versions of a PPC marketing analysis report:

TECHNICAL REPORT: Full detail, includes all findings, SQL queries, numbers, anomalies.
Audience: The marketing team and campaign managers.

EXECUTIVE REPORT: High-level summary, just the key insights and top 5 recommendations.
No SQL. Tables welcome. Audience: Business owner/decision maker.

Format both reports in clean markdown with headers, bullet points, and tables where useful.""",
    },

    "report_human": {
        "display_name": "REPORT Node — Human",
        "description": "Human template for the REPORT node",
        "content": """All investigation steps completed. Here are all findings:

{findings}

Queries executed:
{queries_executed}

Goal of this analysis: {goal}

Write BOTH reports now, separated by exactly this divider:
===EXECUTIVE_REPORT===

Start with the TECHNICAL REPORT (comprehensive, with numbers and SQL references).
Then the divider line.
Then the EXECUTIVE REPORT (top insights + top 5 recommendations with expected impact).

The executive report should end with a clear prioritized action list.""",
    },
}


def _seed_prompts(db: Session):
    for name, data in DEFAULT_PROMPTS.items():
        if not db.query(Prompt).filter_by(name=name).first():
            db.add(Prompt(
                name=name,
                display_name=data["display_name"],
                description=data["description"],
                content=data["content"],
            ))
    db.commit()
