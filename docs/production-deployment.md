# Production Deployment

## Services
- `wl.rajuan.app` serves the Next.js analytics UI.
- `wl.rajuan.app/agent` serves the FastAPI agent UI.
- `wl.rajuan.app/agent/internal/ingest/*` accepts machine-to-machine ingestion with a bearer token.

## Required GitHub Secrets
- `EC2_HOST`
- `DEPLOY_SSH_KEY`
- `POSTGRES_PASSWORD`
- `SESSION_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `OPENAI_API_KEY`
- `BIGQUERY_SERVICE_ACCOUNT_JSON`
- `BIGQUERY_PROJECT_ID`
- `BIGQUERY_DATASET`
- `INGEST_API_TOKEN`
- `TRAEFIK_BASIC_AUTH_USERS`

## Deploy Flow
1. Push to `master`.
2. GitHub Actions builds the app and agent images and pushes them to GHCR.
3. The deploy job copies `docker-compose.prod.yml` and `db/init.sql` to the EC2 host.
4. The deploy job writes `.env` and `secrets/bigquery-service-account.json` on the server.
5. Docker Compose pulls the new images and restarts the stack behind Traefik.

## Data Migration
Use [scripts/migrate_postgres_to_production.sh](../scripts/migrate_postgres_to_production.sh) after the production Postgres container is running.

Required local env vars:
- `PG_DSN`
- `EC2_HOST`
- `SSH_KEY_PATH`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

## Notes
- Rotate the Cloudflare token and OpenAI key that were shared in chat before go-live.
- `TRAEFIK_BASIC_AUTH_USERS` must be an htpasswd-formatted value, not a raw password.
