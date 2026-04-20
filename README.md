# WL Marketing Agent

Automated PPC marketing analytics & optimization for Weight Loss campaigns (Bing + Google Ads).

## Stack

- **Frontend**: Next.js 16 (TypeScript, Tailwind CSS, Recharts)
- **Database**: PostgreSQL 16 (Docker)
- **Warehouse**: BigQuery (`weightagent.WeightAgent`)
- **Agent**: FastAPI + LangChain / LangGraph
- **Data**: BigQuery-first visits, conversions, and paid-media performance data

## Getting Started

### 1. Start PostgreSQL

```bash
cp .env.example .env
docker compose up -d
```

### 2. Import Excel data

```bash
pip install openpyxl psycopg2-binary
export PG_DSN=postgresql://wl_user:your_password@localhost:5434/wl_marketing
python3 scripts/import_data.py
```

### 3. Run the app

```bash
cp app/.env.example app/.env.local
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## BigQuery Access

The repo can also connect to the BigQuery warehouse for live ad / visit / conversion data.

Expected env vars:

```bash
export BIGQUERY_PROJECT_ID=weightagent
export BIGQUERY_DATASET=WeightAgent
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/weightagent-f7946872ebb1.json
# or:
export BIGQUERY_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

Quick inspection:

```bash
pip install -r agent/requirements.txt
python3 scripts/inspect_bigquery.py
```

Current warehouse tables:

- `visits`
- `conversions`
- `google_ad_data`
- `bing_ad_data`
- `google_ads_daily_ad_snapshot` and related enrichment tables are created automatically when ingestion runs

## Features

- **Action Board** — Purchase-first keyword economics, profit, ROI, waste, and landing-page review queue
- **Copy Lab** — Theme-level copy intelligence, landing-page fit alerts, and live partner-site research
- **Internal Ingestion API** — Secure Google/Bing asset ingestion endpoints under `/agent/internal/ingest/*`
- **Campaigns** — Sortable campaign performance table with CVR metrics
- **Keywords** — Keyword performance with filterable purchase CVR
- **Segments** — Segment by platform, device, match type, affiliate, landing variant, country
- **Data Explorer** — Browse/filter raw events with pagination
- **Schema** — Full data dictionary and optimization framework

## Production

- Production host: `wl.rajuan.app`
- Analytics UI: `https://wl.rajuan.app`
- Agent UI: `https://wl.rajuan.app/agent`
- Deployment and migration notes: [docs/production-deployment.md](docs/production-deployment.md)
- Google Ads Scripts backfill/daily sync starter: [scripts/google_ads_asset_sync.gs](scripts/google_ads_asset_sync.gs)
- Production data migration helper: [scripts/migrate_postgres_to_production.sh](scripts/migrate_postgres_to_production.sh)

## Goal

Maximum conversions for minimum price.
