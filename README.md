# WL Marketing Agent

Automated PPC marketing analytics & optimization for Weight Loss campaigns (Bing + Google Ads).

## Stack

- **Frontend**: Next.js 14 (TypeScript, Tailwind CSS, Recharts)
- **Database**: PostgreSQL 16 (Docker)
- **Data**: 15,435 conversion events from Bing + Google Ads (Sep 2025 – Mar 2026)

## Getting Started

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Import Excel data

```bash
pip install openpyxl psycopg2-binary
python3 scripts/import_data.py
```

### 3. Run the app

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Dashboard** — KPIs, daily trend, funnel visualization, platform split, top keywords
- **Campaigns** — Sortable campaign performance table with CVR metrics
- **Keywords** — Keyword performance with filterable purchase CVR
- **Segments** — Segment by platform, device, match type, affiliate, landing variant, country
- **Data Explorer** — Browse/filter raw events with pagination
- **Schema** — Full data dictionary and optimization framework

## Goal

Maximum conversions for minimum price.
