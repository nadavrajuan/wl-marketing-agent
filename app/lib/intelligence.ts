import {
  getCampaigns,
  getKeywordOpportunities,
  getLandingPages,
  getMeasurementTruth,
  getPartners,
} from "@/lib/weight-agent";
import { getGoogleAdCopyDiagnostics } from "@/lib/google-ads-transfer";

type ThemeDef = {
  slug: string;
  label: string;
  category: "price" | "provider_brand" | "drug_brand" | "ingredient" | "format" | "comparison" | "generic";
  copyFocus: string;
  rewriteGoal: string;
  patterns: RegExp[];
};

type NumericLike = string | number | null | undefined;

type ThemeAggregate = {
  theme: string;
  label: string;
  category: ThemeDef["category"];
  copyFocus: string;
  rewriteGoal: string;
  total_events: number;
  quiz_starts: number;
  purchases: number;
  revenue: number;
  spend: number;
  impressions: number;
  clicks: number;
  source_count: number;
  samples: string[];
  purchase_rate: number | null;
  cost_per_purchase: number | null;
};

const THEME_DEFS: ThemeDef[] = [
  {
    slug: "price",
    label: "Price / Cost",
    category: "price",
    copyFocus: "Lead with cost clarity, pricing transparency, and provider comparison.",
    rewriteGoal: "Reduce curiosity clicks and help price-sensitive users self-qualify faster.",
    patterns: [/\bcost\b/i, /\bprice\b/i, /\bcheap\b/i, /\baffordable\b/i, /\blow cost\b/i],
  },
  {
    slug: "ro",
    label: "Ro Brand",
    category: "provider_brand",
    copyFocus: "Trust, clinician access, and legitimacy cues.",
    rewriteGoal: "Make the medical credibility angle explicit without overclaiming.",
    patterns: [/\bro\b/i, /\bro weight loss\b/i],
  },
  {
    slug: "skinnyrx",
    label: "SkinnyRX Brand",
    category: "provider_brand",
    copyFocus: "Strong provider-specific comparison and why this offer stands out.",
    rewriteGoal: "Lean into the brand proof that already converts instead of generic GLP-1 language.",
    patterns: [/\bskinny\s?rx\b/i],
  },
  {
    slug: "medvi",
    label: "MEDVi Brand",
    category: "provider_brand",
    copyFocus: "Clarify value proposition and avoid unsupported trust assumptions.",
    rewriteGoal: "Separate conversion strength from brand-risk questions and keep copy concrete.",
    patterns: [/\bmedvi\b/i],
  },
  {
    slug: "eden",
    label: "Eden Brand",
    category: "provider_brand",
    copyFocus: "Convenience, provider comparison, and offer clarity.",
    rewriteGoal: "Help users understand how Eden differs from broader provider sets.",
    patterns: [/\beden\b/i],
  },
  {
    slug: "fridays",
    label: "Fridays Brand",
    category: "provider_brand",
    copyFocus: "Support and coaching positioning.",
    rewriteGoal: "Use support-oriented language only when it maps to an actual support-heavy flow.",
    patterns: [/\bfridays\b/i, /\bjoin fridays\b/i],
  },
  {
    slug: "tirzepatide",
    label: "Tirzepatide",
    category: "ingredient",
    copyFocus: "High-intent comparison messaging around tirzepatide providers and fit.",
    rewriteGoal: "Keep the user in a provider-comparison frame instead of a vague education frame.",
    patterns: [/\btirzepatide\b/i],
  },
  {
    slug: "semaglutide",
    label: "Semaglutide",
    category: "ingredient",
    copyFocus: "Clarify provider differences and price/value, not just ingredient awareness.",
    rewriteGoal: "Avoid broad semaglutide traffic that clicks without buying.",
    patterns: [/\bsemaglutide\b/i],
  },
  {
    slug: "zepbound",
    label: "Zepbound",
    category: "drug_brand",
    copyFocus: "Brand-specific comparison and pricing expectations.",
    rewriteGoal: "Tighten promise-to-page alignment for Zepbound seekers.",
    patterns: [/\bzepbound\b/i, /\bzebound\b/i],
  },
  {
    slug: "wegovy",
    label: "Wegovy",
    category: "drug_brand",
    copyFocus: "Brand-specific comparison, price, and provider match.",
    rewriteGoal: "Reduce expensive, weaker-intent traffic with sharper comparison language.",
    patterns: [/\bwegovy\b/i],
  },
  {
    slug: "mounjaro",
    label: "Mounjaro",
    category: "drug_brand",
    copyFocus: "Brand-led comparison for users already close to a decision.",
    rewriteGoal: "Turn known brand intent into cleaner comparison flows.",
    patterns: [/\bmounjaro\b/i],
  },
  {
    slug: "ozempic",
    label: "Ozempic",
    category: "drug_brand",
    copyFocus: "Brand comparison with careful expectation setting.",
    rewriteGoal: "Avoid attracting users to the wrong offer or format.",
    patterns: [/\bozempic\b/i],
  },
  {
    slug: "pills",
    label: "Pills / Oral",
    category: "format",
    copyFocus: "Format-specific comparison and expectation setting.",
    rewriteGoal: "Filter low-fit traffic early if the landing page is injection-first.",
    patterns: [/\bpill\b/i, /\bpills\b/i, /\boral\b/i, /\btablet\b/i, /\btablets\b/i],
  },
  {
    slug: "injections",
    label: "Shots / Injections",
    category: "format",
    copyFocus: "Format-specific comparison and speed-to-decision messaging.",
    rewriteGoal: "Use clear injection-language where the page actually fulfills that promise.",
    patterns: [/\bshot\b/i, /\bshots\b/i, /\binjection\b/i, /\binjections\b/i],
  },
  {
    slug: "comparison",
    label: "Comparison / Best Of",
    category: "comparison",
    copyFocus: "Strong ranking logic, clear criteria, and easy provider differentiation.",
    rewriteGoal: "Make the page feel decisive instead of generic.",
    patterns: [/\bcompare\b/i, /\bbest\b/i, /\btop\b/i, /\breview\b/i],
  },
  {
    slug: "glp1",
    label: "GLP-1 Generic",
    category: "generic",
    copyFocus: "Guide broad GLP-1 interest into narrower provider or medication decisions.",
    rewriteGoal: "Avoid paying for broad curiosity without a next-step angle.",
    patterns: [/\bglp[- ]?1\b/i],
  },
];

