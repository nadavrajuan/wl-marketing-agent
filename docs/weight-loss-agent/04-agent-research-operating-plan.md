# Agent Research Operating Plan

## Goal

Design an agent that can investigate this business like a serious operator, not like a generic dashboard assistant.

The agent should:

- find true performance
- find weak points
- explain why they are weak
- propose specific improvements
- connect internal data with external research
- show its reasoning path

## High-Level Operating Principle

The agent must always reason across the full chain:

`market -> keyword intent -> campaign -> asset -> landing page -> partner -> purchase economics`

If it only looks at one layer, it will miss the real cause.

## Stage 0: Establish Trusted Inputs

Before any serious analysis, the system should verify what data sources are available.

Required internal sources:

- campaign performance exports
- keyword performance
- asset/headline/description performance
- landing page and click-out events
- partner conversion data
- payout data
- internal comparison-site analytics
- historical run logs and experiment history

Required external sources:

- live site content
- official partner sites
- official drug/regulatory sources
- competitor sites
- Reddit / community sources
- ad-platform policy / certification sources

Required data platform capability:

- BigQuery connection
- historical tables
- event joinability
- partner identifiers
- click ID / ad ID / asset ID traceability where possible

Confirmed current internal inputs:

- `visits`
- `conversions`
- `google_ad_data`
- `bing_ad_data`

Confirmed current source-of-truth rule:

- the canonical internal join is `conversions.visit_id = visits.id`

Confirmed current measurement caveat:

- purchase data covers a longer historical range than paid-media spend tables, so the agent must explicitly separate:
  - full-history purchase analysis
  - in-window spend analysis

## Stage 1: Measurement Truth Pass

This is the first thing the agent should do in every serious investigation.

Questions:

- What is the real purchase event?
- Which conversions are true purchase conversions?
- Which conversions are fake, upstream, blended, or inflated?
- Which historical periods had broken conversion setup?
- What proxy conversions exist and how should they be weighted?

Outputs:

- trusted purchase metric definition
- trusted proxy metric definitions
- data quality warning list
- periods to exclude or annotate

Current implementation note:

- this stage is already beginning to exist in the repo through the `measurement-truth` API
- it currently exposes:
  - conversion taxonomy
  - purchase vs reversal counts
  - join coverage
  - media-window coverage
  - warnings about incomplete paid-media history

No optimization recommendation should be made before this pass is complete.

## Stage 2: Baseline Business Analysis

The agent should establish the baseline:

- purchases
- effective CPA
- revenue / payout assumptions
- partner share
- platform share
- device split
- time-to-purchase
- trend over time

Questions:

- Where is the money really coming from?
- Which platform is closer to the target model?
- Which periods were healthy vs unhealthy?
- Did the business improve, stagnate, or degrade?

Outputs:

- baseline report
- trend report
- short list of biggest opportunity areas

## Stage 3: Partner Intelligence Pass

This stage asks:

- Which partners are active now?
- Which partners are actually converting?
- Which partners are safest / strongest / most scalable?
- Which partners fit price-sensitive traffic?
- Which partners fit trust/safety-seeking traffic?
- Which partners need re-evaluation because the market changed?

The partner pass must combine:

- internal performance data
- site positioning
- official-site research
- compliance / legitimacy clues
- payout logic

Outputs:

- partner scorecard
- partner risk map
- partner recommendation set

## Stage 4: Campaign and Keyword Analysis

The agent should analyze:

- campaign structure
- brand vs non-brand themes
- ingredient keywords
- performance by platform, device, and match type
- changing performance over time
- keywords that once worked and stopped
- keywords with high spend but weak purchase output

Questions:

- What themes drive real purchase?
- Which themes only drive engagement?
- What changed when winners stopped winning?
- Where is the business under-investing or over-investing?

Outputs:

- keyword opportunity map
- keyword waste list
- historical change analysis
- recommended tests

Important live constraint for the agent:

- campaign CPA recommendations should prefer date windows that overlap the paid-media tables
- otherwise the agent risks overstating or understating CPA because spend is missing for earlier periods

## Stage 5: Asset and Creative Analysis

The agent should inspect:

- headlines
- descriptions
- image assets where applicable
- extensions and other ad elements where relevant

The agent must score assets on:

- impressions
- CTR
- purchase contribution
- semantic quality
- intent fit
- compliance safety

It should identify patterns such as:

- high impression / low CTR
- decent CTR / low purchase
- misleading or weak comparison framing
- weak price/value framing
- unsafe medical or approval language

Outputs:

- asset keep / test / pause list
- rewrite suggestions
- explanation of why each weak asset is weak

Current limitation:

