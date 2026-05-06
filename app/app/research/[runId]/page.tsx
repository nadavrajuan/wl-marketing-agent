"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";

interface ResearchStep {
  step_number: number;
  action_type: string;
  title: string;
  thought: string;
  data_source: string;
  data_result: string;
  finding_type: string;
  finding_content: string;
  confidence: string;
  created_at: string;
}

interface ReportSection {
  id: string;
  type: string;
  title: string;
  content: string;
  evidence?: string[];
  confidence?: string;
  impact?: string;
  effort?: string;
  metric?: string;
  tags?: string[];
}

interface ResearchRun {
  run_id: string;
  status: string;
  created_at: string;
  starting_point_type: string;
  starting_point_value: string;
  starting_point_reason: string;
  depth: string;
  research_plan: string;
  slides: ReportSection[];
  findings: object[];
  executive_summary: string;
  iteration_count: number;
  duration_seconds: number | null;
  error_log: string[];
  steps: ResearchStep[];
}

interface LiveStep {
  step_number: number;
  action_type: string;
  title: string;
  thought: string;
}

const ACTION_ICONS: Record<string, string> = {
  select_starting_point: "📍",
  build_plan: "🧭",
  query_data: "🗃️",
  query_bigquery: "🗃️",
  crawl_url: "🌐",
  record_finding: "📌",
  change_direction: "↩️",
  generate_slides: "📄",
  finish: "✓",
  error: "⚠️",
};

const SECTION_STYLES: Record<string, { border: string; header: string; icon: string }> = {
  data:          { border: "border-cyan-800/60",   header: "bg-cyan-950/40",   icon: "📊" },
  findings:      { border: "border-blue-800/60",   header: "bg-blue-950/40",   icon: "📌" },
  analysis:      { border: "border-violet-800/60", header: "bg-violet-950/40", icon: "🔬" },
  recommendations:{ border: "border-green-800/60", header: "bg-green-950/40",  icon: "🎯" },
  open_questions:{ border: "border-amber-800/60",  header: "bg-amber-950/40",  icon: "❓" },
};

function fallbackStyle() {
  return { border: "border-gray-700", header: "bg-gray-800/40", icon: "○" };
}

// Markdown renderer: tables, bold, bullets, headers
function Markdown({ text }: { text: string }) {
  if (!text) return null;

  // Parse pipe tables
  const tablePattern = /^(\|.+\|\s*\n)((?:\|[-: ]+\|[-: |\s]*\n))(\|.+\|\s*\n)*/m;

  const blocks = splitOnTables(text);

  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => {
        if (block.type === "table") {
          return <DataTable key={bi} raw={block.content} />;
        }
        return (
          <div key={bi} className="space-y-1.5">
            {block.content.split("\n").map((line, li) => {
              if (/^#{1,3} /.test(line)) {
                const lvl = line.match(/^(#+)/)?.[1].length || 1;
                const text = line.replace(/^#+\s*/, "");
                return (
                  <div key={li} className={`font-semibold text-white ${lvl === 1 ? "text-base mt-4" : "text-sm mt-2"} first:mt-0`}>
                    {text}
                  </div>
                );
              }
              if (/^[-•*]\s/.test(line)) {
                return (
                  <div key={li} className="flex gap-2 text-sm text-gray-300">
                    <span className="text-gray-600 shrink-0 mt-0.5">•</span>
                    <span dangerouslySetInnerHTML={{ __html: boldify(line.slice(2)) }} />
                  </div>
                );
              }
              if (/^\d+\.\s/.test(line)) {
                const [num, ...rest] = line.split(/\.\s(.+)/);
                return (
                  <div key={li} className="flex gap-2 text-sm text-gray-300">
                    <span className="text-gray-500 shrink-0 font-mono">{num}.</span>
                    <span dangerouslySetInnerHTML={{ __html: boldify(rest.join("")) }} />
                  </div>
                );
              }
              if (line.trim() === "") return <div key={li} className="h-1" />;
              return (
                <p key={li} className="text-sm text-gray-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: boldify(line) }} />
              );
            })}
          </div>
        );
      })}
    </div>
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function _unused() { return tablePattern; } // suppress unused warning
}

function boldify(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
}

function splitOnTables(text: string): Array<{ type: "text" | "table"; content: string }> {
  const result: Array<{ type: "text" | "table"; content: string }> = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Detect start of a pipe table
    if (lines[i].trim().startsWith("|") && i + 1 < lines.length && /^\|[-: |]+\|/.test(lines[i + 1])) {
      let tableEnd = i;
      while (tableEnd < lines.length && (lines[tableEnd].trim().startsWith("|") || lines[tableEnd].trim() === "")) {
        if (!lines[tableEnd].trim().startsWith("|")) break;
        tableEnd++;
      }
      result.push({ type: "table", content: lines.slice(i, tableEnd).join("\n") });
      i = tableEnd;
    } else {
      // Accumulate non-table lines
      const start = i;
      while (i < lines.length && !(lines[i].trim().startsWith("|") && i + 1 < lines.length && /^\|[-: |]+\|/.test(lines[i + 1]))) {
        i++;
      }
      const chunk = lines.slice(start, i).join("\n").trim();
      if (chunk) result.push({ type: "text", content: chunk });
    }
  }

  return result;
}

