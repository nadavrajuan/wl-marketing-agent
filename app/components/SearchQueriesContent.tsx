"use client";

import { useEffect, useState, useMemo } from "react";

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

type SortKey =
  | "search_query"
  | "mapped_keyword"
  | "clicks"
  | "spend"
  | "estimated_net_purchases"
  | "estimated_purchase_profit"
  | "estimated_purchase_roi_pct"
  | "top_campaign";

type SortDir = "asc" | "desc";

interface ClusterTerm {
  search_query: string;
  clicks: number;
  spend: number;
}

interface Cluster {
  cluster_id: number;
  label: string;
  description: string;
  gap_signal: boolean;
  term_count: number;
  total_clicks: number;
  terms: ClusterTerm[];
}

interface ClusterResult {
  clusters: Cluster[];
  total_terms: number;
  k: number;
  error?: string;
}

const NUMERIC_COLS: SortKey[] = [
  "clicks",
  "spend",
  "estimated_net_purchases",
  "estimated_purchase_profit",
  "estimated_purchase_roi_pct",
];

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <svg viewBox="0 0 8 12" className="w-2 h-3 opacity-25 ml-1 inline" fill="currentColor">
        <path d="M4 0L7 4H1L4 0zM4 12L1 8H7L4 12z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 8 12" className="w-2 h-3 opacity-80 ml-1 inline text-indigo-400" fill="currentColor">
      {dir === "asc" ? <path d="M4 0L7 4H1L4 0z" /> : <path d="M4 12L1 8H7L4 12z" />}
    </svg>
  );
}

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (col: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`py-2 px-3 font-medium cursor-pointer select-none hover:text-gray-200 transition-colors whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {label}
      <SortIcon active={active} dir={sortDir} />
    </th>
  );
}

export default function SearchQueriesContent() {
  const [data, setData] = useState<SearchQueryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Clustering state
  const [clustering, setClustering] = useState(false);
  const [clusterResult, setClusterResult] = useState<ClusterResult | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"table" | "clusters">("table");

  useEffect(() => {
    fetch("/api/search-queries?limit=150")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  function handleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(NUMERIC_COLS.includes(col) ? "desc" : "asc");
    }
  }

  const filtered = useMemo(
    () =>
      data.filter((row) => !search || row.search_query.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );

  const rows = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const isNum = NUMERIC_COLS.includes(sortKey);
      const va = isNum ? Number(a[sortKey] ?? 0) || 0 : String(a[sortKey] ?? "").toLowerCase();
      const vb = isNum ? Number(b[sortKey] ?? 0) || 0 : String(b[sortKey] ?? "").toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  async function runClustering() {
    setClustering(true);
    setClusterResult(null);
    try {
      const res = await fetch("/api/search-queries/cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200 }),
      });
      const result: ClusterResult = await res.json();
      setClusterResult(result);
      setActiveTab("clusters");
    } catch {
      setClusterResult({ clusters: [], total_terms: 0, k: 0, error: "Request failed" });
    } finally {
      setClustering(false);
    }
  }

  function toggleCluster(id: number) {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Search Terms</h1>
        <p className="text-gray-400 text-sm mt-1">
          Google-only search query diagnostics using native SearchQueryStats. Purchases are estimated from click-share within each keyword-day.
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64"
          placeholder="Filter queries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-gray-700 overflow-hidden text-sm">
          <button
            onClick={() => setActiveTab("table")}
            className={`px-3 py-1.5 transition-colors ${activeTab === "table" ? "bg-indigo-600 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}
          >
            Table
          </button>
          <button
            onClick={() => setActiveTab("clusters")}
            className={`px-3 py-1.5 transition-colors ${activeTab === "clusters" ? "bg-indigo-600 text-white" : "bg-gray-900 text-gray-400 hover:text-gray-200"}`}
          >
            Clusters {clusterResult ? `(${clusterResult.clusters.length})` : ""}
          </button>
        </div>

        <button
          onClick={runClustering}
          disabled={clustering || loading}
          className="ml-auto flex items-center gap-2 rounded-lg border border-indigo-700 bg-indigo-950 px-3 py-1.5 text-sm font-medium text-indigo-200 hover:border-indigo-500 disabled:opacity-50 transition-colors"
        >
          {clustering ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
              </svg>
              Clustering…
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <circle cx="4" cy="4" r="2.5" /><circle cx="12" cy="4" r="2.5" /><circle cx="4" cy="12" r="2.5" /><circle cx="12" cy="12" r="2.5" />
                <path d="M4 6.5v3M12 6.5v3M6.5 4h3M6.5 12h3" strokeWidth="1.5" stroke="currentColor" fill="none" />
              </svg>
              Cluster Search Terms
            </>
          )}
        </button>
      </div>

      {/* Table view */}
      {activeTab === "table" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800">
                <tr className="text-gray-400">
                  <SortTh label="Search Query" col="search_query" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Mapped Keyword" col="mapped_keyword" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Clicks" col="clicks" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortTh label="Spend" col="spend" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortTh label="Est. Purchases" col="estimated_net_purchases" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortTh label="Est. Profit" col="estimated_purchase_profit" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortTh label="ROI%" col="estimated_purchase_roi_pct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortTh label="Campaign / LP" col="top_campaign" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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
      )}

      {/* Clusters view */}
      {activeTab === "clusters" && (
        <div>
          {!clusterResult && !clustering && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-10 text-center text-sm text-gray-400">
              Click <span className="text-indigo-300 font-medium">Cluster Search Terms</span> to embed and group your top queries using ML.
            </div>
          )}

          {clustering && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-10 text-center">
              <div className="text-sm text-gray-400">Embedding {data.length > 0 ? "up to 200" : ""} queries, running k-means, labeling with GPT…</div>
              <div className="mt-3 text-xs text-gray-600">This takes ~20–40 seconds</div>
            </div>
          )}

          {clusterResult?.error && (
            <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-5 py-4 text-sm text-rose-200">
              Clustering failed: {clusterResult.error}
            </div>
          )}

          {clusterResult && !clusterResult.error && clusterResult.clusters.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 mb-4">
                {clusterResult.total_terms} queries → {clusterResult.k} clusters · sorted by volume
              </div>
              {clusterResult.clusters.map((cluster) => {
                const expanded = expandedClusters.has(cluster.cluster_id);
                return (
                  <div
                    key={cluster.cluster_id}
                    className={`rounded-xl border bg-gray-900 overflow-hidden transition-all ${
                      cluster.gap_signal ? "border-amber-700" : "border-gray-800"
                    }`}
                  >
                    <button
                      onClick={() => toggleCluster(cluster.cluster_id)}
                      className="w-full px-5 py-3.5 flex items-start justify-between gap-4 text-left hover:bg-gray-800/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{cluster.label}</span>
                          {cluster.gap_signal && (
                            <span className="rounded-full border border-amber-700 bg-amber-950/40 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-amber-300">
                              Gap signal
                            </span>
                          )}
                        </div>
                        {cluster.description && (
                          <div className="mt-1 text-xs text-gray-400">{cluster.description}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium text-white">{cluster.total_clicks.toLocaleString()} clicks</div>
                        <div className="text-xs text-gray-500">{cluster.term_count} terms</div>
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-gray-800 px-5 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-gray-800">
                              <th className="text-left py-1.5 font-medium">Query</th>
                              <th className="text-right py-1.5 font-medium">Clicks</th>
                              <th className="text-right py-1.5 font-medium">Spend</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cluster.terms.map((t) => (
                              <tr key={t.search_query} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                                <td className="py-1.5 text-gray-300">{t.search_query}</td>
                                <td className="py-1.5 text-right text-gray-400">{t.clicks.toLocaleString()}</td>
                                <td className="py-1.5 text-right text-gray-400">${t.spend.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
