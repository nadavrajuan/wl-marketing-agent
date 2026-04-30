#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${COMPETITOR_SYNC_BASE_URL:-}" ]]; then
  echo "COMPETITOR_SYNC_BASE_URL is required, for example https://wl.rajuan.app"
  exit 1
fi

if [[ -z "${COMPETITOR_SYNC_TOKEN:-}" ]]; then
  echo "COMPETITOR_SYNC_TOKEN is required"
  exit 1
fi

AUTH_ARGS=()
if [[ -n "${WL_BASIC_AUTH_USERNAME:-}" && -n "${WL_BASIC_AUTH_PASSWORD:-}" ]]; then
  AUTH_ARGS=(-u "${WL_BASIC_AUTH_USERNAME}:${WL_BASIC_AUTH_PASSWORD}")
fi

curl --fail-with-body \
  "${AUTH_ARGS[@]}" \
  -X POST \
  -H "x-sync-token: ${COMPETITOR_SYNC_TOKEN}" \
  "${COMPETITOR_SYNC_BASE_URL%/}/api/internal/competitor-landscape/sync"