const FALLBACK_THEME: ThemeDef = {
  slug: "generic_weight_loss",
  label: "Generic Weight Loss",
  category: "generic",
  copyFocus: "Keep the comparison clear and move broad intent toward a concrete next step.",
  rewriteGoal: "Reduce vague traffic by sharpening the promise.",
  patterns: [],
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

function classifyTheme(text: string) {
  for (const theme of THEME_DEFS) {
    if (theme.patterns.some((pattern) => pattern.test(text))) {
      return theme;
    }
  }
  return FALLBACK_THEME;
}

function samplePush(samples: string[], value: string) {
  if (!value || samples.includes(value) || samples.length >= 5) {
    return;
  }
  samples.push(value);
}

function aggregateRows<T extends Record<string, unknown>>(
  rows: T[],
  getLabel: (row: T) => string,
  values: {
    totalEvents: keyof T;
    quizStarts: keyof T;
    purchases: keyof T;
    revenue?: keyof T;
    spend?: keyof T;
    impressions?: keyof T;
    clicks?: keyof T;
  },
) {
  const aggregate = new Map<string, ThemeAggregate>();

  for (const row of rows) {
    const label = getLabel(row);
    const theme = classifyTheme(label);
    const current = aggregate.get(theme.slug) || {
      theme: theme.slug,
      label: theme.label,
      category: theme.category,
      copyFocus: theme.copyFocus,
      rewriteGoal: theme.rewriteGoal,
      total_events: 0,
      quiz_starts: 0,
      purchases: 0,
      revenue: 0,
      spend: 0,
      impressions: 0,
      clicks: 0,
      source_count: 0,
      samples: [],
      purchase_rate: null,
      cost_per_purchase: null,
    };

    current.total_events += toNumber(row[values.totalEvents] as NumericLike);
    current.quiz_starts += toNumber(row[values.quizStarts] as NumericLike);
    current.purchases += toNumber(row[values.purchases] as NumericLike);
    current.revenue += values.revenue ? toNumber(row[values.revenue] as NumericLike) : 0;
    current.spend += values.spend ? toNumber(row[values.spend] as NumericLike) : 0;
    current.impressions += values.impressions ? toNumber(row[values.impressions] as NumericLike) : 0;
    current.clicks += values.clicks ? toNumber(row[values.clicks] as NumericLike) : 0;
    current.source_count += 1;
    samplePush(current.samples, label);
    aggregate.set(theme.slug, current);
  }

  return [...aggregate.values()]
    .map((row) => ({
      ...row,
      purchase_rate: row.quiz_starts > 0 ? Number(((row.purchases / row.quiz_starts) * 100).toFixed(2)) : null,
      cost_per_purchase: row.purchases > 0 && row.spend > 0 ? Number((row.spend / row.purchases).toFixed(2)) : null,
    }))
    .sort((a, b) => b.purchases - a.purchases || b.total_events - a.total_events);
}

function buildHeadlineIdeas(theme: ThemeAggregate) {
  const lines: Record<string, string[]> = {
    tirzepatide: [
      "Compare Top Tirzepatide Providers",
      "See Leading Tirzepatide Options Online",
      "Compare Tirzepatide Price, Support, and Fit",
    ],
    skinnyrx: [
      "Compare SkinnyRX With Other Top Options",
      "See Why SkinnyRX Wins High-Intent Traffic",
      "Compare SkinnyRX Pricing and Provider Fit",
    ],
    price: [
      "Compare GLP-1 Costs Before You Choose",
      "See Price-First Weight Loss Options Online",
      "Compare Provider Pricing and Support in One Place",
    ],
    comparison: [
      "Compare Top Weight Loss Providers Side by Side",
      "See the Best Online Weight Loss Options",
      "Compare Pricing, Support, and Medication Paths",
    ],
    injections: [
      "Compare Top Weight Loss Injection Providers",
      "See Online Injection Options Side by Side",
      "Compare Support, Pricing, and Next Steps",
    ],
  };

  return (lines[theme.theme] || [
    `Compare ${theme.label} Options Online`,
    `See Top ${theme.label} Providers Side by Side`,
    `Compare Pricing, Support, and Fit for ${theme.label}`,
  ]).map((text) => ({
    theme: theme.label,
    asset_type: "headline",
    text,
    why: theme.copyFocus,
    compliance_note: "Keep wording comparative and avoid unsupported medical or approval claims.",
  }));
}

function buildDescriptionIdeas(theme: ThemeAggregate) {
  const text = [
    `Review ${theme.label.toLowerCase()} options by pricing, clinician access, and provider fit before you choose.`,
    `Compare support, medication format, and next-step experience in one decision-ready view.`,
  ];

  return text.map((entry) => ({
    theme: theme.label,
    asset_type: "description",
    text: entry,
    why: theme.rewriteGoal,
    compliance_note: "Do not imply medical certainty, equivalence, or FDA status unless verified per offer.",
  }));
}

type ParsedAdAsset = {
  text: string;
  assetPerformanceLabel?: string;
  pinnedField?: string;
};

function parseAdAssets(raw: unknown): ParsedAdAsset[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        text: typeof item.text === "string" ? item.text : "",
        assetPerformanceLabel:
          typeof item.assetPerformanceLabel === "string" ? item.assetPerformanceLabel : undefined,
        pinnedField: typeof item.pinnedField === "string" ? item.pinnedField : undefined,
      }))
      .filter((item) => item.text);
  } catch {
    return [];
  }
}

