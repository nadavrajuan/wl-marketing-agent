"use client";

import { useEffect, useState } from "react";

interface SearchQueryRow {
  platform_id: string;
  search_query: string;
  top_campaign: string | null;
  mapped_keyword: string | null;
  landing_pages: string | null;
  search_query_match_type: string | null;
  search_query_status: string | null;
  keyword_match_type: string | null;
  keyword_status: string | null;
  quality_score: string | null;
  impressions: string;
  clicks: string;
  spend: string;
  matched_click_visits: string;
  estimated_add_to_carts: string;
  estimated_net_purchases: string;
  estimated_purchase_revenue: string;
  estimated_purchase_profit: string;
  estimated_purchase_roi_pct: string | null;
  click_to_visit_match_pct: string | null;
  attribution_confidence: string;
}

export default function SearchQueriesContent() {
  const [data, setData] = useState<SearchQueryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/search-queries?limit=150")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  const rows = data.filter((row) => !search || row.search_query.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Search Terms</h1>
        <p className="text-gray-400 text-sm mt-1">
          Google-only search query diagnostics using native SearchQueryStats. Purchases are estimated from click-share within each keyword-day.
        </p>
      </div>

      <div className="mb-5">
        <input
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-72"
          placeholder="Search query..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr className="text-gray-400">
                <th className="text-left py-2 px-3 font-medium">Search Query</th>
                <th className="text-left py-2 px-3 font-medium">Mapped Keyword</th>
                <th className="text-right py-2 px-3 font-medium">Clicks</th>
                <th className="text-right py-2 px-3 font-medium">Spend</th>
                <th className="text-right py-2 px-3 font-medium">Est. Purchases</th>
                <th className="text-right py-2 px-3 font-medium">Est. Profit</th>
                <th className="text-right py-2 px-3 font-medium">ROI%</th>
                <th className="text-left py-2 px-3 font-medium">Campaign / LP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.search_query} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 px-3">
                    <div className="text-gray-200">{row.search_query}</div>
                    <div className="text-xs text-gray-500">
                      {row.search_query_match_type || "—"} · {row.search_query_status || "—"} · match {row.click_to_visit_match_pct || "—"}%
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="text-gray-300">{row.mapped_keyword || "—"}</div>
                    <div className="text-xs text-gray-500">
                      {row.keyword_match_type || "—"} · {row.keyword_status || "—"}
                      {row.quality_score ? ` · QS ${row.quality_score}` : ""}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">{Number(row.clicks).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-300">${Number(row.spend).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-emerald-400">{Number(row.estimated_net_purchases).toFixed(2)}</td>
                  <td className={`py-2 px-3 text-right font-medium ${Number(row.estimated_purchase_profit) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ${Number(row.estimated_purchase_profit).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right text-blue-400">{row.estimated_purchase_roi_pct ? `${row.estimated_purchase_roi_pct}%` : "—"}</td>
                  <td className="py-2 px-3 max-w-[260px]">
                    <div className="text-gray-300 truncate">{row.top_campaign || "—"}</div>
                    <div className="text-xs text-gray-500 truncate">{row.landing_pages || "—"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
