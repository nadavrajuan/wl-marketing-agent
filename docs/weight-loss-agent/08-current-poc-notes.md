# Current POC Notes

## Why This Document Exists

The current repository is useful, but it should not define the ceiling of the future project.

This note is meant to answer:

- what already exists
- what is reusable
- what is missing
- what should be treated as temporary POC scaffolding

## What Exists Today

Based on the current repo:

- a FastAPI app for the analysis agent UI
- a Next.js app for dashboards and exploration
- a PostgreSQL schema and import pipeline for historical conversion data
- a small LangGraph-style analysis loop
- an editable prompt/config system
- initial business domain context embedded in prompts

As of April 20, 2026, there is now also:

- a working BigQuery connection
- a real warehouse inventory with:
  - `visits`
  - `conversions`
  - `google_ad_data`
  - `bing_ad_data`
- a BigQuery-backed normalization and truth layer inside the Next.js app
- live APIs for:
  - stats
  - campaigns
  - keywords
  - segments
  - conversions
  - measurement truth
  - partners
  - landing pages
  - cycle time

## POC Architecture Snapshot

### Backend

The current agent backend is a FastAPI application with:

- session-based auth
- run history
- prompt editing
- basic config editing
- background analysis execution

### Agent loop

The current analysis flow is roughly:

- discover schema and samples
- build a plan
- generate SQL
- execute SQL
- analyze result
- repeat
- generate report

This is a good seed for:

- run tracking
- prompt iteration
- structured analysis traces

But it is still a narrow SQL-centered loop.

### Frontend

The current Next.js app provides:

- dashboard views
- campaigns/keywords/segments/data explorer pages
- schema page

This is helpful because:

- the product already has a vocabulary for analytics screens
- there is a visible place to extend from

But it is still much narrower than the future product vision from the meeting.

## What Is Reusable

The following ideas are worth keeping:

- the notion of an explicit investigation run
- storing prompts and run history
- keeping step-by-step traces
- having a separate analytics UI
- keeping business-domain prompt context configurable

## What Is Too Small For The Final Vision

The future system should not remain limited to:

- Postgres-only internal data
- schema + SQL analysis alone
- purely descriptive dashboards
- one generic “optimization opportunities” loop

The final product needs:

- BigQuery integration
- external research tools
- partner intelligence workflows
- landing-page audit workflows
- competitor monitoring
- community / Reddit intelligence
- explicit compliance / verification layers
- experiment management

This is now more concrete than before:

- Postgres should be treated as legacy POC context
- BigQuery should be treated as the primary source of truth for new analytics work
- the current Next.js app is already partially migrated in that direction

## Main Gap Between Current POC And Future Need

Today’s POC mostly asks:

- “What does the internal data say?”

The future system must ask:

- “What is actually true?”
- “What changed?”
- “Why did it change?”
- “Which partner / asset / page / market condition caused it?”
- “What should we do next?”

That is a much bigger product.

## Recommended Reuse Strategy

Do not throw away the POC. Reuse it selectively.

### Keep

- run model
- prompt storage
- investigation step logging
- dashboard shell
- current business data familiarity

### Evolve

- SQL-only analysis into multi-tool analysis
- internal-only data into internal + external intelligence
- static dashboard screens into operator screens

### Replace or de-emphasize

- any assumption that all truth lives in current Postgres tables
- any assumption that a single domain prompt is enough
- any assumption that the agent is mainly a query writer

## Best Way To Think About The Current Repo

This repo is best treated as:

- a proving ground
- a vocabulary starter
- a data and product seed

It is not yet:

- the final data platform
- the final agent architecture
- the final product model

That is exactly fine.

## Bottom Line

The POC already proves there is a real base here:

- data exists
- prompt-driven analysis exists
- UI exists
- a weight-loss campaign domain model exists

What comes next is not a rewrite for its own sake.

It is a controlled expansion from:

- a campaign analytics POC

to:

- a full weight-loss market intelligence and optimization system
