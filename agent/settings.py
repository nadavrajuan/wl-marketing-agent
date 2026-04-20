"""
Runtime settings helpers for the WL Marketing Agent.

All production secrets must come from environment variables or a local `.env`
file that is never committed to git.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google.oauth2 import service_account


load_dotenv(dotenv_path=Path(__file__).with_name(".env"), override=False)


def get_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    if value is None:
        return None
    value = value.strip()
    return value or None


def require_env(name: str) -> str:
    value = get_env(name)
    if value is None:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_bigquery_project_id() -> str:
    return get_env("BIGQUERY_PROJECT_ID", "weightagent") or "weightagent"


def get_bigquery_dataset() -> str:
    return get_env("BIGQUERY_DATASET", "WeightAgent") or "WeightAgent"


def get_bigquery_credentials() -> service_account.Credentials | None:
    raw_json = get_env("BIGQUERY_SERVICE_ACCOUNT_JSON")
    if raw_json:
        return service_account.Credentials.from_service_account_info(json.loads(raw_json))

    credentials_path = get_env("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_path:
        return service_account.Credentials.from_service_account_file(credentials_path)

    return None


def get_bigquery_credentials_info() -> dict[str, Any] | None:
    raw_json = get_env("BIGQUERY_SERVICE_ACCOUNT_JSON")
    if raw_json:
        return json.loads(raw_json)
    return None
