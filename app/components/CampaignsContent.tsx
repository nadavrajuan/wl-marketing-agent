"use client";
import { useEffect, useState } from "react";
import FilterBar from "./FilterBar";

interface Campaign {
  campaign_id: string;
  campaign_name: string | null;
  platform: string;
  total_events: string;
  quiz_starts: string;
  quiz_completes: string;
  purchases: string;
  revenue: string;
  avg_order_value: string;
  adgroup_count: string;
  keyword_count: string;
  quiz_completion_rate: string | null;
  purchase_rate: string | null;
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
  const [data, setData] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof Campaign>("total_events");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setLoading(true);
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, []);

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
        <p className="text-gray-400 text-sm mt-1">{data.length} campaigns · click headers to sort</p>
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
                {th("Events", "total_events")}
                {th("Quiz Starts", "quiz_starts")}
                {th("Completions", "quiz_completes")}
                {th("Purchases", "purchases")}
                {th("Revenue", "revenue")}
                {th("Avg Order", "avg_order_value")}
                {th("Quiz CVR%", "quiz_completion_rate")}
                {th("Purch CVR%", "purchase_rate")}
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
                  <td className="py-2 px-3 text-right text-gray-300">{Number(c.total_events).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-400">{Number(c.quiz_starts).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-400">{Number(c.quiz_completes).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-medium">{Number(c.purchases).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-yellow-400">${Number(c.revenue).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-gray-400">${Number(c.avg_order_value).toFixed(0)}</td>
                  <td className="py-2 px-3 text-right text-purple-400">{c.quiz_completion_rate ? `${c.quiz_completion_rate}%` : "—"}</td>
                  <td className="py-2 px-3 text-right text-blue-400">{c.purchase_rate ? `${c.purchase_rate}%` : "—"}</td>
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
