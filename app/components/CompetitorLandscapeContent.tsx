"use client";

import { useEffect, useMemo, useState } from "react";

type SourceRow = {
  slug: string;
  name: string;
  url: string;
  is_internal: boolean;
  seed_order: number;
  snapshot_date: string | null;
  fetched_at: string | null;
  page_title: string | null;
  meta_description: string | null;
  top_partners: string[];
  has_live_snapshot: boolean;
};

type MatrixValue = {
  partner: string | null;
  score: number | null;
  description: string | null;
};

type MatrixRow = {
  rank: number;
  values: Record<string, MatrixValue>;
};

type AlertRow = {
  id: number;
  source_slug: string;
  source_name: string;
  source_url: string;
  snapshot_date: string;
  alert_type: string;
  severity: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

type CompetitorLandscapeResponse = {
  summary: {
    source_count: number;
    unread_alert_count: number;
    changed_today_count: number;
    retention_days: number;
  };
  sources: SourceRow[];
  matrix: MatrixRow[];
  alerts: AlertRow[];
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function severityClass(severity: string) {
  if (severity === "high") return "border-rose-800 bg-rose-950/40 text-rose-200";
  if (severity === "medium") return "border-amber-800 bg-amber-950/30 text-amber-200";
  return "border-gray-700 bg-gray-900 text-gray-300";
}

function summaryCardTone(tone: "blue" | "green" | "orange" | "purple") {
  if (tone === "blue") return "border-sky-500/40 bg-sky-500/10";
  if (tone === "green") return "border-emerald-500/40 bg-emerald-500/10";
  if (tone === "orange") return "border-orange-500/40 bg-orange-500/10";
  return "border-violet-500/40 bg-violet-500/10";
}

function textDiff(details: Record<string, unknown>) {
  if (typeof details.before === "string" || typeof details.after === "string") {
    return {
      before: typeof details.before === "string" ? details.before : null,
      after: typeof details.after === "string" ? details.after : null,
    };
  }
  if (typeof details.before_text === "string" || typeof details.after_text === "string") {
    return {
      before: typeof details.before_text === "string" ? details.before_text : null,
      after: typeof details.after_text === "string" ? details.after_text : null,
    };
  }
  const before = details.before as { description?: string; marketing_lines?: string[] } | undefined;
  const after = details.after as { description?: string; marketing_lines?: string[] } | undefined;
  return {
    before:
      before?.description || (Array.isArray(before?.marketing_lines) ? before?.marketing_lines.join(" | ") : null),
    after: after?.description || (Array.isArray(after?.marketing_lines) ? after?.marketing_lines.join(" | ") : null),
  };
}

export default function CompetitorLandscapeContent() {
  const [data, setData] = useState<CompetitorLandscapeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showReadAlerts, setShowReadAlerts] = useState(false);
  const [showFullMatrix, setShowFullMatrix] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/competitor-landscape");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || `Request failed with status ${response.status}`);
      }
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load competitor landscape.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visibleAlerts = useMemo(() => {
    if (!data) return [];
    return showReadAlerts ? data.alerts : data.alerts.filter((alert) => !alert.is_read);
  }, [data, showReadAlerts]);

  const visibleMatrix = useMemo(() => {
    if (!data) return [];
    return showFullMatrix ? data.matrix : data.matrix.slice(0, 10);
  }, [data, showFullMatrix]);

  async function markRead(ids?: number[], markAll = false) {
    setSaving(true);
    try {
      const response = await fetch("/api/competitor-landscape/alerts/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(markAll ? { mark_all: true, read_by: "dashboard-user" } : { ids, read_by: "dashboard-user" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to mark alerts as read.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark alerts as read.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <div className="mt-10 text-center text-gray-400">Loading competitor landscape...</div>;
  }

  if (error && !data) {
    return (
      <div className="mt-10 rounded-xl border border-rose-800 bg-rose-950/30 px-5 py-4 text-sm text-rose-200">
        Competitor Landscape failed to load: {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.28em] text-cyan-300">Business Intelligence</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Competitor Landscape</h1>
          <p className="mt-2 max-w-4xl text-sm text-gray-400">
            Daily crawl and diff monitor for slide 9 competitor sources, including rank changes, partner moves, copy changes, and unread alerts with before/after context.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-gray-500">History</div>
          <div className="mt-1 text-lg font-semibold text-white">{data.summary.retention_days} days</div>
          <div className="mt-1 text-xs text-gray-500">Raw HTML retained for recent snapshots</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl border p-5 ${summaryCardTone("blue")}`}>
          <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Sources</div>
          <div className="mt-3 text-3xl font-semibold text-white">{data.summary.source_count}</div>
          <div className="mt-2 text-sm text-gray-500">Slide 9 source pages under monitoring</div>
        </div>
        <div className={`rounded-2xl border p-5 ${summaryCardTone("orange")}`}>
          <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Unread Alerts</div>
          <div className="mt-3 text-3xl font-semibold text-white">{data.summary.unread_alert_count}</div>
          <div className="mt-2 text-sm text-gray-500">Changes still waiting for review</div>
        </div>
        <div className={`rounded-2xl border p-5 ${summaryCardTone("green")}`}>
          <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Changed Today</div>
          <div className="mt-3 text-3xl font-semibold text-white">{data.summary.changed_today_count}</div>
          <div className="mt-2 text-sm text-gray-500">Source pages with new detected changes today</div>
        </div>
        <div className={`rounded-2xl border p-5 ${summaryCardTone("purple")}`}>
          <div className="text-xs uppercase tracking-[0.18em] text-gray-400">Readiness</div>
          <div className="mt-3 text-3xl font-semibold text-white">Daily</div>
          <div className="mt-2 text-sm text-gray-500">Designed for scheduled sync and alerting</div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">Current Landscape Matrix</div>
              <div className="mt-1 text-sm text-gray-500">
                Latest captured partner ranking across the slide 9 landscape sources. Column headers link to the monitored pages.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFullMatrix((current) => !current)}
              className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            >
              {showFullMatrix ? "Show top 10" : `Show all rows (${data.matrix.length})`}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1300px] w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-950 text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em]">Rank</th>
                {data.sources.map((source) => (
                  <th key={source.slug} className="min-w-[210px] px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.16em]">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200">
                      {source.name}
                    </a>
                    <div className="mt-1 text-[11px] normal-case tracking-normal text-gray-500">
                      {source.has_live_snapshot ? `Updated ${formatDate(source.snapshot_date)}` : "Seeded from slide"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleMatrix.map((row) => (
                <tr key={row.rank} className="border-t border-gray-800/80">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{row.rank}</td>
                  {data.sources.map((source) => {
                    const value = row.values[source.slug];
                    return (
                      <td key={`${row.rank}-${source.slug}`} className="px-4 py-3 align-top">
                        <div className="text-gray-200">{value?.partner || "—"}</div>
                        {value?.score != null && (
                          <div className="mt-1 text-xs text-amber-300">Score {value.score.toFixed(1)}</div>
                        )}
                        {value?.description && (
                          <div className="mt-1 text-xs text-gray-500 line-clamp-2">{value.description}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.matrix.length > 10 && (
          <div className="border-t border-gray-800 px-5 py-3 text-xs text-gray-500">
            Showing {visibleMatrix.length} of {data.matrix.length} rows. More than 10 usually means the parser needs review.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">Alerts</div>
              <div className="mt-1 text-sm text-gray-500">
                New partner entries, exits, rank shifts, score changes, and copy changes stay here until marked read.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowReadAlerts((current) => !current)}
                className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
              >
                {showReadAlerts ? "Hide read alerts" : "Show read alerts"}
              </button>
              <button
                type="button"
                disabled={saving || data.summary.unread_alert_count === 0}
                onClick={() => markRead(undefined, true)}
                className="rounded-xl border border-indigo-700 bg-indigo-950 px-3 py-2 text-xs font-medium text-indigo-200 transition-colors hover:border-indigo-500 disabled:opacity-50"
              >
                Mark all unread as read
              </button>
            </div>
          </div>
        </div>

        <div className="p-5">
          {visibleAlerts.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-4 text-sm text-gray-400">
              No alerts to show right now.
            </div>
          ) : (
            <div className="space-y-4">
              {visibleAlerts.map((alert) => {
                const diff = textDiff(alert.details);
                const beforePartner = (alert.details.before as { display_name?: string; rank?: number; score?: number | null } | undefined) || undefined;
                const afterPartner = (alert.details.after as { display_name?: string; rank?: number; score?: number | null } | undefined) || undefined;
                return (
                  <div key={alert.id} className={`rounded-2xl border p-4 ${severityClass(alert.severity)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-lg font-bold text-cyan-300">{alert.source_name}</span>
                          <span className="text-xs text-gray-500">{formatDate(alert.snapshot_date)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{alert.title}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-gray-300">
                            {alert.severity}
                          </span>
                          {!alert.is_read && (
                            <span className="rounded-full border border-cyan-700 bg-cyan-950/40 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-cyan-200">
                              Unread
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-sm text-gray-300">{alert.summary}</div>
                        <div className="mt-2 text-xs text-gray-500">
                          captured {formatDateTime(alert.created_at)}
                        </div>
                      </div>
                      {!alert.is_read && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => markRead([alert.id], false)}
                          className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:border-gray-500"
                        >
                          Mark read
                        </button>
                      )}
                    </div>

                    {(beforePartner || afterPartner || diff.before || diff.after) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Before</div>
                          {beforePartner && (
                            <div className="mt-2 text-sm text-gray-200">
                              {beforePartner.display_name || "—"}
                              {beforePartner.rank ? ` · rank ${beforePartner.rank}` : ""}
                              {beforePartner.score != null ? ` · score ${beforePartner.score}` : ""}
                            </div>
                          )}
                          <div className="mt-2 text-sm text-gray-400">{diff.before || "—"}</div>
                        </div>
                        <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-gray-500">After</div>
                          {afterPartner && (
                            <div className="mt-2 text-sm text-gray-200">
                              {afterPartner.display_name || "—"}
                              {afterPartner.rank ? ` · rank ${afterPartner.rank}` : ""}
                              {afterPartner.score != null ? ` · score ${afterPartner.score}` : ""}
                            </div>
                          )}
                          <div className="mt-2 text-sm text-gray-400">{diff.after || "—"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.sources.map((source) => (
          <div key={source.slug} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                  {source.name}
                </a>
                <div className="mt-1 text-xs text-gray-500">
                  {source.has_live_snapshot ? `Last snapshot ${formatDateTime(source.fetched_at)}` : "Seeded from deck only"}
                </div>
              </div>
              <div className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${source.is_internal ? "bg-indigo-950 text-indigo-200" : "bg-gray-800 text-gray-300"}`}>
                {source.is_internal ? "Internal" : "External"}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Page Title</div>
                <div className="mt-1 text-sm text-gray-200">{source.page_title || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Meta Description</div>
                <div className="mt-1 text-sm text-gray-400">{source.meta_description || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Top Partners</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {source.top_partners.map((partner) => (
                    <span key={`${source.slug}-${partner}`} className="rounded-full border border-gray-700 bg-gray-950 px-2.5 py-1 text-xs text-gray-300">
                      {partner}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
