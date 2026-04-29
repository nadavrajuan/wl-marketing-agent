import { getPartnerOutboundInsights, getPartnerOutboundSummary } from "@/lib/analytics-wl";
import { getBingAdCopyDiagnostics } from "@/lib/bing-ads-transfer";
import { getGoogleAdCopyDiagnostics } from "@/lib/google-ads-transfer";
import { getPartnerResearch } from "@/lib/intelligence";
import { getRecommendationFeedbackMap, isRecommendationFeedbackEnabled } from "@/lib/recommendation-feedback";
import {
  getCampaigns,
  getKeywordOpportunities,
  getLandingPages,
  getSearchQueries,
} from "@/lib/weight-agent";

type NumericLike = string | number | null | undefined;

type FeedbackView = {
  verdict: "good" | "ok" | "bad";
  note: string | null;
  updated_at: string;
};

export type RecommendationCard = {
  id: string;
  area: "google_assets" | "bing_assets" | "keywords" | "budgets" | "landing_pages" | "partners" | "search_terms";
  depth: "deep" | "light";
  platform: string;
  priority: "high" | "medium";
  action_type: "pause" | "rewrite" | "scale" | "shift_budget" | "tighten_targeting" | "review_lp" | "review_partner_mix";
  title: string;
  summary: string;
  problem: string;
  why_now: string;
  metrics: Array<{ label: string; value: string }>;
  evidence: string[];
  actions: string[];
  competitor_moves: string[];
  copy_snippets: string[];
  feedback: FeedbackView | null;
};

function toNumber(value: NumericLike) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

