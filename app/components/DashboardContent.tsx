"use client";

import { useEffect, useState } from "react";
import StatCard from "./StatCard";

type KeywordRow = {
  platform: string;
  keyword: string;
  top_campaign: string;
  top_landing_page: string;
  visits: number;
  add_to_carts: number;
  net_purchases: number;
  estimated_spend: number;
  purchase_revenue: number;
  add_to_cart_proxy_value: number;
  purchase_profit: number;
  proxy_profit: number;
  purchase_roi_pct: number | null;
  proxy_roi_pct: number | null;
  purchase_rate_per_visit: number | null;
  profit_gap_to_break_even: number;
  diagnosis: string;
  spend_confidence: string;
};

type LandingAlert = {
  platform: string;
  landing_page_path: string;
  quiz_starts: number;
  net_purchases: number;
  purchase_rate: number | null;
};

type OptimizationFlow = {
  assumptions: {
    purchase_value_usd: number;
    add_to_cart_share_of_purchase: number;
    add_to_cart_proxy_value_usd: number;
    spend_allocation_method: string;
    spend_confidence: string;
    raw_media_spend_usd?: number;
    matched_keyword_spend_usd?: number;
  };
  measurement_truth: {
    warnings: string[];
  };
  summary: {
    estimated_spend: number;
    purchase_revenue: number;
    add_to_cart_proxy_value: number;
    purchase_profit: number;
    proxy_profit: number;
    profitable_keyword_count: number;
    waste_keyword_count: number;
    google_rsa_ads_analyzed: number;
  };
  winning_keywords: KeywordRow[];
  wasted_keywords: KeywordRow[];
  google_ad_copy_alerts: Array<{
    ad_id: string;
    campaign_name: string;
    ad_strength: string | null;
    approval_status: string | null;
    spend: number;
    net_purchases: number;
    purchase_profit: number;
  }>;
  landing_page_alerts: LandingAlert[];
  recommendations: string[];
};

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

