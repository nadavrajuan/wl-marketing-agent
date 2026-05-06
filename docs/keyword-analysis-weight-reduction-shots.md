# Keyword Deep-Dive: "weight reduction shots"
**Analyst:** Claude (manual run)  
**Date:** 2026-05-05  
**Scope:** Full user journey — SERP → Ad → Landing Page → Partner Page  
**BigQuery status:** Auth required — flagged gaps marked with ⚠️

---

## 1. Keyword Intent

**"Weight reduction shots"** is a colloquial mid-funnel search. The user already knows they want an injectable medication (not pills, not lifestyle coaching). They're shopping for which provider to go through — comparing price, trustworthiness, and getting started process.

**Search volume context (⚠️ BQ needed for impressions):** This is a lower-volume, high-intent variation of "weight loss injections." Comparable terms: "weight loss shots", "GLP-1 shots", "obesity shots".

**No competitor uses this exact phrase.** Every site — Ro, Hims, Forbes Health, Yahoo Health, Top10 — uses "weight loss injections", "weight loss shots" (occasionally), or brand names. Zero targeting of "weight reduction shots." This is a small but real SEO/SEM gap.

---

## 2. SERP Landscape (Organic)

Pages that appear for "weight reduction shots":

| Position (approx.) | Domain | Page |
|---|---|---|
| 1-3 | Ro, Saxenda, Wegovy | Brand pages |
| 4-6 | Medical content (Johns Hopkins, UT Physicians, Keck Medicine) | Editorial |
| 7-8 | **top5weightchoices.com** | `/compare/top-5-weight-loss-medications-go-dt/` and `/compare/top-5-weight-loss-medications/` |
| 9-10 | CLS Health, medvidi.com | Blog/editorial |

**Our page appears mid-page organically.** Given zero keyword match in title or body, this position is underperforming. We're ranking on domain authority and category relevance, not keyword alignment.

---

## 3. Our Ads — What Happens When Someone Clicks

⚠️ **BigQuery auth required for ad-level data.** The following is inferred from the LP structure.

The keyword triggers our **Google Ads campaign targeting weight loss medications** broadly. Based on the LP URL pattern (`go-dt` = Google Desktop), our ads point to:

**Landing page served:** `/compare/top-5-weight-loss-medications-go-dt/`

---

## 4. Landing Page Audit

### Page 1: `/compare/top-5-weight-loss-medications-go-dt/` (what the ad sends traffic to)

| Signal | Value | Issue |
|---|---|---|
| **Page title** | "Top 5 Weight Loss Medications Google Desktop - Top 5 Weight Choices" | 🔴 CRITICAL: "Google Desktop" is user-visible in browser tab and SERP snippet |
| **Meta description** | None | 🔴 Missing — Google writes its own, losing intent match |
| **H1** | "Top Weight Loss Medications Providers – 2026" | 🟡 Generic, no injection/shot language |
| **Keyword "weight reduction shots"** | 0 occurrences | 🔴 Zero match |
| **Keyword "shots"** | 0 occurrences | 🔴 Zero match |
| **Keyword "injections"** | Appears in section header only ("Why Choose Weight Loss Injections?") | 🟡 Buried, not in title/meta/H1 |
| **Partners listed** | 9: MEDVi(9.8), SkinnyRx(9.4), Sprout(9.1), Eden(8.8), Ro(8.6), Hers(8.4), Hims(8.2), ClinicSecret(8.0), MyStart(7.8) | — |
| **Pricing shown** | MEDVi $179, Eden $139 first month | 🟡 No Ro/TrimRX lower prices shown |
| **Trust signals** | "72% of users claimed this offer", "Last updated: May 2026" | 🟡 Thin |

**The title bug is the most urgent problem.** A user who searches "weight reduction shots", sees our ad, clicks it, and then sees a browser tab that says "Top 5 Weight Loss Medications Google Desktop" will immediately doubt the page's legitimacy. This likely hurts CVR independently of keyword mismatch.

### Page 2: `/tables/top-5-weight-loss-injections/` (better match, but NOT what the ad serves)

| Signal | Value | Issue |
|---|---|---|
| **Page title** | "Top 5 Weight Loss Injections - Top 5 Weight Choices" | 🟢 Better — has "injections" |
| **Meta description** | None | 🔴 Still missing |
| **H1** | "Top Weight Loss Injections" | 🟢 Better match to intent |
| **Keyword "shots"** | 0 occurrences | 🔴 Still zero |
| **Partners listed** | 7: MEDVi(9.8), Eden(9.4), Sprout(9.1), Shed(8.8), MyStart(8.6), Hims(8.4), ClinicSecret(8.2) | — |

**This page is a significantly better landing page for "weight reduction shots" than the current one being served.** Switching the ad destination, or creating a dedicated variant, would improve relevance immediately.

### Keyword Optimization Gap (both pages)

