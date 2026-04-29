"use client";

import { useEffect, useState } from "react";
import StatCard from "./StatCard";

type ThemeRow = {
  theme: string;
  label: string;
  category: string;
  copyFocus: string;
  rewriteGoal: string;
  total_events: number;
  quiz_starts: number;
  purchases: number;
  revenue: number;
  spend: number;
  source_count: number;
  samples: string[];
  purchase_rate: number | null;
  cost_per_purchase: number | null;
};

type LandingAlert = {
  platform: string;
  landing_page_path: string;
  quiz_starts: number;
  net_purchases: number;
  purchase_rate: number;
  diagnosis: string;
};

type CopyIdea = {
  theme: string;
  asset_type: string;
  text: string;
  why: string;
  compliance_note: string;
};

type Snapshot = {
  name: string;
  url: string;
  partner?: string;
  ok: boolean;
  title?: string | null;
  description?: string | null;
  h1?: string | null;
  headings?: string[];
  prices?: string[];
  signals?: Record<string, boolean>;
  error?: string;
};

type CopyIntelligence = {
  summary: {
    in_scope_net_purchases: number;
    join_rate_pct: number;
    winning_theme_count: number;
    waste_theme_count: number;
    landing_page_alert_count: number;
    recommendation_count: number;
    google_rsa_ad_count: number;
  };
  caveats: string[];
  winning_themes: ThemeRow[];
  waste_themes: ThemeRow[];
  keyword_theme_leaders: ThemeRow[];
  landing_page_alerts: LandingAlert[];
  partner_leaders: Array<{
    partner: string;
    net_purchases: number;
    purchase_rate: number | null;
    modeled_value_usd: number;
  }>;
  winning_ads: Array<{
    ad_id: string;
    campaign_name: string;
    ad_name: string | null;
    ad_strength: string | null;
    approval_status: string | null;
    ad_status: string | null;
    spend: number;
    clicks: number;
    impressions: number;
    matched_click_visits: number;
    add_to_carts: number;
    net_purchases: number;
    purchase_profit: number;
    purchase_roi_pct: number | null;
    sample_keywords: string[];
    sample_landing_pages: string[];
    headlines: Array<{ text: string; label: string; pinnedField: string | null }>;
    descriptions: Array<{ text: string; label: string; pinnedField: string | null }>;
  }>;
  weak_ads: Array<{
    ad_id: string;
    campaign_name: string;
    ad_name: string | null;
    ad_strength: string | null;
    approval_status: string | null;
    ad_status: string | null;
    spend: number;
    clicks: number;
    impressions: number;
    matched_click_visits: number;
    add_to_carts: number;
    net_purchases: number;
    purchase_profit: number;
    purchase_roi_pct: number | null;
    sample_keywords: string[];
    sample_landing_pages: string[];
    headlines: Array<{ text: string; label: string; pinnedField: string | null }>;
    descriptions: Array<{ text: string; label: string; pinnedField: string | null }>;
  }>;
  copy_ideas: CopyIdea[];
  recommendations: string[];
};

type PartnerResearch = {
  summary: {
    source_count: number;
    reachable_source_count: number;
    partner_source_count: number;
  };
  market_signals: {
    clinician_led_sites: number;
    support_led_sites: number;
    compounded_mentions: number;
    fda_mentions: number;
    price_visible_sites: number;
  };
  snapshots: Snapshot[];
};

