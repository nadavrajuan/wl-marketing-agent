# UI and BigQuery Plan

## Goal

Define the data platform direction and the analysis screens the future product should include.

## Confirmed Warehouse Shape

As of April 20, 2026, the real BigQuery warehouse available to the project is:

- project: `weightagent`
- dataset: `WeightAgent`
- tables:
  - `visits`
  - `conversions`
  - `google_ad_data`
  - `bing_ad_data`

This means the planning model should no longer assume generic placeholder base tables.

The current v1 truth layer should be built from these real sources:

- `visits` as the attribution/session spine
- `conversions` as the outcome/event table
- `google_ad_data` as Google daily media performance
- `bing_ad_data` as Bing daily media performance

The key assumption is:

- the future system should have access to all relevant data it needs
- BigQuery should become a central part of the ad-data and intelligence stack

## Why BigQuery Matters

The meeting strongly suggested that the current POC does not yet have the full fidelity needed for the final system.

BigQuery matters because it can support:

- richer Google Ads data
- richer Bing/Microsoft Ads dumps if routed there
- asset-level detail
- click / identifier joins
- historical snapshot storage
- large-scale diffing over time
- joining internal site data with media data

The current repo’s POC mostly centers on Postgres plus a simple LangGraph loop.

That is a good starting point, but not a sufficient long-term operating substrate.

## Future Data Domains

The future platform should unify at least these domains:

1. Paid media data
2. Site analytics data
3. Partner conversion / payout data
4. Landing-page metadata and version history
5. Competitor monitoring data
6. Community / Reddit research data
7. Compliance / domain knowledge reference data
8. Agent run history and experiment history

## Suggested BigQuery Data Model

In the near term, the actual warehouse should be normalized in code into repo-managed read models before any warehouse-side marts are introduced.

Suggested v1 normalized entities:

- `visits_norm`
- `conversions_norm`
- `media_daily_norm`
- `purchase_attribution_fact`
- `cycle_time_fact`
- `landing_page_scorecard`
- `partner_scorecard`

### Core tables

- `ads_campaign_daily`
- `ads_adgroup_daily`
- `ads_keyword_daily`
- `ads_asset_daily`
- `ads_search_term_daily`
- `ads_conversion_event`
- `ads_click_fact`
- `site_session_fact`
- `site_clickout_fact`
- `site_quiz_event_fact`
- `partner_conversion_fact`
- `partner_payout_fact`
- `partner_dim`
- `landing_page_dim`
- `landing_page_version_fact`
- `competitor_snapshot_fact`
- `community_signal_fact`
- `knowledge_reference_dim`
- `agent_run_fact`
- `experiment_fact`

### Important dimensions

- date
- platform
- campaign
- adgroup
- asset
- keyword
- search term
- device
- geo
- partner
- medication theme
- landing page
- conversion type

## Required Join Keys

At minimum, the platform should preserve or derive the best possible joins for:

- campaign ID
- ad group ID
- ad ID / asset ID
- click identifier
- landing page path / variant
- partner ID
- site session ID
- timestamp alignment

Even if some joins are imperfect, the platform should record:

- exact join
- inferred join
- unresolved join

so that the agent can reason about data confidence.

For the currently available warehouse, the most important confirmed joins are:

- `conversions.visit_id = visits.id`
- campaign/ad group/ad joins via `visits.campaign_id`, `visits.adgroup_id`, and `visits.creative`
- media matching by:
  - platform
  - visit date
  - campaign ID
  - ad group ID
  - ad ID
  - normalized device

Current live caveats:

- `google_ad_data` covers a shorter time range than `conversions`
- `bing_ad_data` also starts later than the earliest conversions
- `google_ad_data.final_url` is stored as a JSON-like string and must be parsed
- `conversions.value` is a string and must be cast safely

## Recommended Screens

## Screens Already Starting To Exist In V1

The current repo now has a working start on these API surfaces:

- `Measurement Truth`
- `Campaigns`
- `Keywords`
- `Segments`
- `Partners`
- `Landing Pages`
- `Cycle Time`

That does not mean the UI is complete, but it means the future screen plan should now treat those as live foundations rather than only ideas.

## 1. Executive Overview

Purpose:

- answer “how healthy is the business right now?”

Should show:

- purchases
- effective CPA
- estimated contribution / value
- top partners
- top platforms
- key warnings
- trend vs prior period

## 2. Measurement Truth Screen

Purpose:

- show which conversions are real and which are not

Should show:

