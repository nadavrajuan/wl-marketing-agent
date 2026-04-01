"""
Read-only PostgreSQL client for the WL Marketing Agent.
Mirrors the safety design of Codere's ReadOnlyBigQueryClient.
"""
import re
import os
from typing import Any

import psycopg2
import psycopg2.extras

DSN = os.getenv("PG_DSN", "postgresql://wl_user:wl_pass@localhost:5434/wl_marketing")

_MUTATING = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|COPY)\b",
    re.IGNORECASE,
)

MAX_ROWS = 500


def _conn():
    return psycopg2.connect(DSN)


def run_query(sql: str, max_rows: int = MAX_ROWS) -> list[dict]:
    if _MUTATING.search(sql):
        raise ValueError(f"Mutating SQL is not allowed: {sql[:100]}")
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchmany(max_rows)
            return [dict(r) for r in rows]


def get_schema_info() -> str:
    sql = """
    SELECT
        column_name,
        data_type,
        is_nullable
    FROM information_schema.columns
    WHERE table_name = 'conversions'
      AND table_schema = 'public'
    ORDER BY ordinal_position;
    """
    rows = run_query(sql, max_rows=100)
    lines = ["Table: public.conversions\n", f"{'Column':<30} {'Type':<20} {'Nullable'}", "-" * 60]
    for r in rows:
        lines.append(f"{r['column_name']:<30} {r['data_type']:<20} {r['is_nullable']}")
    return "\n".join(lines)


def get_sample_data() -> str:
    sql = """
    SELECT
        id, conversion_at, funnel_step, affiliate, value,
        platform_id, device, match_type, keyword, utm_campaign,
        campaign_id, dti, landing_page_path
    FROM conversions
    WHERE conversion_at IS NOT NULL
    ORDER BY conversion_at DESC
    LIMIT 5;
    """
    rows = run_query(sql, max_rows=5)
    if not rows:
        return "No sample data available."
    lines = []
    for r in rows:
        lines.append(str(dict(r)))
    return "\n".join(lines)


def get_quick_stats() -> dict[str, Any]:
    sql = """
    SELECT
        COUNT(*) AS total_events,
        COUNT(*) FILTER (WHERE funnel_step = 'Quiz Start') AS quiz_starts,
        COUNT(*) FILTER (WHERE funnel_step = 'Quiz Complete') AS quiz_completes,
        COUNT(*) FILTER (WHERE funnel_step = 'Purchase') AS purchases,
        COALESCE(SUM(value), 0) AS revenue,
        COUNT(DISTINCT campaign_id) AS campaigns,
        COUNT(DISTINCT keyword) AS keywords,
        MIN(conversion_at) AS date_min,
        MAX(conversion_at) AS date_max
    FROM conversions;
    """
    rows = run_query(sql, max_rows=1)
    return rows[0] if rows else {}
