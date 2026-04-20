# Weight Loss Agent Strategy Pack

This folder is a working planning pack for the next version of the `top5weightchoices.com` project.

It is intentionally written as a phase-2 / phase-3 planning set, not as a description of the current proof-of-concept codebase.

The current repo already contains useful seeds:

- A PostgreSQL-backed analytics dataset and dashboard POC
- A small LangGraph/LangChain-style analysis loop
- Early domain context for weight-loss PPC analysis

But the next version needs to grow into a much wider research and decision system that can connect paid media, landing pages, partner quality, market changes, compliance, and ongoing competitor intelligence.

## What This Pack Contains

1. [Detailed Meeting Summary](./01-detailed-meeting-summary.md)
   A long English synthesis of the meeting, including business context, risks, campaign lessons, partner discussions, data needs, and the intended agent behavior.

2. [Domain Knowledge Master](./02-domain-knowledge-master.md)
   The main knowledge base for the vertical: business model, terminology, funnel, economics, regulation/compliance constraints, market structure, and operating truths.

3. [Domain Knowledge Agent Versions](./03-domain-knowledge-agent-versions.md)
   Several ready-to-use domain knowledge formats for an agent: long, medium, short, structured, and guardrail-oriented.

4. [Agent Research Operating Plan](./04-agent-research-operating-plan.md)
   A step-by-step execution plan for the agent, including research loops, tool responsibilities, human review gates, output contracts, and a suggested LangGraph/LangChain structure.

5. [UI and BigQuery Plan](./05-ui-and-bigquery-plan.md)
   Recommended data platform direction, BigQuery integration plan, and the analytics screens the product should eventually include.

6. [Landing Page and Creative Playbook](./06-landing-page-and-creative-playbook.md)
   A detailed framework for analyzing landing pages, headlines, descriptions, creative assets, and recommendation quality.

7. [Partner and Market Research Playbook](./07-partner-and-market-research-playbook.md)
   A dedicated process for partner intelligence, competitor monitoring, Reddit/community research, and deep-link discovery.

8. [Current POC Notes](./08-current-poc-notes.md)
   A lightweight review of what the current repo already provides, what is reusable, and what should not constrain the future architecture too much.

## What Seems Most Important

The meeting makes one thing very clear:

- This is not just a reporting problem.
- This is not just a keyword optimization problem.
- This is not just a medical/compliance problem.

It is a connected decision problem across:

- partner choice
- channel choice
- conversion truth
- landing-page clarity
- asset quality
- pricing sensitivity
- regulation/compliance changes
- fast market learning

The future agent therefore should not be a single SQL bot.

It should be a multi-stage research operator that can:

- pull the right data
- separate true business signals from noisy proxy signals
- reason about partners and offers
- inspect assets and landing pages
- scan the external market
- generate hypotheses
- recommend actions
- explain its reasoning trace
- route risky claims through verification

## Non-Negotiable Campaign Truths

These came up repeatedly and should become hard constraints in the next system:

- The primary success metric is `purchase`, not quiz completion and not other upstream conversions.
- CPA must be evaluated against purchase economics, not against easier intermediate events.
- Add-to-cart can be treated as a weighted proxy only when necessary, and in the meeting it was treated as roughly `15%` of a purchase value.
- Purchase value was discussed around `~$390` as a practical working value.
- The cycle time is short. In many cases the user purchases the same day, often within hours.
- Because the cycle is short, upstream conversions are much less useful than they would be in a long-lag funnel.
- The agent must distinguish verified external facts from internal hypotheses and meeting assumptions.

## A Good Mental Model For The Future Product

The future product should behave like a hybrid of:

- a paid media analyst
- a landing-page critic
- a compliance-aware content reviewer
- a partner diligence analyst
- a competitive intelligence watcher
- a research assistant with memory
- an experiment planner

## Recommended First Build Order

If we keep the build order disciplined, I would do it like this:

1. Establish a trusted data layer in BigQuery with true purchase labeling.
2. Build a baseline investigation workflow that always starts from purchase truth.
3. Add asset-level and keyword-level diagnosis.
4. Add landing-page and partner analysis.
5. Add external market research and competitor monitoring.
6. Add agent memory, evaluation, and action recommendation loops.
7. Only then consider semi-autonomous actioning.

## April 20, 2026 Reality Check

The repo is no longer at the purely hypothetical stage on the data side.

BigQuery is now connected and the real source tables are:

- `weightagent.WeightAgent.visits`
- `weightagent.WeightAgent.conversions`
- `weightagent.WeightAgent.google_ad_data`
- `weightagent.WeightAgent.bing_ad_data`

Important confirmed facts from the live warehouse:

- `conversions.visit_id -> visits.id` joins at about `97.96%`
- `visits` is the attribution spine because it contains click IDs, campaign IDs, ad group IDs, creative IDs, landing-page URLs, and timestamps
- `google_ad_data` currently covers `2026-02-19` through `2026-04-16`
- `bing_ad_data` currently covers `2026-01-01` through `2026-04-16`
- `conversions` reach back earlier than paid-media spend coverage, so full-history CPA must be treated carefully

The current implementation work in this repo now includes:

- a BigQuery client in the Next.js app
- normalized query logic over the real warehouse tables
- purchase-truth APIs for dashboarding and analysis
- new routes for:
  - `measurement-truth`
  - `partners`
  - `landing-pages`
  - `cycle-time`

That means the next stage should assume:

- BigQuery is the primary truth layer for new analytics work
- Postgres is legacy/POC context, not the system of record for the new build
- the fastest path forward is to keep adding curated analysis APIs first, then upgrade the agent to use those APIs and external research tools

## Notes On Source Reliability

This pack deliberately separates three kinds of information:

- `Verified external facts`
- `Meeting-derived internal facts`
- `Open questions / claims that must be validated`

That separation matters a lot in this vertical because:

- medication claims can be wrong or outdated
- compounded vs original terminology is often used sloppily
- partner behavior changes fast
- ad-policy constraints evolve
- ranking and offer language on the site can drift

## Live Site Links

The live site that this project appears to support:

- [Top5WeightChoices home](https://top5weightchoices.com/)
- [Top weight loss injections comparison page](https://top5weightchoices.com/compare/top-5-weight-loss-injections/)

## External Reference Links Used In This Pack

- [Top5WeightChoices advertiser disclosure](https://top5weightchoices.com/advertiser-disclosure/)
- [Top5WeightChoices about page](https://top5weightchoices.com/about-us/)
- [Ro official site](https://ro.co/)
- [Fridays official site](https://www.joinfridays.com/)
- [Eden official site](https://www.tryeden.com/)
- [FDA: Zepbound approval for chronic weight management](https://www.fda.gov/news-events/press-announcements/fda-approves-new-medication-chronic-weight-management)
- [FDA: GLP-1 compounding policy as supply stabilizes](https://www.fda.gov/drugs/drug-alerts-and-statements/fda-clarifies-policies-compounders-national-glp-1-supply-begins-stabilize)
- [FDA: warning letters / action against illegal marketing of compounded GLP-1s](https://www.fda.gov/news-events/press-announcements/fda-warns-30-telehealth-companies-against-illegal-marketing-compounded-glp-1s)
- [FDA: Ozempic / Wegovy indication distinction via FDA references](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/usapeptidecom-696885-02262025)
- [LegitScript telemedicine certification overview](https://www.legitscript.com/certification/telemedicine/)