- the available warehouse does not yet include true asset/headline/description tables
- therefore the agent should not pretend to perform asset-level diagnosis from ad-level media tables alone
- in v1, asset analysis must stay explicitly marked as blocked or partial until asset data is available

## Stage 6: Landing Page Analysis

The landing-page pass should ask:

- Does the page match the searcher’s intent?
- Does it speak to price-sensitive users?
- Does it make the ranking logic clear?
- Is partner differentiation obvious?
- Is the top recommendation actually supported by the page?
- Does the page create confusion?
- Are there claim-safety issues?

Outputs:

- landing page audit
- recommendation list
- copy hierarchy suggestions
- experiment backlog

## Stage 7: Competitor and Market Research

This stage goes outside internal data.

The agent should monitor:

- competitor comparison pages
- partner sites
- pricing changes
- ranking changes
- new medications or formats
- public landing-page changes
- Reddit/community chatter
- deep links or likely campaign pages if discoverable

Questions:

- What are stronger players doing that we are not?
- Which competitor changes might signal market learning?
- Which brand sentiment changes might hit performance soon?
- Which new angles are emerging?

Outputs:

- competitor watch digest
- market pulse digest
- early warning items

## Stage 8: Recommendation Synthesis

At this stage, the agent should combine all passes into a coherent strategy.

Every recommendation should answer:

- what is wrong or promising
- why it matters
- how confident we are
- what to do next
- what metric will prove success
- what risk should be watched

Recommendation categories:

- pause
- rewrite
- re-rank
- investigate
- expand
- reduce
- monitor
- verify with human

## Stage 9: Experiment Planning

The agent should not only diagnose. It should produce testable plans.

Each experiment should include:

- hypothesis
- reason for hypothesis
- change to make
- segment / traffic scope
- duration
- success metric
- stop condition
- risk note

Examples:

- rewrite top 5 low-logic headlines
- increase price-value visibility on the comparison page
- split branded-safe partner traffic from price-led compounded-intent traffic
- re-open a historically strong brand theme in a controlled budget window

## Stage 10: Continuous Monitoring

The future system should eventually run recurring routines:

- daily anomaly scan
- weekly performance synthesis
- weekly partner review
- weekly competitor diff
- weekly Reddit/community pulse
- monthly landing-page quality review
- monthly knowledge-base refresh

## Human-in-the-Loop Requirements

This vertical is too risky for blind autonomy.

Human approval should be required for:

- publishing content
- changing regulatory/medical wording
- changing ranking logic on the comparison page
- auto-pausing major campaigns
- major budget reallocation
- changes involving approval/safety wording

## Suggested LangGraph / LangChain Architecture

### Core graph

1. `intake`
2. `data_inventory`
3. `measurement_truth`
4. `baseline_analysis`
5. `partner_analysis`
6. `campaign_keyword_analysis`
7. `asset_analysis`
8. `landing_page_analysis`
9. `market_research`
10. `recommendation_synthesis`
11. `human_review_gate`
12. `final_report`

### Useful tool families

- BigQuery query tool
- internal Postgres / historical tool
- site crawler / HTML extractor
- official-source verifier
- competitor diff tool
- Reddit / community research tool
- screenshot / page inspection tool
- experiment registry tool

### Memory layers

- run memory
- partner memory
- medication/compliance memory
- experiment memory
- historical change memory

## Output Contract For Each Serious Run

Each run should return:

1. Executive summary
2. Trusted measurement notes
3. Key findings
4. Evidence by area
5. What changed vs prior state
6. Recommended actions
7. Risks / uncertainty
8. What needs human review
9. Suggested experiments
10. A structured trace of how the agent reached its conclusions

## Evaluation Rubric For The Agent

The agent is good if it:

- catches measurement errors
- resists proxy-conversion traps
- identifies weak assets and explains why
- spots landing-page mismatch
- separates fact from guess
- finds useful competitor or market signals
- gives actions that are specific and testable

The agent is not good if it:

- gives generic PPC advice
- treats all conversions as equal
- repeats unverified medical claims
- ignores partner differences
- ignores landing pages
- ignores historical context
- hides uncertainty

## Immediate Build Sequence

If building from here, I would sequence the work this way:

1. Connect BigQuery and verify ad/asset data completeness.
2. Build the measurement-truth pass and historical exclusion logic.
3. Build campaign + keyword + purchase baseline reports.
4. Build asset analysis with explanation quality.
5. Build landing-page audit workflow.
6. Build partner dossier workflow.
7. Add competitor and Reddit intelligence.
8. Add persistent memory and experiment tracking.
9. Add optional actioning with strict approval gates.