export default function CopyLabContent() {
  const [copyData, setCopyData] = useState<CopyIntelligence | null>(null);
  const [researchData, setResearchData] = useState<PartnerResearch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/copy-intelligence").then((r) => r.json()),
      fetch("/api/partner-research").then((r) => r.json()),
    ]).then(([copy, research]) => {
      setCopyData(copy);
      setResearchData(research);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-gray-400 mt-10 text-center">Loading copy intelligence...</div>;
  }

  if (!copyData || !researchData) {
    return null;
  }

  const signalPills = (signals?: Record<string, boolean>) =>
    Object.entries(signals || {})
      .filter(([, value]) => value)
      .map(([key]) => key);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Copy Lab</h1>
        <p className="text-gray-400 text-sm mt-1">
          Theme-level ad copy intelligence, landing-page fit, and live partner-site research
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Net Purchases" value={copyData.summary.in_scope_net_purchases.toLocaleString()} color="green" />
        <StatCard label="Join Rate" value={`${copyData.summary.join_rate_pct}%`} sub="conversion -> visit truth" color="blue" />
        <StatCard label="Google RSAs" value={copyData.summary.google_rsa_ad_count} sub="ads with native copy data" color="purple" />
        <StatCard label="Reachable Sources" value={`${researchData.summary.reachable_source_count}/${researchData.summary.source_count}`} sub="live external research" color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Immediate Recommendations</div>
          <div className="space-y-2">
            {copyData.recommendations.map((item) => (
              <div key={item} className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Research Signals</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
              <div className="text-gray-500 text-xs uppercase tracking-wider">Clinician-led sites</div>
              <div className="text-white text-xl font-semibold mt-1">{researchData.market_signals.clinician_led_sites}</div>
            </div>
            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
              <div className="text-gray-500 text-xs uppercase tracking-wider">Support-led sites</div>
              <div className="text-white text-xl font-semibold mt-1">{researchData.market_signals.support_led_sites}</div>
            </div>
            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
              <div className="text-gray-500 text-xs uppercase tracking-wider">Price-visible sites</div>
              <div className="text-white text-xl font-semibold mt-1">{researchData.market_signals.price_visible_sites}</div>
            </div>
            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
              <div className="text-gray-500 text-xs uppercase tracking-wider">Compounded mentions</div>
              <div className="text-white text-xl font-semibold mt-1">{researchData.market_signals.compounded_mentions}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-300">Winning Google Ads</div>
          <div className="divide-y divide-gray-800/60">
            {copyData.winning_ads.map((ad) => (
              <div key={`win-${ad.ad_id}`} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-white">{ad.campaign_name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Strength: {ad.ad_strength || "unknown"} · Approval: {ad.approval_status || "unknown"}
                    </div>
                    {ad.sample_keywords.length > 0 && (
                      <div className="text-xs text-cyan-300 mt-1">Keywords: {ad.sample_keywords.join(" · ")}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-300 font-medium">${Math.round(ad.purchase_profit).toLocaleString()}</div>
                    <div className="text-xs text-gray-500">{ad.net_purchases} purchases</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-3">
                  {ad.headlines.slice(0, 3).map((headline) => (
                    <div key={`${ad.ad_id}-${headline.text}`} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                      <div className="text-xs text-gray-500 mb-1">
                        Headline · {headline.label}{headline.pinnedField ? ` · ${headline.pinnedField}` : ""}
                      </div>
                      <div className="text-sm text-white">{headline.text}</div>
                    </div>
                  ))}
                  {ad.descriptions.slice(0, 1).map((description) => (
                    <div key={`${ad.ad_id}-${description.text}`} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                      <div className="text-xs text-gray-500 mb-1">Description · {description.label}</div>
                      <div className="text-sm text-gray-200">{description.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-300">Ads To Rewrite / Pause</div>
          <div className="divide-y divide-gray-800/60">
            {copyData.weak_ads.map((ad) => (
              <div key={`weak-${ad.ad_id}`} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-white">{ad.campaign_name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Strength: {ad.ad_strength || "unknown"} · Approval: {ad.approval_status || "unknown"}
                    </div>
                    {ad.sample_keywords.length > 0 && (
                      <div className="text-xs text-amber-300 mt-1">Keywords: {ad.sample_keywords.join(" · ")}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-rose-300 font-medium">${Math.round(ad.spend).toLocaleString()}</div>
                    <div className="text-xs text-gray-500">{ad.net_purchases} purchases</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-3">
                  {ad.headlines.slice(0, 2).map((headline) => (
                    <div key={`${ad.ad_id}-${headline.text}`} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                      <div className="text-xs text-gray-500 mb-1">
                        Headline · {headline.label}{headline.pinnedField ? ` · ${headline.pinnedField}` : ""}
                      </div>
                      <div className="text-sm text-white">{headline.text}</div>
                    </div>
                  ))}
                  {ad.descriptions.slice(0, 1).map((description) => (
                    <div key={`${ad.ad_id}-${description.text}`} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
                      <div className="text-xs text-gray-500 mb-1">Description · {description.label}</div>
                      <div className="text-sm text-gray-200">{description.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-300">Winning Themes</div>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-gray-500">
              <tr>
                <th className="text-left py-2 px-3 font-medium">Theme</th>
                <th className="text-right py-2 px-3 font-medium">Purchases</th>
                <th className="text-right py-2 px-3 font-medium">Quiz Starts</th>
                <th className="text-right py-2 px-3 font-medium">Spend</th>
                <th className="text-right py-2 px-3 font-medium">CPA</th>
              </tr>
            </thead>
            <tbody>
              {copyData.winning_themes.map((row) => (
                <tr key={row.theme} className="border-b border-gray-800/50 align-top">
                  <td className="py-2 px-3">
                    <div className="text-gray-200 font-medium">{row.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{row.copyFocus}</div>
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-medium">{row.purchases}</td>
                  <td className="py-2 px-3 text-right text-gray-400">{row.quiz_starts.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-300">${row.spend.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-cyan-400">{row.cost_per_purchase ? `$${row.cost_per_purchase}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-300">Waste Themes</div>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-gray-500">
              <tr>
                <th className="text-left py-2 px-3 font-medium">Theme</th>
                <th className="text-right py-2 px-3 font-medium">Purchases</th>
                <th className="text-right py-2 px-3 font-medium">Spend</th>
                <th className="text-right py-2 px-3 font-medium">CPA</th>
              </tr>
            </thead>
            <tbody>
              {copyData.waste_themes.map((row) => (
                <tr key={row.theme} className="border-b border-gray-800/50 align-top">
                  <td className="py-2 px-3">
                    <div className="text-gray-200 font-medium">{row.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{row.rewriteGoal}</div>
                  </td>
                  <td className="py-2 px-3 text-right text-rose-300">{row.purchases}</td>
                  <td className="py-2 px-3 text-right text-gray-300">${row.spend.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-rose-300">{row.cost_per_purchase ? `$${row.cost_per_purchase}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Landing-Page Alerts</div>
          <div className="space-y-3">
            {copyData.landing_page_alerts.map((row) => (
              <div key={`${row.platform}-${row.landing_page_path}`} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-gray-200 font-medium truncate">{row.landing_page_path}</div>
                  <div className="text-xs text-gray-500 uppercase">{row.platform}</div>
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {row.quiz_starts.toLocaleString()} quiz starts · {row.net_purchases} net purchases · {row.purchase_rate}% purchase rate
                </div>
                <div className="text-sm text-amber-200 mt-2">{row.diagnosis}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Suggested Copy Tests</div>
          <div className="space-y-3">
            {copyData.copy_ideas.map((idea, index) => (
              <div key={`${idea.asset_type}-${idea.theme}-${index}`} className="rounded-lg border border-indigo-900/60 bg-indigo-950/20 px-3 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded-full bg-indigo-900 px-2 py-0.5 text-xs text-indigo-300 uppercase">{idea.asset_type}</span>
                  <span className="text-xs text-gray-500">{idea.theme}</span>
                </div>
                <div className="text-sm text-white">{idea.text}</div>
                <div className="text-xs text-gray-400 mt-2">{idea.why}</div>
                <div className="text-xs text-amber-300 mt-1">{idea.compliance_note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="text-sm font-medium text-gray-300 mb-3">Partner / Market Snapshots</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {researchData.snapshots.map((snapshot) => (
            <div key={snapshot.url} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-sm font-medium text-white">{snapshot.name}</div>
                <a href={snapshot.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:text-white">
                  Open →
                </a>
              </div>
              {snapshot.ok ? (
                <>
                  <div className="text-xs text-gray-400">{snapshot.title || snapshot.h1 || "No title extracted"}</div>
                  {snapshot.description && <div className="text-sm text-gray-300 mt-2">{snapshot.description}</div>}
                  {snapshot.prices && snapshot.prices.length > 0 && (
                    <div className="text-xs text-emerald-300 mt-2">Visible pricing: {snapshot.prices.join(" · ")}</div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {signalPills(snapshot.signals).map((pill) => (
                      <span key={pill} className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                        {pill}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-rose-300 mt-2">{snapshot.error || "Unable to fetch snapshot"}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-300 mb-3">Caveats</div>
        <div className="space-y-2">
          {copyData.caveats.map((item) => (
            <div key={item} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
