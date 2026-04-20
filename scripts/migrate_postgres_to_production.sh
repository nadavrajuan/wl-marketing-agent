#!/usr/bin/env bash
set -euo pipefail

REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/wl-marketing-agent}"
REMOTE_HOST="${EC2_HOST:?EC2_HOST is required}"
SSH_KEY_PATH="${SSH_KEY_PATH:?SSH_KEY_PATH is required}"
PG_DSN="${PG_DSN:?PG_DSN is required}"
POSTGRES_USER="${POSTGRES_USER:?POSTGRES_USER is required}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
POSTGRES_DB="${POSTGRES_DB:-wl_marketing}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-wl-marketing-postgres}"

TMP_DUMP="$(mktemp /tmp/wl_marketing.XXXXXX.dump)"

cleanup() {
  rm -f "$TMP_DUMP"
}
trap cleanup EXIT

echo "Creating local Postgres dump..."
pg_dump "$PG_DSN" --format=custom --no-owner --no-privileges --file "$TMP_DUMP"

echo "Copying dump to server..."
scp -i "$SSH_KEY_PATH" "$TMP_DUMP" "ubuntu@${REMOTE_HOST}:${REMOTE_DIR}/wl_marketing.dump"

echo "Restoring dump into production container..."
ssh -i "$SSH_KEY_PATH" "ubuntu@${REMOTE_HOST}" "
  set -euo pipefail
  docker cp ${REMOTE_DIR}/wl_marketing.dump ${POSTGRES_CONTAINER}:/tmp/wl_marketing.dump
  docker exec -e PGPASSWORD='${POSTGRES_PASSWORD}' ${POSTGRES_CONTAINER} \
    pg_restore -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' --clean --if-exists /tmp/wl_marketing.dump
"

echo "Migration complete."