The phrase "weight reduction shots" and "shots" do not appear anywhere on either page. Competitors who rank well for adjacent terms (like MedVidi.com blog) use headings such as "How Prescription Weight Loss Shots Work" and "Top-Rated Weight Loss Injections". Our pages don't match this language at all.

---

## 5. Competitive Landscape — Who Ranks Our Partners Where

The table below shows partner rankings across major comparison sites (snapshot: Apr 30, 2026):

| Partner | **Our Go-DT LP** | Forbes Health | Top10 | Yahoo Health | ConsumerHealthDigest |
|---|---|---|---|---|---|
| **Ro** | #5 | #2 | #2 | **#1** | Not listed |
| **MEDVi** | **#1** | #6 | #4 | Not listed | #2 |
| TrimRX | Not listed | Not listed | **#1** | #3 | Not listed |
| RemedyMeds | Not listed | **#1** | Not listed | Not listed | Not listed |
| Noom | Not listed | #3 | #3 | #7 | Not listed |
| WeightWatchers | Not listed | #9 | Not listed | #2 | Not listed |
| Sprout | #3 | #7 | #7 | #6 | Not listed |
| Eden | #4 | Not listed | Not listed | Not listed | Not listed |
| Hims | #7 | Not listed | Not listed | Not listed | Not listed |

**Key finding: Ro is the market consensus #1.** Every major editorial comparison site ranks Ro at #1 or #2. We rank them #5 on our Google Desktop LP and don't feature them prominently on our table (`/tables/`). There is a structural tension between our affiliate interest (MEDVi at #1) and market consensus (Ro at #1).

---

## 6. Competitor Page Analysis (What They Do Well)

### Ro (`ro.co/weight-loss/injections/`)
- Page 403'd — protected behind auth, but from other pages:
  - Price anchor: **"Get started for $39, then as low as $74/month"** with annual plan
  - Offers FDA-approved Wegovy + Foundayo™ pills + compounded options
  - Strong editorial presence — ranked #1 on Yahoo, Forbes, Top10

### Hims (`hims.com/weight-loss`)
- Page 403'd — protected behind auth
- Positioning: Weight loss for men specifically

### MedVidi Blog (`medvidi.com/blog/best-weight-loss-injections`)
- Title: "Best Weight Loss Injections: 5 Most Effective & Safest Diet Shots in 2025"
- Uses **"diet shots"** and **"weight loss shots"** interchangeably with "injections"
- Has "How Prescription Weight Loss Shots Work" as a heading — directly targeting the "shots" user language
- Medical reviewer credited — trust signal we lack
- Full FAQ section with 8 structured questions for featured snippet capture

### Top10 (`top10.com/weight-loss-treatments/weight-loss-injections-comparison`)
- Title: "Compare The Best Weight Loss Drugs in 2026"
- H1: "Best Weight Loss Injections of 2026"
- Meta description: "Easily compare the best weight loss drugs. Choose the weight loss drug for your needs today." — actual meta description exists
- #1 is TrimRX at $149, then Ro at $2, Noom at $69
- They have a meta description — we do not

### Yahoo Health (`health.yahoo.com/p/best-weight-loss-meds/`)
- Title: "Best weight loss medications of 2026"
- Meta description: "Yahoo Health recommends trusted telemedicine platforms that can prescribe weight loss medications. While we aren't a medical provider, we're here to help you understand your options."
- Prominent disclaimer of neutrality — adds trust
- Ro #1, WeightWatchers #2, TrimRX #3

---

## 7. MEDVi (Our #1 Partner) — Claim Verification

**What we show on our table:**
- Score: 9.8
- Promo: "$179 + Free Shipping with code TOP5WL"
- Partner claim: #1 ranked provider

**What MEDVi actually claims on their landing page:**

| Claim | Present on MEDVi Site | Mentioned on Our Table |
|---|---|---|
| "6x more weight loss than exercise and diet alone" | Yes | No |
| "Lose an average of 18% of your body weight" | Yes | No |
| "93% kept the weight off for good" | Yes | No |
| "500,000+ MEDVi patients" | Yes | No |
| Featured in Bloomberg, Forbes, NYT | Yes | No |
| $179 first month | Yes | Yes |
| **$299 refills (recurring price)** | Yes — prominently | **No — hidden** |
| Wegovy/Zepbound brand-name option available | Yes | No |
| HSA/FSA eligible | Yes | No |
| 24/7 support | Yes | No |

**The recurring price problem is the most significant.** We advertise MEDVi at $179 and rank them #1. After month 1 the price is $299 — a 67% increase. Ro's recurring price is $74/month. A user who clicks MEDVi from our table, subscribes, and then sees $299 on month 2 has been misled. This creates churn and trust problems.

---

## 8. User Journey — Full Friction Map