export default function DashboardContent() {
  const [data, setData] = useState<OptimizationFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/optimization-flow")
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text();
          throw new Error(text || `Request failed with status ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load action board.");
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-gray-400 mt-10 text-center">Loading action board...</div>;
  if (error) {
    return (
      <div className="mt-10 rounded-xl border border-rose-800 bg-rose-950/30 px-5 py-4 text-sm text-rose-200">
        Action Board failed to load: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Action Board</h1>
        <p className="text-gray-400 text-sm mt-1">
          Purchase-first optimization only. Add to cart is treated as a weighted proxy, not as a funnel stage.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Media Spend"
          value={money(data.summary.estimated_spend)}
          sub="Raw Google + Bing spend in BigQuery"
          color="orange"
        />
        <StatCard
          label="Purchase Revenue"
          value={money(data.summary.purchase_revenue)}
          sub={`$${data.assumptions.purchase_value_usd} per purchase`}
          color="green"
        />
        <StatCard
          label="Purchase Profit"
          value={money(data.summary.purchase_profit)}
          sub="Purchase revenue minus spend"
          color={data.summary.purchase_profit >= 0 ? "blue" : "orange"}
        />
        <StatCard
          label="ATC Proxy Value"
          value={money(data.summary.add_to_cart_proxy_value)}
          sub={`${Math.round(data.assumptions.add_to_cart_share_of_purchase * 100)}% of purchase value`}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Proxy Profit"
          value={money(data.summary.proxy_profit)}
          sub="Purchase profit plus weighted add-to-cart"
          color="green"
        />
        <StatCard
          label="Winning Keywords"
          value={data.summary.profitable_keyword_count}
          sub="Positive purchase profit"
          color="blue"
        />
        <StatCard
          label="Waste Keywords"
          value={data.summary.waste_keyword_count}
          sub="Negative or zero purchase economics"
          color="orange"
        />
        <StatCard
          label="Spend Confidence"
          value="Native"
          sub={
            data.assumptions.matched_keyword_spend_usd != null
              ? `${money(data.assumptions.matched_keyword_spend_usd)} matched to keyword layer`
              : "Exact Google + native Bing allocation"
          }
          color="default"
        />
      </div>

      <div className="bg-indigo-950 border border-indigo-700 rounded-xl px-5 py-4 mb-6">
        <div className="text-white font-semibold text-sm mb-2">First Real Flow</div>
        <div className="text-indigo-200 text-sm">
          Measurement truth → keyword economics → landing-page mismatch → partner risk → actions.
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">What To Do Now</div>
          <div className="space-y-2">
            {data.recommendations.map((item) => (
              <div key={item} className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-sm font-medium text-gray-300 mb-3">Truth Warnings</div>
          <div className="space-y-2">
            {data.measurement_truth.warnings.map((item) => (
              <div key={item} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
                {item}
              </div>
            ))}
            <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
              Add to cart is shown only as a weighted proxy at {Math.round(data.assumptions.add_to_cart_share_of_purchase * 100)}% of purchase value.
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div className="text-sm font-medium text-gray-300 mb-3">Google Ad Copy Alerts</div>
        <div className="space-y-3">
          {data.google_ad_copy_alerts.map((row) => (
            <div key={row.ad_id} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-white font-medium">{row.campaign_name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Strength: {row.ad_strength || "unknown"} · Approval: {row.approval_status || "unknown"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-rose-300 font-medium">{money(row.spend)}</div>
                  <div className="text-xs text-gray-500">{row.net_purchases} purchases</div>
                </div>
              </div>
              <div className="text-sm text-amber-200 mt-2">
                Purchase profit: {money(row.purchase_profit)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-300">Keywords That Worked</div>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-gray-500">
              <tr>
                <th className="text-left py-2 px-3 font-medium">Keyword</th>
                <th className="text-right py-2 px-3 font-medium">Purch</th>
                <th className="text-right py-2 px-3 font-medium">Spend</th>
                <th className="text-right py-2 px-3 font-medium">Profit</th>
                <th className="text-right py-2 px-3 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {data.winning_keywords.slice(0, 10).map((row) => (
                <tr key={`${row.platform}-${row.keyword}`} className="border-b border-gray-800/50 align-top">
                  <td className="py-2 px-3">
                    <div className="text-gray-200 font-medium">{row.keyword}</div>
                    <div className="text-xs text-gray-500 mt-1">{row.platform} · {row.top_campaign}</div>
                    <div className="text-xs text-gray-600 truncate mt-1">{row.top_landing_page}</div>
                    <div className="text-xs text-emerald-300 mt-1">{row.diagnosis}</div>
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-medium">{row.net_purchases}</td>
                  <td className="py-2 px-3 text-right text-gray-300">{money(row.estimated_spend)}</td>
                  <td className="py-2 px-3 text-right text-emerald-300">{money(row.purchase_profit)}</td>
                  <td className="py-2 px-3 text-right text-cyan-300">{row.purchase_roi_pct == null ? "—" : `${row.purchase_roi_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800 px-4 py-3 text-sm font-medium text-gray-300">Keywords Wasting Money</div>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-gray-500">
              <tr>
                <th className="text-left py-2 px-3 font-medium">Keyword</th>
                <th className="text-right py-2 px-3 font-medium">Spend</th>
                <th className="text-right py-2 px-3 font-medium">Gap</th>
                <th className="text-right py-2 px-3 font-medium">ATC</th>
                <th className="text-right py-2 px-3 font-medium">ROI</th>
              </tr>
            </thead>
            <tbody>
              {data.wasted_keywords.slice(0, 10).map((row) => (
                <tr key={`${row.platform}-${row.keyword}`} className="border-b border-gray-800/50 align-top">
                  <td className="py-2 px-3">
                    <div className="text-gray-200 font-medium">{row.keyword}</div>
                    <div className="text-xs text-gray-500 mt-1">{row.platform} · {row.top_campaign}</div>
                    <div className="text-xs text-gray-600 truncate mt-1">{row.top_landing_page}</div>
                    <div className="text-xs text-rose-300 mt-1">{row.diagnosis}</div>
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">{money(row.estimated_spend)}</td>
                  <td className="py-2 px-3 text-right text-rose-300">{money(row.profit_gap_to_break_even)}</td>
                  <td className="py-2 px-3 text-right text-purple-300">{row.add_to_carts}</td>
                  <td className="py-2 px-3 text-right text-rose-300">{row.purchase_roi_pct == null ? "—" : `${row.purchase_roi_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="text-sm font-medium text-gray-300 mb-3">Landing Pages To Review First</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.landing_page_alerts.slice(0, 8).map((row) => (
            <div key={`${row.platform}-${row.landing_page_path}`} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-3">
              <div className="text-sm text-gray-200 font-medium truncate">{row.landing_page_path}</div>
              <div className="text-xs text-gray-500 mt-1">{row.platform}</div>
              <div className="text-sm text-gray-300 mt-2">
                {row.quiz_starts.toLocaleString()} high-intent entries · {row.net_purchases} net purchases · {row.purchase_rate == null ? "—" : `${row.purchase_rate}% purchase rate`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