function DataTable({ raw }: { raw: string }) {
  const lines = raw.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return <pre className="text-xs text-gray-400 font-mono">{raw}</pre>;

  const parseRow = (line: string) =>
    line.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);

  const headers = parseRow(lines[0]);
  const bodyRows = lines.slice(2).map(parseRow); // skip separator row

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-950">
      <table className="text-xs w-full">
        <thead className="border-b border-gray-700">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-gray-300 whitespace-nowrap font-mono">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResearchRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();

  const [run, setRun] = useState<ResearchRun | null>(null);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [viewMode, setViewMode] = useState<"report" | "trail">("report");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [polling, setPolling] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchRun = async () => {
    try {
      const res = await fetch(`/api/research/${runId}`);
      if (!res.ok) {
        setLoading(false);
        return undefined;
      }
      const data: ResearchRun = await res.json();
      setRun(data);
      setLoading(false);
      return data;
    } catch {
      setLoading(false);
      setFetchError(true);
      return undefined;
    }
  };

  useEffect(() => {
    fetchRun().then((data) => {
      if (data?.status === "running") {
        startStream();
        setPolling(true);
      }
    });
    return () => { eventSourceRef.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  function startStream() {
    if (eventSourceRef.current) return;
    const es = new EventSource(`/api/research/${runId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.event === "step") {
          setLiveSteps((prev) => {
            if (prev.find((s) => s.step_number === payload.step.step_number)) return prev;
            return [...prev, payload.step];
          });
        }
        if (payload.event === "done") {
          es.close();
          eventSourceRef.current = null;
          setPolling(false);
          fetchRun();
        }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setPolling(false);
      const interval = setInterval(() => {
        fetchRun().then((data) => {
          if (data?.status !== "running") clearInterval(interval);
        }).catch(() => clearInterval(interval));
      }, 3000);
    };
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>;
  }

  if (fetchError || !run) {
    return (
      <div className="text-center text-gray-500 text-sm py-16 space-y-3">
        <div>{fetchError ? "Could not load this run." : "Run not found."}</div>
        <button onClick={() => router.push("/research")} className="text-indigo-400 hover:underline">
          ← Back to Research
        </button>
      </div>
    );
  }

  const isRunning = run.status === "running";
  const sections = run.slides || [];
  const allSteps = isRunning ? liveSteps : run.steps || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/research")} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Research
          </button>
          <div className="text-gray-700">/</div>
          <div className="text-sm text-gray-300 font-medium">
            <span className="text-gray-500">[{run.starting_point_type}]</span>{" "}
            {run.starting_point_value || "Agent chose"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {run.iteration_count > 0 && (
            <span className="text-xs text-gray-600">{run.iteration_count} steps</span>
          )}
          {run.duration_seconds && (
            <span className="text-xs text-gray-600">{Math.round(run.duration_seconds)}s</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            run.status === "completed" ? "bg-green-950 text-green-400"
            : run.status === "running" ? "bg-yellow-950 text-yellow-400"
            : "bg-red-950 text-red-400"
          }`}>
            {run.status}
          </span>
          {!isRunning && sections.length > 0 && (
            <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
              <button
                onClick={() => setViewMode("report")}
                className={`px-3 py-1.5 transition-colors ${viewMode === "report" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Report
              </button>
              <button
                onClick={() => setViewMode("trail")}
                className={`px-3 py-1.5 transition-colors ${viewMode === "trail" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Trail
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Why this starting point */}
      {run.starting_point_reason && !isRunning && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3 text-sm text-gray-400 italic">
          {run.starting_point_reason}
        </div>
      )}

      {/* Live progress */}
      {isRunning && (
        <div className="rounded-2xl border border-yellow-800/40 bg-yellow-950/20 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <div className="text-sm font-semibold text-yellow-300">Investigating…</div>
            <div className="text-xs text-yellow-700 ml-auto">{allSteps.length} steps so far</div>
          </div>
          {allSteps.length > 0 && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {allSteps.map((s) => (
                <div key={s.step_number} className="flex items-start gap-2 text-xs text-gray-400">
                  <span className="shrink-0 mt-0.5">{ACTION_ICONS[s.action_type] || "○"}</span>
                  <span>{s.title || s.thought || s.action_type}</span>
                </div>
              ))}
              {polling && (
                <div className="flex items-center gap-2 text-xs text-gray-600 animate-pulse">
                  <span>⟳</span><span>Running…</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Report view */}
      {!isRunning && viewMode === "report" && sections.length > 0 && (
        <div className="space-y-5">
          {sections.map((section) => {
            const style = SECTION_STYLES[section.type] || fallbackStyle();
            return (
              <div key={section.id} className={`rounded-2xl border ${style.border} overflow-hidden`}>
                <div className={`${style.header} px-5 py-3 border-b ${style.border} flex items-center gap-2`}>
                  <span className="text-base">{style.icon}</span>
                  <span className="text-sm font-semibold text-white">{section.title}</span>
                  {section.confidence && (
                    <span className="ml-auto text-xs text-gray-500">{section.confidence} confidence</span>
                  )}
                </div>
                <div className="px-5 py-4 bg-gray-900">
                  <Markdown text={section.content} />
                  {section.evidence && section.evidence.length > 0 && (
                    <div className="mt-4 space-y-1.5 border-l-2 border-gray-700 pl-4">
                      {section.evidence.map((e, i) => (
                        <div key={i} className="text-sm text-gray-400">{e}</div>
                      ))}
                    </div>
                  )}
                  {section.tags && section.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {section.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trail view */}
      {!isRunning && viewMode === "trail" && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
            Investigation Trail — {run.steps?.length || 0} steps
          </div>
          {(run.steps || []).map((step) => (
            <div key={step.step_number} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span>{ACTION_ICONS[step.action_type] || "○"}</span>
                <span className="text-xs font-medium text-gray-400 uppercase">{step.action_type?.replace(/_/g, " ")}</span>
                <span className="text-gray-700 text-xs">#{step.step_number}</span>
              </div>
              {step.thought && <div className="text-sm text-gray-300 leading-relaxed">{step.thought}</div>}
              {step.data_source && (
                <details className="text-xs text-gray-600">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300 transition-colors">Show source</summary>
                  <pre className="mt-2 bg-gray-950 rounded p-3 overflow-x-auto text-gray-400 text-xs leading-relaxed whitespace-pre-wrap">{step.data_source}</pre>
                </details>
              )}
              {step.data_result && (
                <details className="text-xs text-gray-600">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300 transition-colors">Show result</summary>
                  <pre className="mt-2 bg-gray-950 rounded p-3 overflow-x-auto text-gray-400 text-xs leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">{step.data_result}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Completed or failed with no sections */}
      {!isRunning && sections.length === 0 && (
        <div className={`rounded-2xl border p-8 text-center space-y-3 ${
          run.status === "failed" ? "border-red-900/50 bg-red-950/20" : "border-gray-800 bg-gray-900"
        }`}>
          <div className={`text-sm ${run.status === "failed" ? "text-red-400" : "text-gray-500"}`}>
            {run.status === "failed" ? "Research run failed." : "Research completed with no report sections."}
          </div>
          {run.executive_summary && (
            <div className="text-gray-300 text-sm max-w-lg mx-auto">{run.executive_summary}</div>
          )}
          {run.error_log?.length > 0 && (
            <div className="text-left mt-4 space-y-1">
              {run.error_log.map((e, i) => (
                <div key={i} className="text-xs text-red-400 font-mono bg-red-950/30 rounded px-3 py-1.5">{e}</div>
              ))}
            </div>
          )}
          <button onClick={() => router.push("/research")} className="text-indigo-400 hover:underline text-xs">
            ← Start a new run
          </button>
        </div>
      )}
    </div>
  );
}
