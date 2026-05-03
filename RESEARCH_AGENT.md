# Research Agent

A deep-investigation marketing research module built on LangGraph + OpenAI.

## What It Does

The Research Agent starts from a single marketing asset — a keyword, landing page variant, partner, URL, or custom question — and investigates outward through the full user funnel. It behaves like a curious senior analyst who follows interesting threads, changes direction when something is more interesting, and returns a visual presentation-style report.

## User Journey

1. User opens **Research Agent** from the sidebar (🔬).
2. Chooses research depth: **Quick Scan / Standard / Deep Dive / Extreme**.
3. Clicks **I Feel Lucky** (agent picks a starting point automatically) OR manually enters a keyword, URL, DTI, partner, etc.
4. Watches live progress as the agent works.
5. Reviews the final presentation slide-by-slide, or expands the full Research Trail.

## Architecture

### Backend (`/agent/`)

**`research_agent.py`** — LangGraph StateGraph:
```
select_starting_point → build_plan → [research_step]* → generate_slides → END
```

- `select_starting_point`: For "I Feel Lucky", queries top keywords/landing pages/partners and uses LLM to pick the most strategically interesting one and explain why.
- `build_plan`: LLM creates a numbered research plan adapted to the starting point and depth.
- `research_step` (main loop): LLM outputs one JSON action per iteration:
  - `query_data` — SQL SELECT against `public.conversions`
  - `crawl_url` — Fetch and analyze a real webpage (competitor, partner brand, landing page)
  - `record_finding` — Save evidence / hypothesis / recommendation / open_question
  - `change_direction` — Pivot with explanation
  - `finish` — End early when enough is found
- `generate_slides`: LLM converts all findings into 8–16 structured presentation slides.

**`database.py`** — Two new SQLAlchemy models:
- `ResearchRun` — One row per research run (starting point, depth, slides JSON, findings JSON, status)
- `ResearchStep` — One row per agent action (action type, thought, SQL/URL, result)

**`app.py`** — New FastAPI routes (auth via `INGEST_API_TOKEN`):
- `POST /agent/api/research/run` — Start a new research run
- `GET /agent/api/research/runs` — List runs
- `GET /agent/api/research/runs/{id}` — Get run detail with slides, findings, steps
- `GET /agent/api/research/runs/{id}/stream` — SSE stream of live step events
- `GET /agent/api/research/lucky` — Get "I Feel Lucky" candidate list

### Frontend (`/app/`)

**`/app/research/page.tsx`**
- "I Feel Lucky" button (orange, prominent)
- Manual starting point chooser (type pills + value input)
- Depth selector (Quick / Standard / Deep / Extreme)
- Previous research runs list

**`/app/research/[runId]/page.tsx`**
- Live progress view (while running): SSE stream, step-by-step activity log
- Slide viewer: Navigate slides with ← → arrows and dot nav, or jump to any slide by title
- Research trail: Full step-by-step breakdown with collapsible SQL/crawl source and results

**`/app/api/research/route.ts`** — Proxy: GET list / POST start
**`/app/api/research/[runId]/route.ts`** — Proxy: GET run detail
**`/app/api/research/[runId]/stream/route.ts`** — SSE proxy: pipe agent SSE to browser

## Environment Variables

### Next.js (`app/.env`)
```
AGENT_INTERNAL_URL=http://localhost:8001        # Dev
# AGENT_INTERNAL_URL=http://agent:8003          # Docker/prod
INGEST_API_TOKEN=<same value as agent>
```

### Agent (`agent/.env`)
No new variables needed. Uses existing `INGEST_API_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `PG_DSN`.

## Depth → Iterations

| Depth | Iterations | Expected runtime |
|-------|-----------|-----------------|
| Quick Scan | 4 | ~2 min |
| Standard | 8 | ~5 min |
| Deep Dive | 14 | ~10 min |
| Extreme | 20 | ~20 min |

## Slide Types

| Type | Purpose |
|------|---------|
| `executive_summary` | Always first — 3-5 sentence overview |
| `starting_point` | What was investigated |
| `why_interesting` | Why this starting point matters |
| `research_plan` | The investigation plan |
| `data_insight` | Key data finding with numbers |
| `funnel_view` | Funnel map for this asset |
| `hypothesis` | A specific marketing hypothesis (with evidence + confidence) |
| `recommendation` | Specific testable recommendation (with impact, effort, metric) |
| `competitor_note` | Competitor pattern or observation |
| `open_questions` | Unanswered questions |
| `next_paths` | Always last — suggested next research directions |

## Agent Mindset (Core Prompt)

The agent:
- Distinguishes **evidence** / **assumption** / **hypothesis** / **recommendation** / **open question**
- Never recommends without stating the evidence and confidence level
- Understands EPC vs EPV (doesn't over-value partners with high EPC but low click share)
- Treats RSA ads as already-testing systems (soft optimization, not "create more ads")
- Never copies competitors blindly ("competitor X may be doing Y for these reasons; worth tracking but not copying blindly")
- Produces a clean research trail visible to the user — not hidden chain-of-thought

## Implementation Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-03 | Claude Code | Initial implementation — `research_agent.py`, new DB models, FastAPI routes, Next.js pages |

## Next Steps / Known Gaps

- [ ] Add BigQuery support to `research_step` for BigQuery-specific queries (visits, ad snapshots)
- [ ] Add screenshot capture for crawled pages (would require Playwright)
- [ ] Build "patterns across runs" view — surface recurring findings from multiple runs
- [ ] Add "Stop" button that gracefully ends a running research session with partial output
- [ ] Add email notification when a Deep/Extreme run completes
- [ ] Compare two research runs side-by-side
