"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import FilterBar from "./FilterBar";

interface Campaign {
  campaign_id: string;
  campaign_name: string | null;
  platform: string;
  visits: string;
  add_to_carts: string;
  purchases: string;
  purchase_revenue: string;
  add_to_cart_proxy_value: string;
  adgroup_count: string;
  keyword_count: string;
  spend: string;
  purchase_profit: string;
  proxy_profit: string;
  purchase_roi_pct: string | null;
  proxy_roi_pct: string | null;
  cost_per_purchase: string | null;
  purchase_rate_per_visit: string | null;
  click_to_visit_match_pct: string | null;
  avg_purchase_cycle_minutes: string | null;
}

const FILTERS = [
  {
    key: "platform",
    label: "Platform",
    options: [
      { value: "bing", label: "Bing" },
      { value: "google", label: "Google" },
      { value: "organic", label: "Organic" },
    ],
  },
];

export default function CampaignsContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof Campaign>("purchase_profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setLoading(true);
    const params = searchParams.toString();
    fetch(`/api/campaigns${params ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [searchParams]);

  const sorted = [...data].sort((a, b) => {
    const av = Number(a[sortKey]) || a[sortKey] || "";
    const bv = Number(b[sortKey]) || b[sortKey] || "";
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: keyof Campaign) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const th = (label: string, key: keyof Campaign) => (
    <th
      className="text-right py-2 px-3 font-medium text-gray-400 cursor-pointer hover:text-white whitespace-nowrap"
      onClick={() => toggleSort(key)}
    >
      {label} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Campaigns</h1>
        <p className="text-gray-400 text-sm mt-1">{data.length} campaigns · purchase-first economics by campaign</p>
      </div>

      <FilterBar filters={FILTERS} />

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Campaign</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Platform</th>
                {th("Visits", "visits")}
                {th("ATC", "add_to_carts")}
                {th("Purchases", "purchases")}
                {th("Spend", "spend")}
                {th("CPA", "cost_per_purchase")}
                {th("Revenue", "purchase_revenue")}
                {th("Profit", "purchase_profit")}
                {th("ROI%", "purchase_roi_pct")}
                {th("Visit CVR%", "purchase_rate_per_visit")}
                {th("Click→Visit%", "click_to_visit_match_pct")}
                {th("Cycle Min", "avg_purchase_cycle_minutes")}
                {th("Ad Groups", "adgroup_count")}
                {th("Keywords", "keyword_count")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.campaign_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 px-3 max-w-[220px]">
                    <div className="text-gray-200 truncate text-xs">{c.campaign_name || "—"}</div>
                    <div className="text-gray-500 text-xs">{c.campaign_id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.platform === "bing" ? "bg-blue-900 text-blue-300" :
                      c.platform === "google" ? "bg-emerald-900 text-emerald-300" :
                      "bg-gray-700 text-gray-300"
                    }`}>{c.platform}</span>
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">{Number(c.visits).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-amber-300">{Number(c.add_to_carts).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-medium">{Number(c.purchases).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-300">${Number(c.spend || 0).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-cyan-400">
                    {c.cost_per_purchase ? `$${Number(c.cost_per_purchase).toFixed(0)}` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-yellow-400">${Number(c.purchase_revenue).toLocaleString()}</td>
                  <td className={`py-2 px-3 text-right font-medium ${Number(c.purchase_profit) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    ${Number(c.purchase_profit).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right text-blue-400">{c.purchase_roi_pct ? `${c.purchase_roi_pct}%` : "—"}</td>
                  <td className="py-2 px-3 text-right text-indigo-300">{c.purchase_rate_per_visit ? `${c.purchase_rate_per_visit}%` : "—"}</td>
                  <td className="py-2 px-3 text-right text-gray-400">{c.click_to_visit_match_pct ? `${c.click_to_visit_match_pct}%` : "—"}</td>
                  <td className="py-2 px-3 text-right text-gray-400">{c.avg_purchase_cycle_minutes ? Number(c.avg_purchase_cycle_minutes).toFixed(1) : "—"}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{c.adgroup_count}</td>
                  <td className="py-2 px-3 text-right text-gray-500">{c.keyword_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
