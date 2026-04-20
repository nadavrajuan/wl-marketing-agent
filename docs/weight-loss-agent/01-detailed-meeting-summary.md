# Detailed Meeting Summary

## Purpose of the Meeting

The meeting was about defining how to turn the existing weight-loss campaign work into a much stronger research and optimization capability, eventually embodied in an agent that can analyze the business holistically.

The current repo is only an early proof of concept. The future system is expected to be much broader and more capable.

The team was not just discussing data analysis. They were trying to understand:

- the structure of the weight-loss market
- the difference between brands, ingredients, and partner models
- the regulatory and platform constraints around this vertical
- what actually matters in campaign optimization
- why earlier campaign efforts did not scale
- what an intelligent agent should investigate and recommend
- what the future interface and data stack should look like

## Core Business Context

The business appears to run `top5weightchoices.com`, a comparison/review site for weight-loss offers, especially GLP-1-related telehealth programs.

The commercial model is not a pure e-commerce model and not a pure content model. It is an affiliate-style comparison model:

- users land on a comparison/review property
- they compare providers, programs, and medications
- they click through to partner/telehealth brands
- the business gets paid according to partner arrangements and conversion events

The live site itself openly says it is a comparison site that receives referral fees and that compensation can affect listing order and score.

## What the Team Is Really Trying to Optimize

The meeting made the optimization objective very explicit:

- maximize `purchase`
- minimize cost per `purchase`
- avoid being fooled by easier or noisier upstream events

This is important because the funnel includes several intermediate events:

- click-out to partner
- quiz start
- quiz complete
- add to cart
- purchase

The team repeatedly stressed that the only conversion that really matters for Google optimization is `purchase`.

They do not want the future agent to confuse:

- quiz complete with business success
- add-to-cart with actual value
- generic “conversion” counts with real economic value

This distinction is central to the whole vertical.

## Why Purchase Must Be the Truth Anchor

The team described a short funnel cycle:

- often same-day
- often within hours
- sometimes almost immediate
- typically not a long multi-week delay

This changes the logic of optimization.

In many other businesses, upstream conversions are necessary proxies because the final conversion is too delayed. Here, the meeting suggested that the lag to purchase is often so short that upstream events are much less informative.

That leads to several implications:

1. The agent should default to purchase truth, not proxy truth.
2. Quiz completion should not be allowed to become the model objective just because it is easier to generate.
3. Intermediate conversions can be used only as secondary signals or fallback proxies.
4. A weighted proxy framework may be useful in reporting, but must never override purchase-based decisioning when purchase data exists.

## Economics Discussed in the Meeting

Several practical operating assumptions came up:

- a purchase was repeatedly treated as worth roughly `$390` on average
- add-to-cart was discussed as worth roughly `$50`, or around `15%` of purchase value
- some partners pay on different models and this changes how campaign performance should be interpreted

This means the future system needs a normalized economics layer, not just raw event counts.

The agent must understand:

- partner payout model
- true purchase value
- weighted proxy value if needed
- what “good CPA” means for each partner or offer structure

## Market Structure as Understood in the Meeting

The team described the market as a layered ecosystem:

1. Original drug manufacturers
2. Telehealth / medical network companies
3. Comparison sites and affiliates
4. Ad platforms and certification layers
5. Patients/users with high-intent but price-sensitive behavior

There was also a recurring distinction between:

- original/branded medications or providers with stronger legitimacy signals
- compounded pathways that may have more regulatory exposure

The meeting participants were very aware that the market is commercially attractive but also structurally risky.

## Why the Vertical Is Attractive

The meeting framed the vertical as exciting for several reasons:

- very large market
- high consumer demand
- strong telehealth adoption
- relatively short conversion cycle
- high client value
- strong recurring/retention potential if treatment continues over time

The team also described telehealth more broadly as a growing behavioral pattern:

- people increasingly accept online care
- people value privacy and convenience
- users may prefer not to visit doctors in person
- onboarding is non-trivial, but still acceptable because the value is high

## Why the Vertical Is Risky

At the same time, the vertical was repeatedly described as risky because:

- regulation is changing
- platform policy is strict
- patent/compounding issues create legal uncertainty
- some brands may disappear or become unsafe partners
- some marketing claims can become non-compliant very quickly
- Google and other platforms are cautious

This led to a major product insight:

The future agent cannot be only an optimizer.

It must also be a verifier, a watcher, and a guardrail system.

## Regulatory / Compliance Theme in the Meeting

The meeting spent a lot of time on the history of the market and why so many telehealth-style brands appeared.

However, the meeting itself contained uncertain legal phrasing and some partly remembered terminology. That is a very important observation.

The agent should not simply inherit every spoken sentence as domain truth.

Instead, it should classify statements into:

- verified facts
- internal hypotheses
- legal/regulatory claims requiring external validation

The clearest compliance-related product requirement from the meeting was this:

If the agent writes or recommends content, it must check its domain knowledge before saying things like:

- “FDA approved”
- “same active ingredient”
- “original”
- “compounded”
- “approved for weight loss”
- “approved for diabetes”

The team explicitly said they do not want the system making inaccurate medical or regulatory claims.

## Correction Layer the Agent Must Have

One of the best ideas in the meeting was that the agent should continuously enrich its domain knowledge from research and then use that domain knowledge as a verification layer.

That means:

- keyword research should update the knowledge base
- brand research should update the knowledge base
- medication research should update the knowledge base
- compliance research should update the knowledge base
- every future content or optimization recommendation should align against that knowledge base

This is a big shift from a one-off prompt.

It implies a maintained, versioned knowledge system.

## Current Partner Landscape As Described

The discussion suggested a current partner world something like this:

- `Medvi` is the primary current partner and the dominant purchase source
- `Ro` is considered stronger and safer, but historically paid poorly
- `SkinnyRx` appears to have become inactive or weaker
- `Sprout` exists but is smaller
- `Eden` appears but has not proven itself strongly
- `Raw`, `Trim Rex`, and others had periods of performance or relevance
- multiple brands may have worked in a given period and later stopped working

This was not discussed as a stable environment.

It was discussed as a shifting environment in which:

- some partners drop
- some partners lose regulatory footing
- some partners stop converting
- some partners might deserve re-evaluation after market changes

Therefore, partner analysis must be ongoing, not static.

## What the Team Wants to Learn About Partners

The team does not only want partner payout tables.

They want to know, for each partner:

- what kind of offer it really is
- whether it leans branded/original vs compounded
- how safe or risky it seems
- whether it targets price-sensitive users
- whether it offers all-in-one support or medication-only flow
- how its onboarding works
- how its positioning differs from others
- how its economics compare
- whether its landing flow matches user intent
- whether its model is likely to remain viable

This is why a dedicated partner research playbook was requested.

## What Happened in the Campaigns

The meeting suggests the business already spent meaningful money on the vertical and learned some painful lessons.

The high-level picture:

- Bing found some path toward break-even or slight profitability in some areas
- Google had serious problems, including a conversion configuration issue
- performance did not scale the way the team wanted
- there was not enough healthy improvement month over month
- the team wanted a true vertical, not a marginally positive side business

One especially important incident:

- a mistaken Google configuration around conversions led to major waste in a very short time

That means the future system must treat measurement integrity as a first-class concern.

## Why Earlier Efforts Underperformed

The meeting did not blame a single factor like keywords or landing pages alone.

The main diagnosis was more human and operational:

- the vertical was difficult
- it needed relentless attention
- the people running it were smart but not fully dedicated
- they did the outer shell and infrastructure work
- they did not put in the obsessive, ongoing optimization energy the vertical required

This is actually a strong product insight.

The opportunity for the agent is not just “be smart.”

It is:

- be persistent
- be systematic
- re-check everything
- notice drift fast
- surface changes quickly
- preserve context across time

The team explicitly contrasted:

- basic setup work
- versus the micro-adjustment intensity needed to really win

## Key Channel Learnings

### Google

The meeting strongly emphasized:

- optimize toward purchase only
- never let easier upstream conversions become the real decision signal
- Google will happily learn to bring quiz-completers who do not buy
- this vertical is especially dangerous for proxy optimization

In other words:

Google is powerful, but if you ask the wrong question, it will solve the wrong problem extremely well.

### Bing

Bing sounded more promising in the historical discussion:

- more data over time
- some campaigns or formats performed respectably
- there were useful signals around desktop/mobile/syndication and MMA-style campaigns

This suggests Bing should be a major part of the next investigation system, not just a side channel.

## Historical Campaign Patterns Worth Investigating

The meeting mentioned several examples that should become explicit research tasks:

- a Ro brand campaign that worked
- a Trim Rex campaign that worked at one point and later stopped
- Raw-related performance that looked meaningful
- shifts in performance by period
- the need to understand what changed when something stopped working

This is a critical design direction for the agent.

The agent should not only find “what works now.”

It should also answer:

- what used to work
- when it stopped working
- what changed at that time
- whether the cause was measurement, partner status, regulation, competitor movement, or market demand

## What the Team Wants From Asset Analysis

The team spent meaningful time on headline and asset analysis.

They want an agent that can inspect creative at a granular level, especially:

- headlines
- descriptions
- possibly visuals where relevant
- per-asset CTR
- per-asset conversion behavior
- logical message quality, not only statistics

A crucial insight from the conversation:

Some assets may look statistically acceptable or interesting in one dimension, but still be strategically wrong.

Example logic discussed:

- “Compare raw weight loss plans” may have impressions but is not actually the smartest line because it frames the choice badly
- lines that sound impressive but contain unsafe or inaccurate claims may not be acceptable even if they perform
- assets should be judged by intent match, not just by click attraction

So the future agent’s creative analysis must combine:

