"use client";
import { useEffect, useState } from "react";

interface KwRow {
  platform_id: string;
  keyword: string;
  top_campaign: string | null;
  top_landing_page: string | null;
  visits: string;
  add_to_carts: string;
  net_purchases: string;
  estimated_spend: string;
  purchase_revenue: string;
  purchase_profit: string;
  purchase_roi_pct: string | null;
  purchase_rate_per_visit: string | null;
  spend_confidence: string;
  keyword_match_type?: string | null;
  keyword_status?: string | null;
  quality_score?: string | null;
}

export default function KeywordsContent() {
  const [data, setData] = useState<KwRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [matchType, setMatchType] = useState("");
  const [sortKey, setSortKey] = useState<keyof KwRow>("purchase_profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (platform) params.set("platform", platform);
    if (matchType) params.set("match_type", matchType);
    fetch(`/api/keywords?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [platform, matchType]);

  const filtered = data.filter((d) =>
    !search || d.keyword.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const av = Number(a[sortKey]) || 0;
    const bv = Number(b[sortKey]) || 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const toggleSort = (key: keyof KwRow) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const th = (label: string, key: keyof KwRow) => (
    <th
      className="text-right py-2 px-3 font-medium text-gray-400 cursor-pointer hover:text-white"
      onClick={() => toggleSort(key)}
    >
      {label} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Keywords</h1>
        <p className="text-gray-400 text-sm mt-1">Purchase-first keyword economics. Google uses exact keyword-day spend and GCLID joins; Bing uses native ad-day spend allocated by matched visit share.</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-56"
          placeholder="Search keyword..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Platform</label>
          <select className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All</option>
            <option value="bing">Bing</option>
            <option value="google">Google</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Match Type</label>
          <select className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5" value={matchType} onChange={(e) => setMatchType(e.target.value)}>
            <option value="">All</option>
            <option value="e">Exact</option>
            <option value="p">Phrase</option>
            <option value="b">Broad</option>
          </select>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Keyword</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Platform</th>
                {th("Visits", "visits")}
                {th("ATC", "add_to_carts")}
                {th("Purchases", "net_purchases")}
                {th("Spend", "estimated_spend")}
                {th("Revenue", "purchase_revenue")}
                {th("Profit", "purchase_profit")}
                {th("ROI%", "purchase_roi_pct")}
                {th("CVR%", "purchase_rate_per_visit")}
                <th className="text-left py-2 px-3 font-medium text-gray-400">Top LP</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={`${row.platform_id}:${row.keyword}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 px-3">
                    <div className="text-gray-200">{row.keyword}</div>
                    <div className="text-xs text-gray-500">
                      {row.top_campaign || "—"}
                      {row.keyword_match_type ? ` · ${row.keyword_match_type}` : ""}
                      {row.quality_score ? ` · QS ${row.quality_score}` : ""}
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      row.platform_id === "google" ? "bg-emerald-900 text-emerald-300" : "bg-blue-900 text-blue-300"
                    }`}>{row.platform_id}</span>
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">{Number(row.visits).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-amber-300">{Number(row.add_to_carts).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-medium">{Number(row.net_purchases).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-300">${Number(row.estimated_spend || 0).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-yellow-400">${Number(row.purchase_revenue || 0).toLocaleString()}</td>
                  <td className={`py-2 px-3 text-right font-medium ${Number(row.purchase_profit) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ${Number(row.purchase_profit || 0).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {row.purchase_roi_pct ? (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        Number(row.purchase_roi_pct) >= 20 ? "bg-emerald-900 text-emerald-300" :
                        Number(row.purchase_roi_pct) >= 0 ? "bg-blue-900 text-blue-300" :
                        "bg-rose-950 text-rose-300"
                      }`}>{row.purchase_roi_pct}%</span>
                    ) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {row.purchase_rate_per_visit ? (
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        Number(row.purchase_rate_per_visit) >= 5 ? "bg-emerald-900 text-emerald-300" :
                        Number(row.purchase_rate_per_visit) >= 2 ? "bg-blue-900 text-blue-300" :
                        "bg-gray-800 text-gray-400"
                      }`}>{row.purchase_rate_per_visit}%</span>
                    ) : "—"}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-400 max-w-[220px] truncate">{row.top_landing_page || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