function compactAssets(raw: unknown, limit = 4) {
  return parseAdAssets(raw)
    .slice(0, limit)
    .map((item) => ({
      text: item.text,
      label: item.assetPerformanceLabel || "UNKNOWN",
      pinnedField: item.pinnedField || null,
    }));
}

type GeneratedCopyIdea = {
  theme: string;
  asset_type: string;
  text: string;
  why: string;
  compliance_note: string;
};

export async function getCopyIntelligence(params: URLSearchParams) {
  const [keywords, campaigns, landingPages, partners, truth, googleAdRows] = await Promise.all([
    getKeywordOpportunities(params, 500),
    getCampaigns(params),
    getLandingPages(params, 200),
    getPartners(params),
    getMeasurementTruth(params),
    getGoogleAdCopyDiagnostics(params, 150),
  ]);

  const keywordThemes = aggregateRows(
    keywords as Record<string, unknown>[],
    (row) => String(row.keyword || "unknown"),
    {
      totalEvents: "visits",
      quizStarts: "visits",
      purchases: "net_purchases",
      revenue: "purchase_revenue",
      spend: "estimated_spend",
      impressions: "estimated_impressions",
      clicks: "estimated_clicks",
    },
  );

  const campaignThemes = aggregateRows(
    campaigns as Record<string, unknown>[],
    (row) => String(row.campaign_name || row.campaign_id || "unknown"),
    {
      totalEvents: "total_events",
      quizStarts: "quiz_starts",
      purchases: "purchases",
      revenue: "revenue",
      spend: "spend",
      impressions: "impressions",
      clicks: "clicks",
    },
  );

  const landingPageAlerts = (landingPages as Record<string, unknown>[])
    .filter((row) => toNumber(row.quiz_starts as NumericLike) >= 50)
    .map((row) => ({
      platform: String(row.platform_id || "unknown"),
      landing_page_path: String(row.landing_page_path || "unknown"),
      quiz_starts: toNumber(row.quiz_starts as NumericLike),
      net_purchases: toNumber(row.net_purchases as NumericLike),
      purchase_rate: toNumber(row.purchase_rate as NumericLike),
      diagnosis:
        toNumber(row.net_purchases as NumericLike) <= 0
          ? "High-funnel traffic with no purchase payoff."
          : toNumber(row.purchase_rate as NumericLike) < 4
            ? "Users start the flow but do not buy at a healthy rate."
            : "Healthy enough to keep, but worth watching against better variants.",
    }))
    .sort((a, b) => a.purchase_rate - b.purchase_rate || b.quiz_starts - a.quiz_starts)
    .slice(0, 10);

  const winningThemes = campaignThemes
    .filter((row) => row.purchases >= 5 || (row.purchase_rate || 0) >= 8)
    .slice(0, 6);

  const wasteThemes = campaignThemes
    .filter(
      (row) =>
        row.spend >= 3000 &&
        (
          row.purchases <= 5 ||
          (row.purchase_rate || 0) < 5 ||
          (row.cost_per_purchase || 0) >= 450
        ),
    )
    .sort((a, b) => ((b.cost_per_purchase || 0) - (a.cost_per_purchase || 0)) || (b.spend - a.spend))
    .slice(0, 6);

  const fallbackWasteThemes =
    wasteThemes.length > 0
      ? wasteThemes
      : keywordThemes
          .filter((row) => row.total_events >= 250 && ((row.purchase_rate || 0) < 1 || row.purchases <= 3))
          .slice(0, 6);

  const copyIdeas = [...winningThemes.slice(0, 3), ...fallbackWasteThemes.slice(0, 2)]
    .flatMap((theme) => [...buildHeadlineIdeas(theme), ...buildDescriptionIdeas(theme)])
    .slice(0, 12);

  const googleAds = (googleAdRows as Record<string, unknown>[])
    .map((row) => ({
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
      purchase_roi_pct:
        row.purchase_roi_pct == null ? null : toNumber(row.purchase_roi_pct as NumericLike),
      sample_keywords:
        typeof row.sample_keywords === "string" && row.sample_keywords.trim()
          ? row.sample_keywords.split(" | ").map((value) => value.trim()).filter(Boolean)
          : [],
      sample_landing_pages:
        typeof row.sample_landing_pages === "string" && row.sample_landing_pages.trim()
          ? row.sample_landing_pages.split(" | ").map((value) => value.trim()).filter(Boolean)
          : [],
      headlines: compactAssets(row.headlines_json),
      descriptions: compactAssets(row.descriptions_json),
    }))
    .filter((row) => row.spend > 0);

  const winningAds = googleAds
    .filter((row) => row.net_purchases > 0 && row.purchase_profit > 0)
    .sort((a, b) => b.purchase_profit - a.purchase_profit || b.net_purchases - a.net_purchases)
    .slice(0, 8);

  const weakAds = googleAds
    .filter((row) => row.spend >= 250 && (row.net_purchases <= 0 || row.purchase_profit < 0))
    .sort((a, b) => b.spend - a.spend || a.purchase_profit - b.purchase_profit)
    .slice(0, 8);

  const actionableCopy = [...winningAds.slice(0, 2), ...weakAds.slice(0, 2)].flatMap((ad) => {
    const strongestHeadline = ad.headlines[0];
    const strongestDescription = ad.descriptions[0];

    return [
      strongestHeadline
        ? {
            theme: ad.campaign_name,
            asset_type: "headline",
            text: strongestHeadline.text,
            why:
              ad.purchase_profit > 0
                ? `Live Google RSA winner in ${ad.campaign_name} with ${ad.net_purchases} net purchases and ${ad.ad_strength || "unknown"} strength.`
                : `Current live headline in a weak ad; use it as the first rewrite target in ${ad.campaign_name}.`,
            compliance_note: `Google label: ${strongestHeadline.label}. Approval: ${ad.approval_status || "unknown"}.`,
          }
        : null,
      strongestDescription
        ? {
            theme: ad.campaign_name,
            asset_type: "description",
            text: strongestDescription.text,
            why:
              ad.purchase_profit > 0
                ? `Supported by live purchase profit in Google RSA traffic.`
                : `This description is attached to an ad losing money; rewrite for tighter partner/value specificity.`,
            compliance_note: `Google label: ${strongestDescription.label}. Approval: ${ad.approval_status || "unknown"}.`,
          }
        : null,
    ].filter(Boolean);
  }) as GeneratedCopyIdea[];

  const partnerLeaders = (partners as Record<string, unknown>[])
    .map((row) => ({
      partner: String(row.partner || "unknown"),
      net_purchases: toNumber(row.net_purchases as NumericLike),
      purchase_rate: row.purchase_rate == null ? null : toNumber(row.purchase_rate as NumericLike),
      modeled_value_usd: toNumber(row.modeled_value_usd as NumericLike),
    }))
    .sort((a, b) => b.net_purchases - a.net_purchases);

  const recommendations: string[] = [];
  if (winningThemes.some((theme) => theme.theme === "tirzepatide")) {
    recommendations.push("Keep scaling tirzepatide-led comparison messaging. It is still the clearest high-intent theme in the current data.");
  }
  if (fallbackWasteThemes.some((theme) => theme.theme === "price")) {
    recommendations.push("Price-sensitive traffic needs sharper qualification. Use price copy only when the landing page shows price or cost structure quickly.");
  }
  if (landingPageAlerts.some((row) => row.landing_page_path.includes("-b-") && row.purchase_rate < 4)) {
    recommendations.push("Several B-variant landing pages are weak enough to pause or rewrite first; do not keep feeding them broad traffic.");
  }
  if (partnerLeaders.some((row) => row.partner === "Sprout" && row.net_purchases < 0)) {
    recommendations.push("Treat Sprout as a risk queue, not a growth queue, until reversals are understood and contained.");
  }
  if (weakAds.length > 0) {
    const weakAd = weakAds[0];
    recommendations.push(
      `Rewrite or pause the weak Google RSA in ${weakAd.campaign_name}; it spent $${Math.round(weakAd.spend).toLocaleString()} with ${weakAd.net_purchases} net purchases.`,
    );
  }
  if (winningAds.length > 0) {
    const strongAd = winningAds[0];
    recommendations.push(
      `Clone the winning Google RSA pattern from ${strongAd.campaign_name}; it produced ${strongAd.net_purchases} net purchases with ${strongAd.ad_strength || "unknown"} strength.`,
    );
  }

  return {
    summary: {
      in_scope_net_purchases: truth.summary?.net_purchases || 0,
      join_rate_pct: truth.summary?.join_rate_pct || 0,
      winning_theme_count: winningThemes.length,
      waste_theme_count: fallbackWasteThemes.length,
      landing_page_alert_count: landingPageAlerts.length,
      recommendation_count: recommendations.length,
      google_rsa_ad_count: googleAds.length,
    },
    caveats: [
      "Google now exposes native RSA headlines, descriptions, ad strength, and policy context through the GoogleAds transfer dataset.",
      "Bing is still theme-level because there is no matching rich Bing copy dataset in BigQuery yet.",
      "Google keyword economics are exact at the keyword-day level; Bing keyword economics remain campaign-day spend allocations by visit share.",
      ...(truth.warnings || []),
    ],
    winning_themes: winningThemes,
    waste_themes: fallbackWasteThemes,
    keyword_theme_leaders: keywordThemes.slice(0, 10),
    winning_ads: winningAds,
    weak_ads: weakAds,
    landing_page_alerts: landingPageAlerts,
    partner_leaders: partnerLeaders,
    copy_ideas: actionableCopy.length > 0 ? actionableCopy.slice(0, 12) : copyIdeas,
    recommendations,
  };
}

