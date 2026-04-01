"use client";
import { useEffect, useState, useCallback } from "react";

interface Row {
  id: number;
  conversion_at: string;
  funnel_step: string;
  affiliate: string | null;
  value: string;
  platform_id: string;
  device: string;
  match_type: string;
  keyword: string | null;
  utm_campaign: string | null;
  campaign_id: string;
  adgroup_id: string;
  dti: string | null;
  landing_page_path: string | null;
  user_country: string | null;
}

interface Result {
  total: number;
  page: number;
  limit: number;
  rows: Row[];
}

const DEVICE_LABELS: Record<string, string> = { c: "Desktop", m: "Mobile", t: "Tablet" };
const MATCH_LABELS: Record<string, string> = { e: "Exact", p: "Phrase", b: "Broad" };
const FUNNEL_COLORS: Record<string, string> = {
  "Quiz Start": "bg-indigo-900 text-indigo-300",
  "Quiz Complete": "bg-purple-900 text-purple-300",
  "Add to Cart": "bg-yellow-900 text-yellow-300",
  Purchase: "bg-emerald-900 text-emerald-300",
  Lead: "bg-blue-900 text-blue-300",
  Other: "bg-gray-700 text-gray-400",
};

export default function ExplorerContent() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [filters, setFilters] = useState({
    platform: "",
    device: "",
    match_type: "",
    funnel_step: "",
    affiliate: "",
    keyword: "",
    date_from: "",
    date_to: "",
  });

  const fetch_data = useCallback(
    (p = 1) => {
      setLoading(true);
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      params.set("page", String(p));
      params.set("limit", "50");
      fetch(`/api/conversions?${params}`)
        .then((r) => r.json())
        .then((d) => { setResult(d); setLoading(false); });
    },
    [filters]
  );

  useEffect(() => {
    setPage(1);
    fetch_data(1);
  }, [filters, fetch_data]);

  const totalPages = result ? Math.ceil(result.total / result.limit) : 1;

  const setFilter = (key: string, val: string) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Data Explorer</h1>
        <p className="text-gray-400 text-sm mt-1">Browse, filter, and search raw conversion events</p>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5 flex flex-wrap gap-3">
        {[
          { key: "platform", label: "Platform", opts: [["bing","Bing"],["google","Google"],["organic","Organic"]] },
          { key: "device", label: "Device", opts: [["c","Desktop"],["m","Mobile"],["t","Tablet"]] },
          { key: "match_type", label: "Match", opts: [["e","Exact"],["p","Phrase"],["b","Broad"]] },
          { key: "funnel_step", label: "Funnel", opts: [["Quiz Start","Quiz Start"],["Quiz Complete","Quiz Complete"],["Add to Cart","Add to Cart"],["Purchase","Purchase"],["Lead","Lead"]] },
          { key: "affiliate", label: "Affiliate", opts: [["Medvi","Medvi"],["Ro","Ro"],["SkinnyRX","SkinnyRX"],["Sprout","Sprout"],["Eden","Eden"],["Hers","Hers"],["Remedy","Remedy"]] },
        ].map(({ key, label, opts }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">{label}</label>
            <select
              className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5"
              value={(filters as Record<string,string>)[key]}
              onChange={(e) => setFilter(key, e.target.value)}
            >
              <option value="">All</option>
              {opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Keyword</label>
          <input
            className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5 w-40"
            placeholder="search..."
            value={filters.keyword}
            onChange={(e) => setFilter("keyword", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">From</label>
          <input
            type="date"
            className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5"
            value={filters.date_from}
            onChange={(e) => setFilter("date_from", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">To</label>
          <input
            type="date"
            className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1.5"
            value={filters.date_to}
            onChange={(e) => setFilter("date_to", e.target.value)}
          />
        </div>
      </div>

      {result && (
        <div className="text-sm text-gray-400 mb-3">
          {result.total.toLocaleString()} results · page {page} of {totalPages}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-gray-800">
              <tr className="text-gray-500">
                <th className="text-left py-2 px-3">Time</th>
                <th className="text-left py-2 px-3">Funnel Step</th>
                <th className="text-left py-2 px-3">Affiliate</th>
                <th className="text-right py-2 px-3">Value</th>
                <th className="text-left py-2 px-3">Platform</th>
                <th className="text-left py-2 px-3">Device</th>
                <th className="text-left py-2 px-3">Match</th>
                <th className="text-left py-2 px-3">Keyword</th>
                <th className="text-left py-2 px-3">DTI Variant</th>
                <th className="text-left py-2 px-3">Campaign</th>
              </tr>
            </thead>
            <tbody>
              {result?.rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-800/40 hover:bg-gray-800/30">
                  <td className="py-1.5 px-3 text-gray-500">
                    {new Date(row.conversion_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-1.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${FUNNEL_COLORS[row.funnel_step] || FUNNEL_COLORS.Other}`}>
                      {row.funnel_step}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-gray-300">{row.affiliate || "—"}</td>
                  <td className="py-1.5 px-3 text-right text-emerald-400">
                    {Number(row.value) > 0 ? `$${Number(row.value).toFixed(0)}` : "—"}
                  </td>
                  <td className="py-1.5 px-3 text-gray-400">{row.platform_id}</td>
                  <td className="py-1.5 px-3 text-gray-400">{DEVICE_LABELS[row.device] || row.device}</td>
                  <td className="py-1.5 px-3 text-gray-400">{MATCH_LABELS[row.match_type] || row.match_type || "—"}</td>
                  <td className="py-1.5 px-3 text-gray-300 max-w-[160px] truncate">{row.keyword || "—"}</td>
                  <td className="py-1.5 px-3 text-purple-400">{row.dti || "—"}</td>
                  <td className="py-1.5 px-3 text-gray-500 max-w-[140px] truncate">{row.utm_campaign || row.campaign_id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {result && totalPages > 1 && (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => { setPage((p) => Math.max(1, p - 1)); fetch_data(Math.max(1, page - 1)); }}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300 disabled:opacity-40 hover:bg-gray-700"
          >← Prev</button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button
            onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); fetch_data(Math.min(totalPages, page + 1)); }}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300 disabled:opacity-40 hover:bg-gray-700"
          >Next →</button>
        </div>
      )}
    </div>
  );
}