```
[Search: "weight reduction shots"]
         ↓
[SERP: Our ad appears]
  ⚠️ Ad copy unknown — likely says "medications" not "shots"
  → Intent mismatch at impression level → lower CTR
         ↓
[Click → Landing Page: /compare/top-5-weight-loss-medications-go-dt/]
  🔴 Title says "Google Desktop" — credibility hit
  🔴 No meta description — missed SERP preview opportunity
  🔴 Page never mentions "shots" or "weight reduction" — relevance miss
  🟡 Partner list has 9 options (good depth) but Ro is at #5
  🔴 MEDVi shown at $179, actual recurring is $299
         ↓
[Click: MEDVi "Visit Site"]
  🟢 MEDVi page is professional, strong trust signals
  🟢 500K+ patients, media coverage, 5-star reviews
  🟡 GLP-1 language used ("injections") — never "shots"
  🔴 Price shock: $299/month after first month not front-loaded
         ↓
[Conversion: Goal event = funnel_step='step_3']
  ⚠️ Conversion data requires BigQuery
```

---

## 9. Data I Couldn't Get (BigQuery Locked)

The following would complete this analysis if BigQuery auth is resolved:

| Query | What it would tell us |
|---|---|
| `ads_SearchQueryStats_4808949235` WHERE search_term LIKE '%weight reduction shot%' | CTR, impressions, clicks, conversions for this exact term |
| `ads_Keyword_4808949235` JOIN `ads_Campaign` | Which campaign/ad group serves this keyword, match type |
| `ads_Ad_4808949235` WHERE ad_group_id = [result above] | Exact RSA headlines and descriptions being shown |
| `BingAds.ad_performance` WHERE campaign_name LIKE '%weight%' | Bing performance for same keyword pattern |
| `visits` WHERE landing_page LIKE '%go-dt%' JOIN `conversions` | CVR and EPV for the specific LP serving this keyword |

---

## 10. Priority Recommendations

### Immediate (no dev work)

1. **Fix the LP title bug** — Remove "Google Desktop" from the HTML `<title>` tag of `/compare/top-5-weight-loss-medications-go-dt/`. This is a one-line fix and is hurting every campaign that uses this LP.

2. **Add meta descriptions to all LPs** — None of our landing pages have a meta description. Write one per LP that includes the keyword intent (e.g., "Compare the top weight loss injection providers for 2026. Find affordable semaglutide and tirzepatide programs from $139/month.").

3. **Add MEDVi's recurring price** — Show "$179 first month, $299/month ongoing" not just "$179". Hiding the real price breaks user trust and increases churn.

### Keyword-specific (1-3 days)

4. **Switch the ad destination** for "weight reduction shots" (and "weight loss shots", "diet shots") to `/tables/top-5-weight-loss-injections/` — it has "injections" in title and H1 and is a better intent match.

5. **Add "shots" language to the injections LP** — In the H1 or first paragraph, add: "Looking for weight loss shots? Here are the top-rated GLP-1 injection programs..." This captures the colloquial searcher without changing the page's primary focus.

6. **Create a dedicated page or LP variant for "weight reduction shots"** — Target this exact phrase with a page titled "Best Weight Reduction Shots 2026 | Compare GLP-1 Programs". Since no competitor targets this phrase, a 1,500-word page could rank in position 1-3 organically with minimal competition.

### Strategic (1-2 weeks)

7. **Review Ro's ranking position** — Ro is the market consensus #1 across Forbes, Yahoo, Top10. We have them at #5 on the Google Desktop LP. Either negotiate better affiliate terms with Ro, feature them more prominently, or accept that our rankings diverge from market consensus and have a reason for it.

8. **Surface MEDVi's trust signals on our table** — "500,000+ patients", "featured in Bloomberg/Forbes/NYT", "HSA/FSA eligible" are strong conversion signals that we're not passing to users. Our current table only shows score, price, and a promo code.

9. **Add a "weight loss shots" heading section** to the comparison pages — A section titled "Top Weight Loss Shots vs. Injections: What's the Difference?" would capture colloquial searchers and could improve organic ranking for the shots-variant keyword cluster.

---

## 11. Competitive Scoring Summary

| Dimension | Us | Competitors (Ro, Top10, Yahoo) |
|---|---|---|
| Keyword match for "weight reduction shots" | 🔴 0/10 — never mentioned | 🟡 4/10 — use "injections", "shots" sometimes |
| Meta description | 🔴 Missing | 🟢 Present on Top10, Yahoo Health |
| Page title quality | 🔴 Contains "Google Desktop" | 🟢 Clean, keyword-rich |
| Partner price transparency | 🔴 Shows intro price only | 🟢 Ro shows monthly plan price clearly |
| Trust signals on comparison | 🟡 Score + price + promo | 🟢 Medical reviewers, patient counts, studies cited |
| Partner depth | 🟢 7-9 providers | 🟡 5-10 providers depending on site |
| Mobile optimization | ⚠️ Not tested | — |
| Organic keyword coverage | 🔴 "medications" only | 🟢 "injections", "shots", "medications" all used |