type ResearchTarget = {
  name: string;
  url: string;
  partner?: string;
};

type SnapshotSignals = {
  clinician: boolean;
  coaching: boolean;
  compounded: boolean;
  fda: boolean;
  shipping: boolean;
  guarantee: boolean;
  insurance: boolean;
};

type SiteSnapshotSuccess = ResearchTarget & {
  ok: true;
  status: number;
  title: string | null;
  description: string | null;
  h1: string | null;
  headings: string[];
  prices: string[];
  signals: SnapshotSignals;
};

type SiteSnapshotFailure = ResearchTarget & {
  ok: false;
  status?: number;
  error: string;
  title?: string | null;
  description?: string | null;
  h1?: string | null;
  headings?: string[];
  prices?: string[];
  signals?: SnapshotSignals;
};

const RESEARCH_TARGETS: ResearchTarget[] = [
  { name: "Top5WeightChoices Home", url: "https://top5weightchoices.com/" },
  { name: "Top5WeightChoices Disclosure", url: "https://top5weightchoices.com/advertiser-disclosure/" },
  { name: "Ro Weight Loss", partner: "Ro", url: "https://ro.co/weight-loss/" },
  { name: "Fridays", partner: "Fridays", url: "https://www.joinfridays.com/" },
  { name: "Eden", partner: "Eden", url: "https://www.tryeden.com/" },
  { name: "MEDVi", partner: "MEDVi", url: "https://medvi-en.com/" },
];

