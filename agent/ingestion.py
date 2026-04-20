"""
Secure ingestion models and BigQuery persistence for Google/Bing ad enrichments.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

try:
    from bigquery_writer import (
        BING_ADS_BACKFILL_STATE,
        BING_ADS_DAILY_AD_SNAPSHOT,
        BING_ADS_DAILY_ASSET_SNAPSHOT,
        GOOGLE_ADS_BACKFILL_STATE,
        GOOGLE_ADS_DAILY_AD_SNAPSHOT,
        GOOGLE_ADS_DAILY_ASSET_PERFORMANCE,
        GOOGLE_ADS_DAILY_ASSET_SNAPSHOT,
        ensure_all_tables,
        log_job_run,
        upsert_rows,
    )
except ModuleNotFoundError:  # pragma: no cover
    from .bigquery_writer import (
        BING_ADS_BACKFILL_STATE,
        BING_ADS_DAILY_AD_SNAPSHOT,
        BING_ADS_DAILY_ASSET_SNAPSHOT,
        GOOGLE_ADS_BACKFILL_STATE,
        GOOGLE_ADS_DAILY_AD_SNAPSHOT,
        GOOGLE_ADS_DAILY_ASSET_PERFORMANCE,
        GOOGLE_ADS_DAILY_ASSET_SNAPSHOT,
        ensure_all_tables,
        log_job_run,
        upsert_rows,
    )


class IngestRecord(BaseModel):
    model_config = {"extra": "allow"}


class IngestPayload(BaseModel):
    payload_version: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    job_type: str = Field(default="daily_sync")
    snapshot_date: str = Field(..., min_length=10, max_length=10)
    customer_id: str | None = None
    customer_name: str | None = None
    account_id: str | None = None
    account_name: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    ads: list[IngestRecord] = Field(default_factory=list)
    assets: list[IngestRecord] = Field(default_factory=list)
    asset_performance: list[IngestRecord] = Field(default_factory=list)


def _normalize_snapshot_rows(
    rows: list[IngestRecord],
    snapshot_date: str,
    customer_or_account_id_field: str,
    customer_or_account_id: str | None,
    customer_or_account_name_field: str,
    customer_or_account_name: str | None,
) -> list[dict[str, Any]]:
    synced_at = datetime.now(timezone.utc)
    normalized: list[dict[str, Any]] = []
    for row in rows:
        record = row.model_dump()
        record.setdefault("snapshot_date", snapshot_date)
        if customer_or_account_id_field and customer_or_account_id:
            record.setdefault(customer_or_account_id_field, customer_or_account_id)
        if customer_or_account_name_field and customer_or_account_name:
            record.setdefault(customer_or_account_name_field, customer_or_account_name)
        record["synced_at"] = synced_at
        normalized.append(record)
    return normalized


def _update_backfill_state(
    *,
    platform: str,
    payload: IngestPayload,
    status: str,
    notes: str | None = None,
) -> None:
    record = {
        "job_type": payload.job_type,
        "source": payload.source,
        "last_attempted_date": payload.snapshot_date,
        "last_successful_date": payload.snapshot_date if status == "succeeded" else None,
        "status": status,
        "notes": notes or "",
        "updated_at": datetime.now(timezone.utc),
    }
    if platform == "google":
        record["customer_id"] = payload.customer_id or "unknown"
        upsert_rows(GOOGLE_ADS_BACKFILL_STATE, [record])
    else:
        record["account_id"] = payload.account_id or "unknown"
        upsert_rows(BING_ADS_BACKFILL_STATE, [record])


def ingest_google_ads_payload(payload: IngestPayload) -> dict[str, Any]:
    ensure_all_tables()

    ads = _normalize_snapshot_rows(
        payload.ads,
        payload.snapshot_date,
        "customer_id",
        payload.customer_id,
        "customer_name",
        payload.customer_name,
    )
    assets = _normalize_snapshot_rows(
        payload.assets,
        payload.snapshot_date,
        "customer_id",
        payload.customer_id,
        "customer_name",
        payload.customer_name,
    )
    asset_performance = _normalize_snapshot_rows(
        payload.asset_performance,
        payload.snapshot_date,
        "customer_id",
        payload.customer_id,
        "customer_name",
        payload.customer_name,
    )

    ads_count = upsert_rows(GOOGLE_ADS_DAILY_AD_SNAPSHOT, ads)
    assets_count = upsert_rows(GOOGLE_ADS_DAILY_ASSET_SNAPSHOT, assets)
    asset_perf_count = upsert_rows(GOOGLE_ADS_DAILY_ASSET_PERFORMANCE, asset_performance)
    _update_backfill_state(platform="google", payload=payload, status="succeeded")
    job_run_id = log_job_run(
        platform="google",
        source=payload.source,
        job_type=payload.job_type,
        snapshot_date=payload.snapshot_date,
        customer_or_account_id=payload.customer_id,
        payload_version=payload.payload_version,
        metadata=payload.metadata,
        ads_row_count=ads_count,
        assets_row_count=assets_count,
        asset_performance_row_count=asset_perf_count,
        status="succeeded",
    )
    return {
        "ok": True,
        "job_run_id": job_run_id,
        "ads_upserted": ads_count,
        "assets_upserted": assets_count,
        "asset_performance_upserted": asset_perf_count,
    }


def ingest_bing_ads_payload(payload: IngestPayload) -> dict[str, Any]:
    ensure_all_tables()

    ads = _normalize_snapshot_rows(
        payload.ads,
        payload.snapshot_date,
        "account_id",
        payload.account_id,
        "account_name",
        payload.account_name,
    )
    assets = _normalize_snapshot_rows(
        payload.assets,
        payload.snapshot_date,
        "account_id",
        payload.account_id,
        "account_name",
        payload.account_name,
    )

    ads_count = upsert_rows(BING_ADS_DAILY_AD_SNAPSHOT, ads)
    assets_count = upsert_rows(BING_ADS_DAILY_ASSET_SNAPSHOT, assets)
    _update_backfill_state(platform="bing", payload=payload, status="succeeded")
    job_run_id = log_job_run(
        platform="bing",
        source=payload.source,
        job_type=payload.job_type,
        snapshot_date=payload.snapshot_date,
        customer_or_account_id=payload.account_id,
        payload_version=payload.payload_version,
        metadata=payload.metadata,
        ads_row_count=ads_count,
        assets_row_count=assets_count,
        asset_performance_row_count=0,
        status="succeeded",
    )
    return {
        "ok": True,
        "job_run_id": job_run_id,
        "ads_upserted": ads_count,
        "assets_upserted": assets_count,
        "asset_performance_upserted": 0,
    }
