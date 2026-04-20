"""
BigQuery write helpers for ingestion pipelines.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from google.cloud import bigquery

try:
    from settings import (
        get_bigquery_credentials,
        get_bigquery_dataset,
        get_bigquery_project_id,
    )
except ModuleNotFoundError:  # pragma: no cover
    from .settings import (
        get_bigquery_credentials,
        get_bigquery_dataset,
        get_bigquery_project_id,
    )


@dataclass(frozen=True)
class TableSpec:
    table_name: str
    schema: list[bigquery.SchemaField]
    unique_keys: list[str]


PROJECT_ID = get_bigquery_project_id()
DATASET_ID = get_bigquery_dataset()


GOOGLE_ADS_DAILY_AD_SNAPSHOT = TableSpec(
    table_name="google_ads_daily_ad_snapshot",
    schema=[
        bigquery.SchemaField("snapshot_date", "DATE", mode="REQUIRED"),
        bigquery.SchemaField("customer_id", "STRING"),
        bigquery.SchemaField("customer_name", "STRING"),
        bigquery.SchemaField("campaign_id", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("campaign_status", "STRING"),
        bigquery.SchemaField("ad_group_id", "STRING"),
        bigquery.SchemaField("ad_group_name", "STRING"),
        bigquery.SchemaField("ad_group_status", "STRING"),
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("ad_name", "STRING"),
        bigquery.SchemaField("ad_type", "STRING"),
        bigquery.SchemaField("ad_status", "STRING"),
        bigquery.SchemaField("policy_summary", "STRING"),
        bigquery.SchemaField("final_url", "STRING"),
        bigquery.SchemaField("mobile_final_url", "STRING"),
        bigquery.SchemaField("labels_json", "STRING"),
        bigquery.SchemaField("headline_count", "INT64"),
        bigquery.SchemaField("description_count", "INT64"),
        bigquery.SchemaField("raw_ad_json", "STRING"),
        bigquery.SchemaField("synced_at", "TIMESTAMP"),
    ],
    unique_keys=["snapshot_date", "customer_id", "campaign_id", "ad_group_id", "ad_id"],
)

GOOGLE_ADS_DAILY_ASSET_SNAPSHOT = TableSpec(
    table_name="google_ads_daily_asset_snapshot",
    schema=[
        bigquery.SchemaField("snapshot_date", "DATE", mode="REQUIRED"),
        bigquery.SchemaField("customer_id", "STRING"),
        bigquery.SchemaField("customer_name", "STRING"),
        bigquery.SchemaField("campaign_id", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("ad_group_id", "STRING"),
        bigquery.SchemaField("ad_group_name", "STRING"),
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("asset_id", "STRING"),
        bigquery.SchemaField("asset_source", "STRING"),
        bigquery.SchemaField("field_type", "STRING"),
        bigquery.SchemaField("asset_type", "STRING"),
        bigquery.SchemaField("text", "STRING"),
        bigquery.SchemaField("pinned_field", "STRING"),
        bigquery.SchemaField("raw_asset_json", "STRING"),
        bigquery.SchemaField("synced_at", "TIMESTAMP"),
    ],
    unique_keys=["snapshot_date", "customer_id", "campaign_id", "ad_group_id", "ad_id", "asset_id", "field_type"],
)

GOOGLE_ADS_DAILY_ASSET_PERFORMANCE = TableSpec(
    table_name="google_ads_daily_asset_performance",
    schema=[
        bigquery.SchemaField("snapshot_date", "DATE", mode="REQUIRED"),
        bigquery.SchemaField("customer_id", "STRING"),
        bigquery.SchemaField("customer_name", "STRING"),
        bigquery.SchemaField("campaign_id", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("ad_group_id", "STRING"),
        bigquery.SchemaField("ad_group_name", "STRING"),
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("asset_id", "STRING"),
        bigquery.SchemaField("asset_source", "STRING"),
        bigquery.SchemaField("field_type", "STRING"),
        bigquery.SchemaField("performance_label", "STRING"),
        bigquery.SchemaField("impressions", "INT64"),
        bigquery.SchemaField("clicks", "INT64"),
        bigquery.SchemaField("cost_micros", "INT64"),
        bigquery.SchemaField("conversions", "FLOAT64"),
        bigquery.SchemaField("raw_metrics_json", "STRING"),
        bigquery.SchemaField("synced_at", "TIMESTAMP"),
    ],
    unique_keys=["snapshot_date", "customer_id", "campaign_id", "ad_group_id", "ad_id", "asset_id", "field_type"],
)

BING_ADS_DAILY_AD_SNAPSHOT = TableSpec(
    table_name="bing_ads_daily_ad_snapshot",
    schema=[
        bigquery.SchemaField("snapshot_date", "DATE", mode="REQUIRED"),
        bigquery.SchemaField("account_id", "STRING"),
        bigquery.SchemaField("account_name", "STRING"),
        bigquery.SchemaField("campaign_id", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("campaign_status", "STRING"),
        bigquery.SchemaField("ad_group_id", "STRING"),
        bigquery.SchemaField("ad_group_name", "STRING"),
        bigquery.SchemaField("ad_group_status", "STRING"),
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("ad_type", "STRING"),
        bigquery.SchemaField("ad_status", "STRING"),
        bigquery.SchemaField("final_url", "STRING"),
        bigquery.SchemaField("mobile_final_url", "STRING"),
        bigquery.SchemaField("raw_ad_json", "STRING"),
        bigquery.SchemaField("synced_at", "TIMESTAMP"),
    ],
    unique_keys=["snapshot_date", "account_id", "campaign_id", "ad_group_id", "ad_id"],
)

BING_ADS_DAILY_ASSET_SNAPSHOT = TableSpec(
    table_name="bing_ads_daily_asset_snapshot",
    schema=[
        bigquery.SchemaField("snapshot_date", "DATE", mode="REQUIRED"),
        bigquery.SchemaField("account_id", "STRING"),
        bigquery.SchemaField("account_name", "STRING"),
        bigquery.SchemaField("campaign_id", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("ad_group_id", "STRING"),
        bigquery.SchemaField("ad_group_name", "STRING"),
        bigquery.SchemaField("ad_id", "STRING"),
        bigquery.SchemaField("asset_id", "STRING"),
        bigquery.SchemaField("field_type", "STRING"),
        bigquery.SchemaField("text", "STRING"),
        bigquery.SchemaField("pinned_field", "STRING"),
        bigquery.SchemaField("raw_asset_json", "STRING"),
        bigquery.SchemaField("synced_at", "TIMESTAMP"),
    ],
    unique_keys=["snapshot_date", "account_id", "campaign_id", "ad_group_id", "ad_id", "asset_id", "field_type"],
)

GOOGLE_ADS_BACKFILL_STATE = TableSpec(
    table_name="google_ads_backfill_state",
    schema=[
        bigquery.SchemaField("customer_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("job_type", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("source", "STRING"),
        bigquery.SchemaField("last_attempted_date", "DATE"),
        bigquery.SchemaField("last_successful_date", "DATE"),
        bigquery.SchemaField("status", "STRING"),
        bigquery.SchemaField("notes", "STRING"),
        bigquery.SchemaField("updated_at", "TIMESTAMP"),
    ],
    unique_keys=["customer_id", "job_type"],
)

BING_ADS_BACKFILL_STATE = TableSpec(
    table_name="bing_ads_backfill_state",
    schema=[
        bigquery.SchemaField("account_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("job_type", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("source", "STRING"),
        bigquery.SchemaField("last_attempted_date", "DATE"),
        bigquery.SchemaField("last_successful_date", "DATE"),
        bigquery.SchemaField("status", "STRING"),
        bigquery.SchemaField("notes", "STRING"),
        bigquery.SchemaField("updated_at", "TIMESTAMP"),
    ],
    unique_keys=["account_id", "job_type"],
)

INGESTION_JOB_RUNS = TableSpec(
    table_name="ingestion_job_runs",
    schema=[
        bigquery.SchemaField("job_run_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("platform", "STRING"),
        bigquery.SchemaField("source", "STRING"),
        bigquery.SchemaField("job_type", "STRING"),
        bigquery.SchemaField("snapshot_date", "DATE"),
        bigquery.SchemaField("customer_or_account_id", "STRING"),
        bigquery.SchemaField("status", "STRING"),
        bigquery.SchemaField("ads_row_count", "INT64"),
        bigquery.SchemaField("assets_row_count", "INT64"),
        bigquery.SchemaField("asset_performance_row_count", "INT64"),
        bigquery.SchemaField("error_message", "STRING"),
        bigquery.SchemaField("received_at", "TIMESTAMP"),
        bigquery.SchemaField("payload_version", "STRING"),
        bigquery.SchemaField("metadata_json", "STRING"),
    ],
    unique_keys=["job_run_id"],
)


TABLE_SPECS = {
    spec.table_name: spec
    for spec in [
        GOOGLE_ADS_DAILY_AD_SNAPSHOT,
        GOOGLE_ADS_DAILY_ASSET_SNAPSHOT,
        GOOGLE_ADS_DAILY_ASSET_PERFORMANCE,
        GOOGLE_ADS_BACKFILL_STATE,
        BING_ADS_DAILY_AD_SNAPSHOT,
        BING_ADS_DAILY_ASSET_SNAPSHOT,
        BING_ADS_BACKFILL_STATE,
        INGESTION_JOB_RUNS,
    ]
}


def _client() -> bigquery.Client:
    credentials = get_bigquery_credentials()
    if credentials:
        return bigquery.Client(project=PROJECT_ID, credentials=credentials)
    return bigquery.Client(project=PROJECT_ID)


def _table_ref(table_name: str) -> str:
    return f"{PROJECT_ID}.{DATASET_ID}.{table_name}"


def _serialize_row(row: dict[str, Any], spec: TableSpec) -> dict[str, Any]:
    serialized = dict(row)
    for field in spec.schema:
        value = serialized.get(field.name)
        if isinstance(value, (dict, list)):
            serialized[field.name] = json.dumps(value, sort_keys=True, ensure_ascii=True)
        elif isinstance(value, datetime):
            serialized[field.name] = value.astimezone(timezone.utc).isoformat()
    return serialized


def ensure_table(table_spec: TableSpec) -> None:
    client = _client()
    table_id = _table_ref(table_spec.table_name)
    try:
        client.get_table(table_id)
    except Exception:
        table = bigquery.Table(table_id, schema=table_spec.schema)
        client.create_table(table)


def ensure_all_tables() -> None:
    for spec in TABLE_SPECS.values():
        ensure_table(spec)


def upsert_rows(table_spec: TableSpec, rows: list[dict[str, Any]]) -> int:
    if not rows:
        ensure_table(table_spec)
        return 0

    client = _client()
    ensure_table(table_spec)

    staging_name = f"_staging_{table_spec.table_name}_{uuid.uuid4().hex}"
    staging_id = _table_ref(staging_name)
    destination_id = _table_ref(table_spec.table_name)

    load_job = client.load_table_from_json(
        [_serialize_row(row, table_spec) for row in rows],
        staging_id,
        job_config=bigquery.LoadJobConfig(
            schema=table_spec.schema,
            write_disposition="WRITE_TRUNCATE",
        ),
    )
    load_job.result()

    assignments = ", ".join(
        f"{field.name} = src.{field.name}"
        for field in table_spec.schema
        if field.name not in table_spec.unique_keys
    )
    insert_columns = ", ".join(field.name for field in table_spec.schema)
    insert_values = ", ".join(f"src.{field.name}" for field in table_spec.schema)
    merge_condition = " AND ".join(f"dest.{key} = src.{key}" for key in table_spec.unique_keys)

    merge_sql = f"""
    MERGE `{destination_id}` dest
    USING `{staging_id}` src
    ON {merge_condition}
    WHEN MATCHED THEN UPDATE SET {assignments}
    WHEN NOT MATCHED THEN INSERT ({insert_columns}) VALUES ({insert_values})
    """
    try:
        client.query(merge_sql).result()
    finally:
        client.delete_table(staging_id, not_found_ok=True)

    return len(rows)


def log_job_run(
    *,
    platform: str,
    source: str,
    job_type: str,
    snapshot_date: str,
    customer_or_account_id: str | None,
    payload_version: str,
    metadata: dict[str, Any] | None,
    ads_row_count: int,
    assets_row_count: int,
    asset_performance_row_count: int,
    status: str,
    error_message: str | None = None,
) -> str:
    job_run_id = uuid.uuid4().hex
    upsert_rows(
        INGESTION_JOB_RUNS,
        [
            {
                "job_run_id": job_run_id,
                "platform": platform,
                "source": source,
                "job_type": job_type,
                "snapshot_date": snapshot_date,
                "customer_or_account_id": customer_or_account_id,
                "status": status,
                "ads_row_count": ads_row_count,
                "assets_row_count": assets_row_count,
                "asset_performance_row_count": asset_performance_row_count,
                "error_message": error_message,
                "received_at": datetime.now(timezone.utc),
                "payload_version": payload_version,
                "metadata_json": metadata or {},
            }
        ],
    )
    return job_run_id