- quantitative evidence
- semantic analysis
- compliance awareness
- message-strategy judgment

## What the Team Wants From Landing Page Analysis

The team explicitly asked for landing-page recommendations, not only ad recommendations.

They want the agent to ask questions like:

- does the page actually speak to a price-sensitive audience?
- is price visible enough?
- is the ranking logic coherent?
- are we promoting the right partner in the right position?
- is the page confusing users by mixing signals?
- does the page align with the keyword/user intent?
- does it explain the differences between options in a useful way?
- is the site too generic?
- is the site saying the wrong thing about medications or approval status?

This is a big requirement.

The agent is expected to reason across:

- SERP intent
- ad copy
- comparison page structure
- on-page content
- commercial ranking logic

## Competitor Monitoring Was Considered Essential

The team explicitly discussed competitor surveillance as a future component.

Not as a vanity feature, but as a real strategic advantage.

The logic was:

- competitors are ahead
- they spend more
- they probably notice shifts faster
- if they change messaging, pricing, or structure, that may contain information
- the business could shorten learning loops by watching them closely

The team wants the future system to monitor:

- competitor site changes
- ranking/order changes
- landing-page changes
- message shifts
- pricing changes
- possible deep links or hidden campaign pages

They even discussed a deeper form of competitor research:

- not just scraping homepages
- but finding the actual pages used in campaigns
- including possible client-side or hidden paths

## Reddit / Community Research Was Another Major Idea

The meeting also went beyond ad platforms and official sites.

There was a clear desire to scan Reddit and possibly other communities to understand:

- what users are currently discussing
- which brands are gaining or losing trust
- what complaints are appearing
- which themes are emerging early
- how medication terms and demand are shifting
- what price sensitivity language is natural in the market

This is important because it expands the agent’s role from optimizer to early-signal detector.

The desired outcome is not “summarize Reddit.”

It is:

- identify leading indicators
- detect market sentiment shifts
- detect brand-specific risk
- detect emerging keyword and angle opportunities

## Data Infrastructure Direction

A very practical theme in the meeting was data access.

The current data world includes:

- internal warehouse-like data
- PPC platform data
- metadata in existing systems
- missing ad asset detail unless connected to BigQuery

The discussion strongly pointed toward BigQuery as a necessary next step.

Why BigQuery matters here:

- richer Google/Bing advertising data
- better asset-level and click-level tracing
- more complete metadata
- better platform interoperability
- future-friendly foundation for the agent

The implication is that the next system should not stay limited to the current Postgres proof of concept.

## Interface Direction

The future interface was imagined as more than a dashboard.

It should eventually show:

- the current true picture
- keyword insights
- asset insights
- partner insights
- conversion-truth views
- cycle-time views
- market research results
- possibly the agent’s reasoning process and action plan

The team explicitly wanted the agent to show “the whole path,” not just final conclusions.

That means traceability is part of the product.

## What the Future Agent Should Be Able To Do

The meeting implies a long capability list.

The future agent should be able to:

- establish what counts as a real conversion
- normalize campaign economics around purchase
- analyze campaigns, keywords, and assets
- detect underperforming assets
- explain why they are underperforming
- suggest better replacements
- reason about landing-page message fit
- study partners and partner risk
- learn terminology around drugs and brands
- validate medical/regulatory claims before using them
- monitor competitors
- watch Reddit/community chatter
- identify changes over time
- compute cycle time and break it down by dimension
- produce a connected, holistic recommendation set

## Best Product Insight From the Meeting

The single best product insight was probably this:

The business does not need an “AI that analyzes data.”

It needs an “AI that behaves like a relentless vertical operator.”

That means:

- it remembers
- it verifies
- it connects signals
- it notices when the story changes
- it can explain why
- it can suggest what to test next

## Immediate Open Questions Raised by the Meeting

The following items should be treated as active research questions, not settled truth:

- Which partners are currently active vs inactive right now?
- Which offers are original/branded vs compounded vs mixed?
- Which medication claims on the site are currently safe and accurate?
- Which campaign and keyword themes still work as of now?
- Which landing-page patterns drive actual purchase, not just engagement?
- What changed historically when previously good campaigns stopped working?
- What is the correct legal/compliance framing around compounded offers in current US conditions?
- Which competitor pages are actual campaign destinations, not just public marketing pages?
- How should the system weigh upstream conversions when purchase is missing?
- What level of autonomy, if any, should be allowed before human review?

## Final Summary

The meeting was effectively a product-definition session disguised as a campaign discussion.

The team started with a question about a weight-loss campaign, but what they really uncovered was the need for a full-stack intelligence system for a difficult, high-value, fast-changing vertical.

The desired future system is not:

- a SQL demo
- a dashboard-only tool
- a generic marketing agent

It is a domain-aware, compliance-conscious, research-capable operating system for:

- media buying
- landing-page optimization
- partner intelligence
- market monitoring
- and decision support

That is the correct frame for planning what comes next.