function cleanText(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, pattern: RegExp) {
  const match = html.match(pattern);
  return match?.[1] ? cleanText(match[1]) : null;
}

async function fetchSiteSnapshot(target: ResearchTarget): Promise<SiteSnapshotSuccess | SiteSnapshotFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(target.url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; WLMarketingAgent/1.0; +https://top5weightchoices.com/)",
      },
      redirect: "follow",
      cache: "no-store",
    });

    const html = await response.text();
    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description =
      firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const h1 = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const headings = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)]
      .map((match) => cleanText(match[1]))
      .filter(Boolean)
      .slice(0, 5);
    const prices = [...new Set((html.match(/\$\s?\d[\d,]*(?:\.\d{2})?(?:\s*\/\s*(?:mo|month))?/gi) || []).slice(0, 6))];

    const lower = html.toLowerCase();
    const signals = {
      clinician: /clinician|doctor-led|medical provider|licensed provider/.test(lower),
      coaching: /coach|coaching|support/.test(lower),
      compounded: /compound/.test(lower),
      fda: /\bfda\b/.test(lower),
      shipping: /shipping|delivered|delivery/.test(lower),
      guarantee: /guarantee|money-back/.test(lower),
      insurance: /insurance/.test(lower),
    };

    if (response.ok) {
      return {
        ...target,
        ok: true,
        status: response.status,
        title,
        description,
        h1,
        headings,
        prices,
        signals,
      };
    }

    return {
      ...target,
      ok: false,
      status: response.status,
      error: `HTTP ${response.status}`,
      title,
      description,
      h1,
      headings,
      prices,
      signals,
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getPartnerResearch() {
  const snapshots = await Promise.all(RESEARCH_TARGETS.map(fetchSiteSnapshot));
  const active = snapshots.filter((row): row is SiteSnapshotSuccess => row.ok);

  return {
    summary: {
      source_count: snapshots.length,
      reachable_source_count: active.length,
      partner_source_count: snapshots.filter((row) => row.partner).length,
    },
    market_signals: {
      clinician_led_sites: active.filter((row) => row.signals?.clinician).length,
      support_led_sites: active.filter((row) => row.signals?.coaching).length,
      compounded_mentions: active.filter((row) => row.signals?.compounded).length,
      fda_mentions: active.filter((row) => row.signals?.fda).length,
      price_visible_sites: active.filter((row) => (row.prices?.length || 0) > 0).length,
    },
    snapshots,
  };
}
