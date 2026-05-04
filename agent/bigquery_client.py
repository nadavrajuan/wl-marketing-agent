"""
Read-only BigQuery client for the WL Marketing Agent.

This is intentionally conservative:
- only supports SELECT-style read queries
- centralizes dataset/project configuration
- provides a few helper functions for schema discovery and previews
"""
import re
from typing import Any

from google.cloud import bigquery

try:
    from settings import (
        get_bigquery_credentials,
        get_bigquery_dataset,
        get_google_ads_bigquery_dataset,
        get_bigquery_project_id,
    )
except ModuleNotFoundError:  # pragma: no cover
    from .settings import (
        get_bigquery_credentials,
        get_bigquery_dataset,
        get_google_ads_bigquery_dataset,
        get_bigquery_project_id,
    )

PROJECT_ID = get_bigquery_project_id()
DATASET_ID = get_bigquery_dataset()
GOOGLE_ADS_DATASET_ID = get_google_ads_bigquery_dataset()

MAX_ROWS = 500

_MUTATING = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|COPY)\b",
    re.IGNORECASE,
)


def _client() -> bigquery.Client:
    credentials = get_bigquery_credentials()
    if credentials:
        return bigquery.Client(project=PROJECT_ID, credentials=credentials)
    return bigquery.Client(project=PROJECT_ID)


def run_query(sql: str, max_rows: int = MAX_ROWS) -> list[dict[str, Any]]:
    if _MUTATING.search(sql):
        raise ValueError(f"Mutating SQL is not allowed: {sql[:100]}")

    client = _client()
    query_job = client.query(sql)
    rows = query_job.result(page_size=max_rows)

    results: list[dict[str, Any]] = []
    for idx, row in enumerate(rows):
        if idx >= max_rows:
            break
        results.append(dict(row.items()))
    return results


def list_tables() -> list[str]:
    client = _client()
    tables = client.list_tables(f"{PROJECT_ID}.{DATASET_ID}")
    return [table.table_id for table in tables]


def list_dataset_tables(dataset_id: str) -> list[str]:
    client = _client()
    tables = client.list_tables(f"{PROJECT_ID}.{dataset_id}")
    return [table.table_id for table in tables]


def list_datasets() -> list[str]:
    client = _client()
    return [dataset.dataset_id for dataset in client.list_datasets(project=PROJECT_ID)]


def get_table_schema(table_name: str) -> list[dict[str, str]]:
    client = _client()
    table = client.get_table(f"{PROJECT_ID}.{DATASET_ID}.{table_name}")
    return [
        {
            "name": field.name,
            "type": field.field_type,
            "mode": field.mode,
            "description": field.description or "",
        }
        for field in table.schema
    ]


def get_table_preview(table_name: str, limit: int = 5, order_by: str | None = None) -> list[dict[str, Any]]:
    order_clause = f" ORDER BY {order_by} DESC" if order_by else ""
    sql = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET_ID}.{table_name}`
    {order_clause}
    LIMIT {int(limit)}
    """
    return run_query(sql, max_rows=limit)


def get_inventory_summary() -> list[dict[str, Any]]:
    sql = f"""
    SELECT 'visits' AS table_name, COUNT(*) AS row_count,
           MIN(entered_at_date) AS min_date, MAX(entered_at_date) AS max_date
    FROM `{PROJECT_ID}.{DATASET_ID}.visits`
    UNION ALL
    SELECT 'conversions', COUNT(*),
           DATE(TIMESTAMP_SECONDS(MIN(conversion_at))),
           DATE(TIMESTAMP_SECONDS(MAX(conversion_at)))
    FROM `{PROJECT_ID}.{DATASET_ID}.conversions`
    UNION ALL
    SELECT 'google_ad_data', COUNT(*), MIN(date), MAX(date)
    FROM `{PROJECT_ID}.{DATASET_ID}.google_ad_data`
    UNION ALL
    SELECT 'bing_ad_data', COUNT(*), MIN(data_date), MAX(data_date)
    FROM `{PROJECT_ID}.{DATASET_ID}.bing_ad_data`
    UNION ALL
    SELECT 'google_click_stats', COUNT(*), MIN(segments_date), MAX(segments_date)
    FROM `{PROJECT_ID}.{GOOGLE_ADS_DATASET_ID}.ads_ClickStats_4808949235`
    UNION ALL
    SELECT 'google_keyword_stats', COUNT(*), MIN(segments_date), MAX(segments_date)
    FROM `{PROJECT_ID}.{GOOGLE_ADS_DATASET_ID}.ads_KeywordStats_4808949235`
    UNION ALL
    SELECT 'google_search_query_stats', COUNT(*), MIN(segments_date), MAX(segments_date)
    FROM `{PROJECT_ID}.{GOOGLE_ADS_DATASET_ID}.ads_SearchQueryStats_4808949235`
    UNION ALL
    SELECT 'google_ads_entities', COUNT(*), MIN(_DATA_DATE), MAX(_DATA_DATE)
    FROM `{PROJECT_ID}.{GOOGLE_ADS_DATASET_ID}.ads_Ad_4808949235`
    """
    return run_query(sql, max_rows=10)
