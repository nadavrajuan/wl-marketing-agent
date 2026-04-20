# Domain Knowledge Master

## Purpose

This document is the main domain knowledge base for the weight-loss comparison-site agent.

It is designed to feed both humans and agents.

It combines:

- verified external facts
- business facts derived from the meeting and current POC
- operational rules for the campaign
- explicit uncertainty markers

## 1. Business Model

### What the site is

`top5weightchoices.com` is a comparison/review site for weight-loss programs, medications, and telehealth services.

The live site presents itself as:

- an independent comparison website
- a free informational resource
- a site funded partially by referral fees / commissions
- a site whose listing order and score may be influenced by compensation

This matters because the agent must understand that the site is not a neutral encyclopedia.

It is a commercial comparison property that must balance:

- user trust
- conversion efficiency
- partner monetization
- claim accuracy

### What the site currently emphasizes

The live site highlights:

- weight loss injections and GLP-1-adjacent offers
- comparison of providers and plans
- pricing/value language
- convenience and telehealth
- safety / legitimacy
- ongoing support

### Important live links

- [Home](https://top5weightchoices.com/)
- [Comparison page](https://top5weightchoices.com/compare/top-5-weight-loss-injections/)
- [About](https://top5weightchoices.com/about-us/)
- [Advertiser disclosure](https://top5weightchoices.com/advertiser-disclosure/)

## 2. Campaign Objective

The main business objective is:

- maximize profitable `purchase`

The measurement objective is:

- use `purchase` as the canonical success event

The reporting objective is:

- express every major recommendation in terms of purchase economics, not vanity conversions

## 3. Funnel Definitions

The business appears to operate with some or all of these funnel events:

- impression
- click
- click-out / partner outbound
- quiz start
- quiz complete
- add to cart
- purchase

### Hard rule

The agent should treat `purchase` as the main truth event.

### Soft rule

Upstream conversions are allowed only as:

- directional indicators
- debugging signals
- temporary fallback proxies when purchase is missing

They should not become the primary optimization target unless a human explicitly chooses that tradeoff.

## 4. Economics

Meeting-derived operating assumptions:

- working purchase value: around `$390`
- add-to-cart can be modeled as roughly `15%` of a purchase when needed
- good CPA should be evaluated against real partner payout and purchase value, not generic conversion counts

These numbers should be parameterized in the future system, not hard-coded forever.

The agent should support:

- default working assumptions
- partner-specific override values
- historical payout tiers
- weighted conversion values

## 5. Time-to-Purchase

One of the most important internal truths from the meeting:

- the cycle time is short
- in many cases, users purchase the same day
- in many cases, the delay is measured in hours, not weeks

### Implication

This is not a classic long-lag insurance funnel or enterprise funnel.

Therefore:

- the future system should calculate cycle time carefully
- the agent should analyze cycle time by source, partner, keyword, device, hour, geography, and campaign
- the short cycle time reduces the usefulness of long-range proxy reasoning

## 6. Site Positioning Truths

Current site positioning suggests a few strong themes:

- comparison helps users choose
- users care about pricing/value
- users care about legitimacy and licensed clinicians
- users care about convenience and online access
- users care about support and follow-up

The site currently mixes:

- editorial comparison language
- commercial ranking language
- healthcare legitimacy language
- offer/promo language

That mix can convert well, but it also creates risk:

- ranking logic may become confusing
- price/value claims may become weak or inconsistent
- healthcare claims may drift into non-compliant language

## 7. Main Partner / Brand Universe

### From the meeting / data discussion

- Medvi
- Ro
- SkinnyRx
- Sprout
- Eden
- Raw
- Trim Rex
- Mozy

### From the live site disclosure / live pages

- Medvi
- Sprout Health
- SkinnyRX
- Ro
- Eden
- Hers
- Hims
- Fridays
- RemedyMeds
- futurehealth
- jrnys

The future system should keep a canonical partner table with fields such as:

- partner_id
- public_brand_name
- official_domain
- internal_network
- active_status
- payout_model
- offer_type
- original_or_compounded_status
- medical_model_notes
- pricing_notes
- trust_risk_score
- compliance_risk_score
- business_priority_score
- last_verified_at

## 8. Current Observed Partner Notes

These are a mix of verified external observations and internal meeting observations.

### Medvi

Verified / observed:

- appears as the current top-ranked offer on the live comparison page
- the live review page frames it as telehealth + online care + Semaglutide/Tirzepatide access
- the site positions it on pricing, convenience, and support

Meeting-derived internal observation:

- appears to be the most important current partner in internal performance data
- may be dominant in purchase volume

Caution:

- external medical/approval claims around Medvi should not be trusted without separate official-source validation

### Ro

Verified / observed:

- Ro is a large telehealth platform with a broad healthcare footprint
- the current Ro site emphasizes FDA-approved options, online flow, insurance help, and weight-loss membership
- Ro explicitly distinguishes some FDA-approved options from off-label or compounded categories on its site

Meeting-derived internal observation:

- Ro was viewed as safer / stronger / more established
- Ro was also described as historically less attractive on payout economics

### Fridays

Verified / observed:

- Fridays emphasizes a broader support model with dietitians, live workouts, support groups, and mental health coaching
- Fridays also advertises compounded GLP-1 options and explains that compounded medications are prepared by compounding pharmacies
- Fridays includes insurance concierge language and subscription/coaching structure

Implication:

- Fridays may appeal to users seeking a more holistic or support-heavy program rather than medication-only messaging

### Eden

Verified / observed:

- Eden is a broader health platform, not only weight loss
- Eden emphasizes online convenience, upfront pricing, free shipping, messaging, and multiple health verticals
- Eden offers both branded medication pages and broader personalized treatment messaging

Implication:

- Eden may perform differently depending on whether the user is price-led, convenience-led, or personalization-led

### Hims / Hers

Verified / observed:

- Hims & Hers increasingly position around broader digital health platform strength
- official recent materials show emphasis on FDA-approved weight-loss options and broader support layers

Implication:

- large-platform partners should be tracked not just as offers, but as moving strategic competitors/benchmarks

## 9. Medication / Terminology Knowledge

### Terms the agent must know

- GLP-1
- semaglutide
- tirzepatide
- Ozempic
- Wegovy
- Zepbound
- Mounjaro
- compounded
- original / branded
- telehealth
- board-certified clinicians
- off-label

### Verified external distinctions

- `Wegovy` is semaglutide and is FDA-approved for chronic weight management under certain conditions.
- `Ozempic` is semaglutide and is FDA-approved for type 2 diabetes, not specifically for weight loss.
- `Zepbound` is tirzepatide and is FDA-approved for chronic weight management under certain conditions.
- `Mounjaro` is tirzepatide and is FDA-approved for type 2 diabetes, not for weight loss.

### Compounded medications

Important guardrail:

- compounded versions are not the same thing as FDA-approved branded products
- the agent must never casually describe compounded products as FDA-approved equivalents
- the FDA has explicitly warned against marketing compounded GLP-1 products in ways that imply sameness with approved products

### Safety wording rule

The agent must not write copy like:

- “same as Wegovy”
- “FDA-approved compounded semaglutide”
- “identical to Ozempic”
- “approved alternative”

unless a validated, compliant legal/medical wording source explicitly allows the exact phrasing.

## 10. Regulation / Compliance Guardrails

### Verified external facts

- The FDA has publicly stated that shortages around GLP-1 supply have been stabilizing/resolving, including tirzepatide.
- The FDA has taken action against illegal marketing of non-FDA-approved compounded GLP-1 drugs.
- The FDA has warned telehealth firms not to imply that compounded drugs are the same as FDA-approved drugs.

### Platform / certification notes

- LegitScript certification is a major trust/compliance layer for telemedicine and other healthcare merchants.
- LegitScript materials state that certification is relevant to platforms including Google, Microsoft/Bing, Meta, TikTok, and payment providers.

### Practical compliance rule set for the agent

The agent must:

- prefer cautious wording over confident wording
- distinguish approved brand products from compounded offers
- separate site claims from official-source claims
- mark uncertain claims as “needs verification”
- treat regulated medical language as high-risk
- send risky content through a verification workflow before publication

## 11. Paid Media Truths

### Channel truth

- Google and Bing can both be useful, but they are not interchangeable
- measurement mistakes are catastrophic in this vertical
- proxy optimization is especially dangerous here

### Keyword truth

- some historically strong themes appear to have been brand-led
- there is also clear interest in ingredient-led search such as `tirzepatide` and `semaglutide`
- price-sensitive demand appears important

### Asset truth

The agent must understand that a bad asset can be bad in several different ways:

- high impressions, low CTR
- decent CTR, zero purchases
- semantically weak promise
- wrong comparison framing
- wrong compliance framing
- wrong match for keyword intent
- wrong match for landing page

## 12. Landing Page Truths

The site is not a simple direct-response page.

It is a comparison site, which means page logic matters a lot:

- ranking order
- clarity of the number-one recommendation
- why a provider is ranked where it is
- whether price and support themes are visible
- whether the page talks to the user’s actual reason for searching

The agent should evaluate landing pages on:

- price clarity
- trust clarity
- benefit clarity
- ranking clarity
- partner differentiation
- CTA clarity
- mobile usability
- message-intent match
- claim accuracy

## 13. Market Research Truths

The business wants the future system to read the market broadly, not just internal analytics.

That includes:

- partner sites
- competitor comparison pages
- ad-visible campaign pages
- Reddit / online communities
- public pricing changes
- new entrants
- regulatory shifts

This is not optional. It is part of the operating model.

## 14. What the Agent Must Never Forget

1. Purchase is the source of truth.
2. High-intent users may still be extremely price-sensitive.
3. The vertical is commercially attractive and compliance-sensitive at the same time.
4. Brand, ingredient, medication, and approval status are not interchangeable concepts.
5. Some things that “sound right” are exactly the things that create compliance risk.
6. Past winning campaigns may stop winning because the market moved, not just because execution got worse.
7. Partner quality is not stable.
8. Landing page quality and creative quality must be evaluated together.
9. Competitors can teach faster than internal experimentation alone.
10. The agent should be explicit about what it knows, what it infers, and what still needs validation.

## 15. Open Questions The Domain Knowledge Should Track

- Which partners are still operational and growing?
- Which partners are mostly branded/original vs mostly compounded?
- Which claims on the site need revision right now?
- Which offers best match price-sensitive users?
- Which offers best match “trust / safety / medical-first” users?
- Which keywords are truly purchase-driven vs merely engagement-driven?
- Which landing-page patterns are now overused or confusing?
- Which competitor pages deserve direct monitoring?
- Which communities are best for early signal detection beyond Reddit?

## 16. Source Notes

Primary live and official references used for this master:

- [Top5WeightChoices home](https://top5weightchoices.com/)
- [Top5WeightChoices comparison page](https://top5weightchoices.com/compare/top-5-weight-loss-injections/)
- [Top5WeightChoices about page](https://top5weightchoices.com/about-us/)
- [Top5WeightChoices advertiser disclosure](https://top5weightchoices.com/advertiser-disclosure/)
- [Ro official site](https://ro.co/)
- [Fridays official site](https://www.joinfridays.com/)
- [Eden official site](https://www.tryeden.com/)
- [FDA: Zepbound approval](https://www.fda.gov/news-events/press-announcements/fda-approves-new-medication-chronic-weight-management)
- [FDA: supply/compounding policy clarification](https://www.fda.gov/drugs/drug-alerts-and-statements/fda-clarifies-policies-compounders-national-glp-1-supply-begins-stabilize)
- [FDA: action against illegal marketing of compounded GLP-1s](https://www.fda.gov/news-events/press-announcements/fda-warns-30-telehealth-companies-against-illegal-marketing-compounded-glp-1s)
- [LegitScript telemedicine certification](https://www.legitscript.com/certification/telemedicine/)