- conversion taxonomy
- purchase vs proxy share
- broken / suspicious periods
- current confidence score by source
- notes on historical misconfiguration

This screen is essential because the meeting repeatedly showed how easy it is to fool ourselves with blended conversions.

## 3. Funnel and Cycle-Time Screen

Purpose:

- show the short-cycle nature of the business

Should show:

- click -> quiz start -> quiz complete -> add to cart -> purchase
- time-to-purchase distribution
- cycle time by partner
- cycle time by keyword
- cycle time by device
- cycle time by hour / day / geography

## 4. Partner Intelligence Screen

Purpose:

- help the business choose who deserves traffic

Should show:

- active vs inactive partners
- purchase volume
- effective CPA
- weighted economics
- trust / compliance notes
- positioning summary
- change over time

Possible actions:

- mark for re-evaluation
- flag as risky
- flag as high priority

## 5. Campaign and Keyword Intelligence Screen

Purpose:

- reveal what themes are truly driving purchases

Should show:

- campaign rankings
- keyword clusters
- brand vs non-brand split
- ingredient-led themes
- price-led themes
- wasted spend themes
- historical winners that declined

## 6. Asset and Copy Screen

Purpose:

- diagnose headlines, descriptions, and other ad assets

Should show:

- asset text
- impressions
- CTR
- purchase contribution
- confidence level
- semantic diagnosis
- compliance risk flag
- suggested rewrite

The screen should support questions like:

- Which assets got scale but never converted?
- Which assets have weak logic?
- Which assets have dangerous wording?
- Which descriptions should be replaced first?

## 7. Landing Page Analysis Screen

Purpose:

- connect keyword and ad intent to on-site experience

Should show:

- top landing pages
- ranking logic
- CTA layout
- price visibility
- trust signal visibility
- partner ordering
- consistency with ad promise
- screenshot history / visual diff

Possible actions:

- rewrite section
- change ranking logic
- test higher price visibility
- simplify explanation

## 8. Competitor Watch Screen

Purpose:

- track stronger players and shorten learning loops

Should show:

- monitored competitor domains
- latest changes
- pricing changes
- ranking changes
- landing-page diffs
- newly discovered deep links
- suspected campaign pages

## 9. Market Pulse / Reddit Screen

Purpose:

- detect early signals outside formal ad data

Should show:

- top discussed brands
- top discussed drugs / ingredients
- complaint themes
- pricing themes
- trust / side-effect / legitimacy themes
- notable week-over-week shifts

## 10. Agent Investigations Screen

Purpose:

- show the agent’s work, not only outputs

Should show:

- run objective
- tools used
- evidence collected
- reasoning trace
- findings
- recommendations
- uncertainty notes

This is especially important because the user explicitly wants to see the path, not only the summary.

## 11. Experiment Center

Purpose:

- turn diagnosis into action and learning

Should show:

- open experiments
- hypothesis
- owner
- start date
- success metric
- early results
- decision status

## UX Principles For The Product

1. Purchase truth must always be visible.
2. Proxy conversions must never quietly dominate the UI.
3. The interface should explain confidence and uncertainty.
4. Every recommendation should be inspectable.
5. Historical comparisons matter as much as current rankings.
6. The UI should connect internal and external research, not separate them into silos.

## BigQuery Implementation Plan

### Phase 1: Access and schema discovery

- connect to the existing ad-data dump
- inventory tables and fields
- map IDs to current internal data structures
- confirm asset-level and click-level availability

### Phase 2: Build trusted marts

- purchase truth mart
- asset performance mart
- partner economics mart
- landing-page mart
- time-to-purchase mart

### Phase 3: API / service layer

Expose query services for:

- baseline metrics
- partner scorecards
- asset diagnostics
- landing-page diagnostics
- historical change detection

### Phase 4: Agent integration

Give the agent tool access to:

- query marts
- fetch screenshots
- pull current landing page HTML
- pull partner profile snapshots
- retrieve historical experiments

## Current POC vs Future Platform

### Current POC strengths

- basic dashboard
- useful data model start
- initial domain prompt
- initial analysis loop

### Current POC limitations

- not yet a full research system
- limited external-source integration
- no mature partner intelligence layer
- no mature landing-page audit layer
- no mature competitor monitoring layer
- no BigQuery-first intelligence architecture

## Final Direction

The final UI should feel less like:

- a dashboard with charts

and more like:

- a control center for a weight-loss vertical research and optimization program

That is the right product shape for what the meeting described.