function pct(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(2)}%`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseAssetJson(raw: unknown, kind: "google" | "bing") {
  if (typeof raw !== "string" || !raw.trim()) {
    return [] as Array<{ text: string; label: string; pinned: string | null }>;
  }

  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        text: typeof item.text === "string" ? item.text : "",
        label:
          kind === "google"
            ? (typeof item.assetPerformanceLabel === "string" ? item.assetPerformanceLabel : "UNKNOWN")
            : "LIVE",
        pinned:
          kind === "google"
            ? (typeof item.pinnedField === "string" ? item.pinnedField : null)
            : (typeof item.pin_position === "string" ? item.pin_position : null),
      }))
      .filter((item) => item.text);
  } catch {
    return [];
  }
}

function detectTopic(text: string) {
  const lower = text.toLowerCase();
  if (/(price|cost|cheap|affordable)/.test(lower)) return "price";
  if (/(tirzepatide|mounjaro|zepbound)/.test(lower)) return "tirzepatide";
  if (/(semaglutide|wegovy|ozempic)/.test(lower)) return "semaglutide";
  if (/(pill|oral|tablet)/.test(lower)) return "oral";
  if (/(shot|injection)/.test(lower)) return "injection";
  if (/(ro|medvi|skinnyrx|sprout|eden|fridays)/.test(lower)) return "brand";
  return "generic";
}

type Snapshot = Awaited<ReturnType<typeof getPartnerResearch>>["snapshots"][number];

function buildCompetitorMoves(topic: string, snapshots: Snapshot[], partnerHint?: string | null) {
  const live = snapshots.filter((snapshot) => snapshot.ok);
  const moves: string[] = [];

  const partnerSpecific =
    partnerHint &&
    live.find((snapshot) => snapshot.partner?.toLowerCase() === partnerHint.toLowerCase());
  if (partnerSpecific) {
    const headline = partnerSpecific.h1 || partnerSpecific.headings?.[0] || partnerSpecific.title || partnerSpecific.name;
    moves.push(`Check ${partnerSpecific.name}: its visible framing is "${headline}". Borrow the angle only if our landing page can actually fulfill it.`);
  }

  if (topic === "price") {
    const priced = live.find((snapshot) => (snapshot.prices?.length || 0) > 0);
    if (priced) {
      moves.push(`Price-sensitive traffic needs faster qualification. ${priced.name} shows price anchors like ${priced.prices?.slice(0, 2).join(" / ")}; if we do not show price quickly, soften price-led ad promises.`);
    }
  } else if (topic === "injection" || topic === "tirzepatide" || topic === "semaglutide") {
    const clinician = live.find((snapshot) => snapshot.signals?.clinician);
    if (clinician) {
      moves.push(`Medical/drug-intent users are seeing clinician-led language in-market. Compare against ${clinician.name} and make our ad/LP path clearer about provider fit, not just drug awareness.`);
    }
  } else if (topic === "brand") {
    const support = live.find((snapshot) => snapshot.signals?.coaching);
    if (support) {
      moves.push(`Support-led competitors like ${support.name} emphasize coaching/support language. Use that only when the downstream experience truly supports it.`);
    }
  }

  if (moves.length === 0 && live[0]) {
    const fallback = live[0];
    const cue = fallback.h1 || fallback.headings?.[0] || fallback.title || fallback.name;
    moves.push(`Spot-check ${fallback.name}: its live positioning cue is "${cue}". Use it as a contrast point before rewriting our copy.`);
  }

  return moves.slice(0, 2);
}

function withFeedback(cards: RecommendationCard[], feedbackMap: Map<string, { verdict: "good" | "ok" | "bad"; note: string | null; updated_at: string }>) {
  return cards.map((card) => ({
    ...card,
    feedback: feedbackMap.get(card.id) || null,
  }));
}

export async function getRecommendationCards(params: URLSearchParams) {
  const [
    keywordRows,
    campaignRows,
    landingPages,
    searchQueries,
    googleAdsRaw,
    bingAdsRaw,
    outboundRows,
    outboundSummary,
    partnerResearch,
  ] = await Promise.all([
    getKeywordOpportunities(params, 500),
    getCampaigns(params),
    getLandingPages(params, 200),
    getSearchQueries(params, 150),
    getGoogleAdCopyDiagnostics(params, 120),
    getBingAdCopyDiagnostics(params, 120),
    getPartnerOutboundInsights(params, 300),
    getPartnerOutboundSummary(params),
    getPartnerResearch(),
  ]);

  const keywords = (keywordRows as Record<string, unknown>[]).map((row) => ({
    platform: String(row.platform_id || "unknown"),
    keyword: String(row.keyword || "unknown"),
    top_campaign: String(row.top_campaign || "unknown"),
    top_landing_page: String(row.top_landing_page || "unknown"),
    visits: toNumber(row.visits as NumericLike),
    add_to_carts: toNumber(row.add_to_carts as NumericLike),
    net_purchases: toNumber(row.net_purchases as NumericLike),
    estimated_spend: toNumber(row.estimated_spend as NumericLike),
    purchase_revenue: toNumber(row.purchase_revenue as NumericLike),
    purchase_profit: toNumber(row.purchase_profit as NumericLike),
    purchase_roi_pct: row.purchase_roi_pct == null ? null : toNumber(row.purchase_roi_pct as NumericLike),
    purchase_rate_per_visit: row.purchase_rate_per_visit == null ? null : toNumber(row.purchase_rate_per_visit as NumericLike),
    profit_gap_to_break_even: toNumber(row.profit_gap_to_break_even as NumericLike),
    diagnosis: String(row.diagnosis || ""),
    spend_confidence: String(row.spend_confidence || "unknown"),
  }));

  const campaigns = (campaignRows as Record<string, unknown>[]).map((row) => ({
    campaign_id: String(row.campaign_id || "unknown"),
    campaign_name: String(row.campaign_name || row.campaign_id || "unknown"),
    platform: String(row.platform || "unknown"),
    visits: toNumber(row.visits as NumericLike),
    add_to_carts: toNumber(row.add_to_carts as NumericLike),
    purchases: toNumber(row.purchases as NumericLike),
    spend: toNumber(row.spend as NumericLike),
    purchase_revenue: toNumber(row.purchase_revenue as NumericLike),
    purchase_profit: toNumber(row.purchase_profit as NumericLike),
    purchase_roi_pct: row.purchase_roi_pct == null ? null : toNumber(row.purchase_roi_pct as NumericLike),
    purchase_rate_per_visit: row.purchase_rate_per_visit == null ? null : toNumber(row.purchase_rate_per_visit as NumericLike),
    click_to_visit_match_pct: row.click_to_visit_match_pct == null ? null : toNumber(row.click_to_visit_match_pct as NumericLike),
  }));

  const landing = (landingPages as Record<string, unknown>[]).map((row) => ({
    platform: String(row.platform_id || "unknown"),
    landing_page_path: String(row.landing_page_path || "unknown"),
    quiz_starts: toNumber(row.quiz_starts as NumericLike),
    net_purchases: toNumber(row.net_purchases as NumericLike),
    purchase_rate: row.purchase_rate == null ? null : toNumber(row.purchase_rate as NumericLike),
  }));

  const queries = (searchQueries as Record<string, unknown>[]).map((row) => ({
    platform: String(row.platform_id || "unknown"),
    search_query: String(row.search_query || "unknown"),
    top_campaign: String(row.top_campaign || "unknown"),
    mapped_keyword: String(row.mapped_keyword || "unknown"),
    spend: toNumber(row.spend as NumericLike),
    estimated_net_purchases: toNumber(row.estimated_net_purchases as NumericLike),
    estimated_purchase_profit: toNumber(row.estimated_purchase_profit as NumericLike),
    estimated_purchase_roi_pct:
      row.estimated_purchase_roi_pct == null ? null : toNumber(row.estimated_purchase_roi_pct as NumericLike),
  }));

  const googleAds = (googleAdsRaw as Record<string, unknown>[]).map((row) => ({
    platform: "google",
    ad_id: String(row.ad_id || "unknown"),
    campaign_name: String(row.campaign_name || "unknown"),
    ad_name: row.ad_name ? String(row.ad_name) : null,
    ad_strength: row.ad_strength ? String(row.ad_strength) : null,
    approval_status: row.approval_status ? String(row.approval_status) : null,
    ad_status: row.ad_status ? String(row.ad_status) : null,
    spend: toNumber(row.spend as NumericLike),
    clicks: toNumber(row.clicks as NumericLike),
    impressions: toNumber(row.impressions as NumericLike),
    matched_click_visits: toNumber(row.matched_click_visits as NumericLike),
    add_to_carts: toNumber(row.add_to_carts as NumericLike),
    net_purchases: toNumber(row.net_purchases as NumericLike),
    purchase_profit: toNumber(row.purchase_profit as NumericLike),
    purchase_roi_pct: row.purchase_roi_pct == null ? null : toNumber(row.purchase_roi_pct as NumericLike),
    sample_keywords:
      typeof row.sample_keywords === "string" && row.sample_keywords.trim()
        ? row.sample_keywords.split(" | ").map((value) => value.trim()).filter(Boolean)
        : [],
    sample_landing_pages:
      typeof row.sample_landing_pages === "string" && row.sample_landing_pages.trim()
        ? row.sample_landing_pages.split(" | ").map((value) => value.trim()).filter(Boolean)
        : [],
    headlines: parseAssetJson(row.headlines_json, "google"),
    descriptions: parseAssetJson(row.descriptions_json, "google"),
  }));

  const bingAds = (bingAdsRaw as Record<string, unknown>[]).map((row) => ({
    platform: "bing",
    ad_id: String(row.ad_id || "unknown"),
    campaign_name: String(row.campaign_name || "unknown"),
    ad_name: row.ad_name ? String(row.ad_name) : null,
    ad_status: row.ad_status ? String(row.ad_status) : null,
    spend: toNumber(row.spend as NumericLike),
    clicks: toNumber(row.clicks as NumericLike),
    impressions: toNumber(row.impressions as NumericLike),
    matched_click_visits: toNumber(row.matched_click_visits as NumericLike),
    add_to_carts: toNumber(row.add_to_carts as NumericLike),
    net_purchases: toNumber(row.net_purchases as NumericLike),
    purchase_profit: toNumber(row.purchase_profit as NumericLike),
    purchase_roi_pct: row.purchase_roi_pct == null ? null : toNumber(row.purchase_roi_pct as NumericLike),
    sample_keywords:
      typeof row.sample_keywords === "string" && row.sample_keywords.trim()
        ? row.sample_keywords.split(" | ").map((value) => value.trim()).filter(Boolean)
        : [],
    sample_landing_pages:
      typeof row.sample_landing_pages === "string" && row.sample_landing_pages.trim()
        ? row.sample_landing_pages.split(" | ").map((value) => value.trim()).filter(Boolean)
        : [],
    headlines: parseAssetJson(row.headlines_json, "bing"),
    descriptions: parseAssetJson(row.descriptions_json, "bing"),
  }));

  const outbound = (outboundRows as Record<string, unknown>[]).map((row) => ({
    platform: String(row.platform_id || "unknown"),
    campaign_id: String(row.campaign_id || "unknown"),
    keyword: String(row.keyword || "unknown"),
    landing_page_path: String(row.landing_page_path || "unknown"),
    partner_name: String(row.partner_name || "unknown"),
    rank: toNumber(row.rank as NumericLike),
    outbound_events: toNumber(row.outbound_events as NumericLike),
    unique_visits: toNumber(row.unique_visits as NumericLike),
    net_partner_purchases: toNumber(row.net_partner_purchases as NumericLike),
    partner_purchase_rate_per_outbound_visit:
      row.partner_purchase_rate_per_outbound_visit == null
        ? null
        : toNumber(row.partner_purchase_rate_per_outbound_visit as NumericLike),
  }));

  const outboundByLandingPage = new Map<string, typeof outbound>();
  for (const row of outbound) {
    const existing = outboundByLandingPage.get(row.landing_page_path) || [];
    existing.push(row);
    outboundByLandingPage.set(row.landing_page_path, existing);
  }

  const outboundByCampaign = new Map<string, typeof outbound>();
  for (const row of outbound) {
    const existing = outboundByCampaign.get(row.campaign_id) || [];
    existing.push(row);
    outboundByCampaign.set(row.campaign_id, existing);
  }

  const researchSnapshots = partnerResearch.snapshots;

  const deepCards: RecommendationCard[] = [];

  const weakestGoogleAds = googleAds
    .filter((row) => row.spend >= 250 && row.purchase_profit < 0)
    .sort((a, b) => a.purchase_profit - b.purchase_profit || b.spend - a.spend)
    .slice(0, 5);

  for (const ad of weakestGoogleAds) {
    const relatedQueries = queries
      .filter((row) => row.top_campaign === ad.campaign_name)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3);
    const landingRows = ad.sample_landing_pages.flatMap((landingPage) => outboundByLandingPage.get(landingPage) || []);
    const topOutbound = [...landingRows]
      .sort((a, b) => b.outbound_events - a.outbound_events)
      .slice(0, 2);
    const topic = detectTopic(`${ad.campaign_name} ${ad.sample_keywords.join(" ")} ${ad.headlines.map((item) => item.text).join(" ")}`);
    deepCards.push({
      id: `google-asset-${slugify(ad.ad_id)}`,
      area: "google_assets",
      depth: "deep",
      platform: "google",
      priority: "high",
      action_type: ad.net_purchases <= 0 ? "pause" : "rewrite",
      title: `Google RSA underperforming in ${ad.campaign_name}`,
      summary: `${money(ad.spend)} spend produced ${ad.net_purchases} net purchases and ${money(ad.purchase_profit)} purchase profit.`,
      problem: "This Google RSA asset package is attracting expensive traffic without enough purchase payoff. The issue is not only volume; it is volume at weak purchase economics.",
      why_now: `Current ROI is ${pct(ad.purchase_roi_pct)}. Leaving it live as-is keeps spending into a negative purchase-profit pocket.`,
      metrics: [
        { label: "Spend", value: money(ad.spend) },
        { label: "Clicks", value: ad.clicks.toLocaleString() },
        { label: "Visits", value: ad.matched_click_visits.toLocaleString() },
        { label: "Net Purchases", value: ad.net_purchases.toLocaleString() },
        { label: "Profit", value: money(ad.purchase_profit) },
        { label: "ROI", value: pct(ad.purchase_roi_pct) },
      ],
      evidence: [
        ad.sample_keywords.length > 0 ? `Sample keywords: ${ad.sample_keywords.join(", ")}.` : "No sample keyword surfaced from matched clicks.",
        relatedQueries.length > 0
          ? `Related search terms spending the most in this campaign: ${relatedQueries.map((row) => `${row.search_query} (${money(row.spend)})`).join("; ")}.`
          : "No search-term breakout matched this campaign in the current result set.",
        topOutbound.length > 0
          ? `On linked landing pages, users are clicking out mostly to ${topOutbound.map((row) => `${row.partner_name} (rank ${row.rank}, ${row.outbound_events} clicks)`).join("; ")}.`
          : "No partner-outbound evidence was matched for the sampled landing pages.",
      ],
      actions: [
        ad.net_purchases <= 0 ? "Pause this RSA if another ad in the same campaign has better purchase profit." : "Keep the campaign live, but replace the current copy package before adding more budget.",
        `Rewrite the headline set around a narrower ${topic} promise. Stop leading with broad curiosity language if the queries are already high intent.`,
        ad.headlines[0] ? `First copy rewrite target: replace "${ad.headlines[0].text}" with a more specific provider-comparison line tied to the landing page.` : "Rewrite the top headline with a more specific provider-comparison line tied to the landing page.",
      ],
      competitor_moves: buildCompetitorMoves(topic, researchSnapshots, topOutbound[0]?.partner_name || null),
      copy_snippets: [
        ...ad.headlines.slice(0, 3).map((item) => `Headline (${item.label}${item.pinned ? ` / ${item.pinned}` : ""}): ${item.text}`),
        ...ad.descriptions.slice(0, 1).map((item) => `Description (${item.label}): ${item.text}`),
      ],
      feedback: null,
    });
  }

  const weakestBingAds = bingAds
    .filter((row) => row.spend >= 250 && row.purchase_profit < 0)
    .sort((a, b) => a.purchase_profit - b.purchase_profit || b.spend - a.spend)
    .slice(0, 5);

  for (const ad of weakestBingAds) {
    const landingRows = ad.sample_landing_pages.flatMap((landingPage) => outboundByLandingPage.get(landingPage) || []);
    const topOutbound = [...landingRows]
      .sort((a, b) => b.outbound_events - a.outbound_events)
      .slice(0, 2);
    const topic = detectTopic(`${ad.campaign_name} ${ad.sample_keywords.join(" ")} ${ad.headlines.map((item) => item.text).join(" ")}`);
    deepCards.push({
      id: `bing-asset-${slugify(ad.ad_id)}`,
      area: "bing_assets",
      depth: "deep",
      platform: "bing",
      priority: "high",
      action_type: ad.net_purchases <= 0 ? "pause" : "rewrite",
      title: `Bing ad copy package underperforming in ${ad.campaign_name}`,
      summary: `${money(ad.spend)} spend produced ${ad.net_purchases} net purchases and ${money(ad.purchase_profit)} purchase profit.`,
      problem: "Bing now has native copy visibility, and this ad package is a clear candidate for rewrite or pause based on purchase economics.",
      why_now: `The ad is already large enough to be decision-worthy at ${pct(ad.purchase_roi_pct)} ROI.`,
      metrics: [
        { label: "Spend", value: money(ad.spend) },
        { label: "Clicks", value: ad.clicks.toLocaleString() },
        { label: "Visits", value: ad.matched_click_visits.toLocaleString() },
        { label: "Net Purchases", value: ad.net_purchases.toLocaleString() },
        { label: "Profit", value: money(ad.purchase_profit) },
        { label: "ROI", value: pct(ad.purchase_roi_pct) },
      ],
      evidence: [
        ad.sample_keywords.length > 0 ? `Sample keywords matched to this ad: ${ad.sample_keywords.join(", ")}.` : "No sample keywords were recovered for this Bing ad.",
        topOutbound.length > 0
          ? `Outbound click mix on its landing page leans to ${topOutbound.map((row) => `${row.partner_name} at rank ${row.rank}`).join("; ")}.`
          : "No partner-outbound mix was matched to the sampled landing pages.",
        ad.headlines.length > 0 ? `Visible headline package is live and inspectable now, so this is a copy decision instead of a blind optimization guess.` : "The ad still needs copy inspection, but performance already justifies intervention.",
      ],
      actions: [
        "Pause this Bing ad if it is one of multiple variants in the ad group and another variant has better purchase economics.",
        `Rewrite the headline package around a tighter ${topic} promise and a stronger LP match.`,
        ad.descriptions[0] ? `Start by replacing the current description "${ad.descriptions[0].text}" with a simpler comparison/value sentence.` : "Start by simplifying the description set so the promise is cleaner before the click.",
      ],
      competitor_moves: buildCompetitorMoves(topic, researchSnapshots, topOutbound[0]?.partner_name || null),
      copy_snippets: [
        ...ad.headlines.slice(0, 3).map((item) => `Headline${item.pinned ? ` / ${item.pinned}` : ""}: ${item.text}`),
        ...ad.descriptions.slice(0, 1).map((item) => `Description: ${item.text}`),
      ],
      feedback: null,
    });
  }

  const keywordTargets = keywords
    .filter((row) => row.estimated_spend >= 250)
    .sort((a, b) => b.profit_gap_to_break_even - a.profit_gap_to_break_even || a.purchase_profit - b.purchase_profit)
    .slice(0, 5);

  for (const row of keywordTargets) {
    const topic = detectTopic(row.keyword);
    const relatedQueries = queries
      .filter((query) => query.mapped_keyword.toLowerCase() === row.keyword.toLowerCase() || query.search_query.toLowerCase().includes(row.keyword.toLowerCase()))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3);
    const outboundMix = (outboundByLandingPage.get(row.top_landing_page) || [])
      .sort((a, b) => b.outbound_events - a.outbound_events)
      .slice(0, 2);
    const actionType: RecommendationCard["action_type"] = row.purchase_profit > 0 ? "scale" : "tighten_targeting";
    deepCards.push({
      id: `keyword-${slugify(`${row.platform}-${row.keyword}`)}`,
      area: "keywords",
      depth: "deep",
      platform: row.platform,
      priority: "high",
      action_type: actionType,
      title: `${row.purchase_profit > 0 ? "Scale" : "Tighten or cut"} keyword "${row.keyword}"`,
      summary: `${money(row.estimated_spend)} spend, ${row.net_purchases} net purchases, ${money(row.purchase_profit)} purchase profit in ${row.top_campaign}.`,
      problem:
        row.purchase_profit > 0
          ? "This keyword has already proven it can produce purchase profit and should be considered for controlled scale."
          : "This keyword is not earning its keep at the purchase level and needs tighter targeting, a better promise, or a pause.",
      why_now: `Current purchase rate per visit is ${pct(row.purchase_rate_per_visit)} and the spend gap to break-even is ${money(row.profit_gap_to_break_even)}.`,
      metrics: [
        { label: "Spend", value: money(row.estimated_spend) },
        { label: "Visits", value: row.visits.toLocaleString() },
        { label: "Net Purchases", value: row.net_purchases.toLocaleString() },
        { label: "Revenue", value: money(row.purchase_revenue) },
        { label: "Profit", value: money(row.purchase_profit) },
        { label: "Visit CVR", value: pct(row.purchase_rate_per_visit) },
      ],
      evidence: [
        `Top campaign: ${row.top_campaign}. Top landing page: ${row.top_landing_page}.`,
        relatedQueries.length > 0
          ? `Closest live search terms: ${relatedQueries.map((query) => `${query.search_query} (${money(query.spend)}, ${money(query.estimated_purchase_profit)} profit)`).join("; ")}.`
          : "No search-term detail matched this keyword in the current extract.",
        outboundMix.length > 0
          ? `On the current landing page, outbound clicks go mostly to ${outboundMix.map((item) => `${item.partner_name} (rank ${item.rank})`).join("; ")}.`
          : "No outbound partner mix matched the current landing page.",
      ],
      actions: row.purchase_profit > 0
        ? [
            `Increase budget or bid carefully in ${row.top_campaign}, but only while purchase profit stays positive.`,
            `Clone the winning intent into a closer-matched ad copy package focused on ${topic}.`,
            "Watch search-term drift before scaling broadly.",
          ]
        : [
            `If this keyword is broad, tighten match type or add negatives before spending more.`,
            `Change the ad promise so it matches ${row.top_landing_page} more closely, or route to a better page.`,
            row.net_purchases <= 0 ? "Pause the keyword if you already have better-performing alternatives in the same theme." : "Keep only if the next copy/page test is tightly scoped and time-boxed.",
          ],
      competitor_moves: buildCompetitorMoves(topic, researchSnapshots, outboundMix[0]?.partner_name || null),
      copy_snippets: row.top_campaign ? [`Current campaign context: ${row.top_campaign}`] : [],
      feedback: null,
    });
  }

  const loserCampaigns = campaigns
    .filter((row) => row.spend >= 1000 && row.purchase_profit < 0)
    .sort((a, b) => a.purchase_profit - b.purchase_profit)
    .slice(0, 3);
  const winnerCampaigns = campaigns
    .filter((row) => row.spend >= 250 && row.purchase_profit > 0)
    .sort((a, b) => (b.purchase_roi_pct || 0) - (a.purchase_roi_pct || 0))
    .slice(0, 2);

  for (const row of [...loserCampaigns, ...winnerCampaigns]) {
    const relatedKeywords = keywords
      .filter((keyword) => keyword.top_campaign === row.campaign_name)
      .sort((a, b) => b.estimated_spend - a.estimated_spend)
      .slice(0, 3);
    const outboundMix = (outboundByCampaign.get(row.campaign_id) || [])
      .sort((a, b) => b.outbound_events - a.outbound_events)
      .slice(0, 3);
    const scale = row.purchase_profit > 0;
    deepCards.push({
      id: `budget-${slugify(`${row.platform}-${row.campaign_id}`)}`,
      area: "budgets",
      depth: "deep",
      platform: row.platform,
      priority: "high",
      action_type: scale ? "shift_budget" : "shift_budget",
      title: `${scale ? "Move more budget into" : "Pull budget from"} ${row.campaign_name}`,
      summary: `${money(row.spend)} spend, ${row.purchases} purchases, ${money(row.purchase_profit)} purchase profit, ${pct(row.purchase_roi_pct)} ROI.`,
      problem: scale
        ? "This campaign is proving it can create purchase profit and may deserve a larger share of budget than weaker campaigns."
        : "This campaign is consuming budget without enough purchase return, so it should not keep the same share of spend.",
      why_now: `Click-to-visit coverage is ${pct(row.click_to_visit_match_pct)} and visit CVR is ${pct(row.purchase_rate_per_visit)}.`,
      metrics: [
        { label: "Spend", value: money(row.spend) },
        { label: "Visits", value: row.visits.toLocaleString() },
        { label: "Purchases", value: row.purchases.toLocaleString() },
        { label: "Profit", value: money(row.purchase_profit) },
        { label: "ROI", value: pct(row.purchase_roi_pct) },
        { label: "Click→Visit", value: pct(row.click_to_visit_match_pct) },
      ],
      evidence: [
        relatedKeywords.length > 0
          ? `Top keyword pockets: ${relatedKeywords.map((keyword) => `${keyword.keyword} (${money(keyword.purchase_profit)} profit)`).join("; ")}.`
          : "No keyword breakout matched this campaign.",
        outboundMix.length > 0
          ? `Partner click mix in this campaign leans to ${outboundMix.map((item) => `${item.partner_name} (${item.outbound_events} outbound clicks)`).join("; ")}.`
          : "No partner-outbound rows matched this campaign.",
        scale
          ? "This is a scale candidate only if the winning keyword/ad pockets stay stable while budget increases."
          : "This is a cut candidate because the loss is happening after enough spend to trust the signal.",
      ],
      actions: scale
        ? [
            "Shift budget into this campaign in small controlled steps instead of doubling it immediately.",
            "Concentrate incremental spend behind the best-performing ad and keyword subsets first.",
            "Use search-term and partner-outbound monitoring as the guardrail during scale.",
          ]
        : [
            "Reduce budget here before touching stronger campaigns.",
            "Keep only the winning keyword or ad pockets, and cut the rest.",
            "If the landing page promise is too broad, route the campaign to a tighter page before restoring spend.",
          ],
      competitor_moves: buildCompetitorMoves(detectTopic(row.campaign_name), researchSnapshots, outboundMix[0]?.partner_name || null),
      copy_snippets: relatedKeywords.slice(0, 2).map((keyword) => `Keyword context: ${keyword.keyword}`),
      feedback: null,
    });
  }

  const lightCards: RecommendationCard[] = [];

  const landingAlerts = landing
    .filter((row) => row.quiz_starts >= 50 && ((row.purchase_rate || 0) < 4 || row.net_purchases <= 0))
    .sort((a, b) => (a.purchase_rate || 0) - (b.purchase_rate || 0))
    .slice(0, 6);
  for (const row of landingAlerts) {
    const outboundMix = (outboundByLandingPage.get(row.landing_page_path) || [])
      .sort((a, b) => b.outbound_events - a.outbound_events)
      .slice(0, 2);
    lightCards.push({
      id: `landing-${slugify(`${row.platform}-${row.landing_page_path}`)}`,
      area: "landing_pages",
      depth: "light",
      platform: row.platform,
      priority: "medium",
      action_type: "review_lp",
      title: `Review landing page ${row.landing_page_path}`,
      summary: `${row.quiz_starts} starts and ${row.net_purchases} net purchases at ${pct(row.purchase_rate)}.`,
      problem: "Landing-page yield is weak versus the volume it is handling.",
      why_now: "This page is already absorbing enough intent to justify design/content review.",
      metrics: [
        { label: "Quiz Starts", value: row.quiz_starts.toLocaleString() },
        { label: "Net Purchases", value: row.net_purchases.toLocaleString() },
      ],
      evidence: [
        outboundMix.length > 0 ? `Top partner click mix: ${outboundMix.map((item) => `${item.partner_name} rank ${item.rank}`).join("; ")}.` : "No outbound mix matched.",
      ],
      actions: ["Check headline clarity, price expectation, and partner ordering on this page."],
      competitor_moves: buildCompetitorMoves("generic", researchSnapshots, outboundMix[0]?.partner_name || null),
      copy_snippets: [],
      feedback: null,
    });
  }

  const weakOutboundPartners = (outboundSummary as Record<string, unknown>[])
    .map((row) => ({
      partner_name: String(row.partner_name || "unknown"),
      outbound_events: toNumber(row.outbound_events as NumericLike),
      net_partner_purchases: toNumber(row.net_partner_purchases as NumericLike),
      partner_purchase_rate_per_outbound_visit:
        row.partner_purchase_rate_per_outbound_visit == null
          ? null
          : toNumber(row.partner_purchase_rate_per_outbound_visit as NumericLike),
    }))
    .filter((row) => row.outbound_events >= 20 && row.net_partner_purchases <= 0)
    .slice(0, 6);
  for (const row of weakOutboundPartners) {
    lightCards.push({
      id: `partner-${slugify(row.partner_name)}`,
      area: "partners",
      depth: "light",
      platform: "all",
      priority: "medium",
      action_type: "review_partner_mix",
      title: `Review outbound partner mix for ${row.partner_name}`,
      summary: `${row.outbound_events} outbound clicks are not translating into purchase truth.`,
      problem: "Users are clicking this partner, but the downstream purchase evidence is weak or negative.",
      why_now: "This is a leakage point between landing-page intent and realized partner conversion.",
      metrics: [
        { label: "Outbound Clicks", value: row.outbound_events.toLocaleString() },
        { label: "Net Purchases", value: row.net_partner_purchases.toLocaleString() },
      ],
      evidence: [],
      actions: ["Lower this partner in rankings or change the page framing if stronger partners are available for the same intent."],
      competitor_moves: buildCompetitorMoves("brand", researchSnapshots, row.partner_name),
      copy_snippets: [],
      feedback: null,
    });
  }

  const wastedQueries = queries
    .filter((row) => row.spend >= 500 && row.estimated_purchase_profit < 0)
    .sort((a, b) => a.estimated_purchase_profit - b.estimated_purchase_profit)
    .slice(0, 6);
  for (const row of wastedQueries) {
    lightCards.push({
      id: `query-${slugify(row.search_query)}`,
      area: "search_terms",
      depth: "light",
      platform: row.platform,
      priority: "medium",
      action_type: "tighten_targeting",
      title: `Review search term "${row.search_query}"`,
      summary: `${money(row.spend)} spend with ${money(row.estimated_purchase_profit)} estimated purchase profit in ${row.top_campaign}.`,
      problem: "Search-term intent looks expensive relative to purchase value.",
      why_now: "This is a direct place to add negatives, split intent, or sharpen ad copy.",
      metrics: [
        { label: "Spend", value: money(row.spend) },
        { label: "ROI", value: pct(row.estimated_purchase_roi_pct) },
      ],
      evidence: [`Mapped keyword: ${row.mapped_keyword}.`],
      actions: ["Consider negative-matching this query or isolating it into its own tighter ad group."],
      competitor_moves: buildCompetitorMoves(detectTopic(row.search_query), researchSnapshots, null),
      copy_snippets: [],
      feedback: null,
    });
  }

  const deepCardsLimited = deepCards.slice(0, 20);
  const allIds = [...deepCardsLimited, ...lightCards].map((card) => card.id);
  const feedbackMap = await getRecommendationFeedbackMap(allIds);

  return {
    summary: {
      deep_count: deepCardsLimited.length,
      light_count: lightCards.length,
      google_asset_count: weakestGoogleAds.length,
      bing_asset_count: weakestBingAds.length,
      feedback_enabled: isRecommendationFeedbackEnabled(),
    },
    deep_recommendations: withFeedback(deepCardsLimited, feedbackMap),
    light_recommendations: withFeedback(lightCards, feedbackMap),
  };
}
