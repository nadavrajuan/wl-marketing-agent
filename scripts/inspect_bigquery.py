#!/usr/bin/env python3
"""
Quick BigQuery inventory / schema inspector for the WeightAgent dataset.

Usage:
  python3 scripts/inspect_bigquery.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

from bigquery_client import (  # noqa: E402
    DATASET_ID,
    PROJECT_ID,
    get_inventory_summary,
    get_table_preview,
    get_table_schema,
    list_tables,
)


def main() -> None:
    print(f"Project: {PROJECT_ID}")
    print(f"Dataset: {DATASET_ID}")
    print()

    print("Tables:")
    for table_name in list_tables():
        print(f"- {table_name}")
    print()

    print("Inventory summary:")
    print(json.dumps(get_inventory_summary(), indent=2, default=str))
    print()

    for table_name in list_tables():
        print(f"Schema: {table_name}")
        print(json.dumps(get_table_schema(table_name), indent=2, default=str))
        print()

        preview_order = {
            "visits": "entered_at",
            "conversions": "conversion_at",
            "google_ad_data": "date",
            "bing_ad_data": "data_date",
        }.get(table_name)
        print(f"Preview: {table_name}")
        print(json.dumps(get_table_preview(table_name, limit=3, order_by=preview_order), indent=2, default=str))
        print()


if __name__ == "__main__":
    main()
